"""SSE streaming chat endpoint (roadmap doc 06 §1-§5).

POST /api/chats/<chat_id>/stream   (chat_id may be "new")

Emits `text/event-stream` frames:
    event: meta   data: {"chat_id": "...", "message_id": "..."}
    event: status data: {"type": "tool_start"|"tool_end", ...}
    event: token  data: {"text": "..."}
    event: done   data: {"input_tokens": n, "output_tokens": m, "message_id": "..."}
    event: error  data: {"code": "over_limit"|"internal", "message": "..."}

Plain-Django streaming (no channels/websockets): the agent generator is wrapped
in a StreamingHttpResponse, which works under gunicorn/uvicorn WSGI workers.
The legacy blocking POST /api/chats/<id> stays untouched for old clients.
"""
import json
import logging
import uuid

from django.http import HttpResponse, JsonResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication

from bots.models import Bot, Chat, Profile
from bots.views.get_chat_response import (
    allowed_file,
    compress_and_upload_image,
)

logger = logging.getLogger(__name__)


def _sse_frame(event_type, payload):
    return f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"


def _authenticate(request):
    """Run DRF authenticators against a plain HttpRequest.

    JWTAuthentication reads only request.headers and SessionAuthentication
    reads request._request.user, so neither needs the DRF Request wrapper.
    """
    for authenticator in (JWTAuthentication(), SessionAuthentication()):
        try:
            result = authenticator.authenticate(request)
        except Exception:
            result = None
        if result is not None:
            user, _auth = result
            if user and user.is_active:
                return user
    return None


def _json_body(request):
    content_type = request.content_type or ""
    if 'application/json' in content_type:
        try:
            return json.loads(request.body or b'{}'), None
        except (ValueError, UnicodeDecodeError):
            return None, HttpResponse('Invalid JSON body', status=400)
    data = {key: value for key, value in request.POST.items()}
    return data, None


@csrf_exempt
@require_POST
def stream_chat_response(request, chat_id):
    user = _authenticate(request)
    if user is None:
        return HttpResponse(status=401)

    body, error_response = _json_body(request)
    if error_response is not None:
        return error_response

    user_input = body.get('message')
    if not user_input and not request.FILES:
        return JsonResponse({'error': 'message is required'}, status=400)

    if chat_id == 'new':
        profile = None
        bot = None
        if body.get('profile'):
            profile = get_object_or_404(Profile, profile_id=body['profile'], user=user)
        if body.get('bot'):
            bot = get_object_or_404(Bot, bot_id=body['bot'], user=user)
        chat = Chat.objects.create(title=user_input, profile=profile, bot=bot, user=user)
        system_prompt = chat.get_system_message()
        if bot and bot.system_prompt:
            system_prompt = bot.system_prompt
        chat.messages.create(text=system_prompt, role='system', order=0)
    else:
        chat = get_object_or_404(Chat, chat_id=chat_id, user=user)

    filename = None
    if request.FILES:
        file = request.FILES.get('image')
        if file is None:
            return JsonResponse({'error': 'No image file provided'}, status=400)
        if file.size > 20 * 1024 * 1024:
            return JsonResponse({'error': 'File size exceeds 20MB limit'}, status=400)
        if not allowed_file(file.name):
            return JsonResponse({'error': 'Invalid file type'}, status=400)
        filename = compress_and_upload_image(file)

    chat.messages.create(
        text=user_input,
        role='user',
        order=chat.messages.count(),
        image_filename=filename,
    )

    assistant_message_id = uuid.uuid4()
    event_generator = chat.stream_response(message_id=assistant_message_id)

    def sse():
        yield _sse_frame("meta", {"chat_id": str(chat.chat_id), "message_id": str(assistant_message_id)})
        try:
            for event in event_generator:
                event_type = event.get("type", "status")
                payload = {key: value for key, value in event.items() if key != "type"}
                if event_type == "done":
                    payload["message_id"] = str(assistant_message_id)
                elif event_type in ("tool_start", "tool_end"):
                    # Doc 06 §1: status frames carry their kind INSIDE the data.
                    payload["type"] = event_type
                yield _sse_frame("status" if event_type in ("tool_start", "tool_end") else event_type, payload)
        except Exception:
            logger.exception("🤖 STREAM_GENERATION_FAILED: chat_id=%s", chat.chat_id)
            yield _sse_frame("error", {"code": "internal", "message": "Generation failed. Please try again."})

    response = StreamingHttpResponse(sse(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    return response
