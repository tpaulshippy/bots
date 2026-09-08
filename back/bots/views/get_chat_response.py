from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.response import Response

from bots.models import Bot, Chat, Profile
from bots.services.images import (
    ALLOWED_PHOTO_EXTENSIONS,
    MAX_PHOTO_BYTES,
    compress_and_upload_image,
)
from bots.tokens import delegated_profile_from_auth, is_teen_delegated

# Allowed image extensions
ALLOWED_EXTENSIONS = ALLOWED_PHOTO_EXTENSIONS

@api_view(['GET', 'POST'])
def get_chat_response(request, chat_id):
    user_input = request.data.get('message')
    profile_id = request.data.get('profile')
    bot_id = request.data.get('bot')
    user = request.user

    # Teen-delegated sessions are locked to their claimed profile: a
    # client-sent profile id is ignored and the claim is enforced instead.
    delegated_profile = delegated_profile_from_auth(request.auth, user)
    if is_teen_delegated(request.auth) and delegated_profile is None:
        return JsonResponse({'error': 'No active profile for this session'}, status=403)

    if chat_id == 'new':
        if delegated_profile is not None:
            profile = delegated_profile
        elif profile_id:
            profile = get_object_or_404(Profile, profile_id=profile_id, user=user)
        else:
            profile = None
        if bot_id:
            bot = get_object_or_404(Bot, bot_id=bot_id, user=user)
        else:
            bot = None
        chat = Chat.objects.create(title=user_input, profile=profile, bot=bot, user=user)
        # Parent-controlled prompt only; store it when present.
        system_prompt = chat.get_system_message()
        if system_prompt:
            chat.messages.create(text=system_prompt, role='system', order=0)

    else:
        chat = get_object_or_404(Chat, chat_id=chat_id, user=user)
        # Teens may only post to chats belonging to their own profile.
        if delegated_profile is not None and chat.profile != delegated_profile:
            return JsonResponse({'error': 'Chat not found'}, status=404)
    
    # Handle image uploads if present
    filename = None
    if request.method == 'POST' and request.FILES:
        file = request.FILES.get('image')  # Only allow one image
        if file is None:
            return JsonResponse({'error': 'No image file provided'}, status=400)
        if file.size > MAX_PHOTO_BYTES:
            return JsonResponse({'error': 'File size exceeds 20MB limit'}, status=400)
        if not allowed_file(file.name):
            return JsonResponse({'error': 'Invalid file type'}, status=400)
        filename = compress_and_upload_image(file)


    # get_response() owns the safety transactions (short row locks for
    # marking and persisting) so no DB transaction is held across the
    # model/external calls.
    user_message = chat.messages.create(
        text=user_input, role='user', order=chat.messages.count(), image_filename=filename
    )
    response = chat.get_response(user_message=user_message)
    return Response({'response': response, 'chat_id': chat.chat_id})

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
