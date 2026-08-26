import base64
import logging

from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.response import Response

from bots.models import Bot, Chat, Profile
from bots.models.user_account import voice_cost_estimate
from bots.services.nova_sonic import NovaSonicError, NovaSonicService
from bots.services.safety import SafetyPolicy, evaluate_text

logger = logging.getLogger(__name__)

ALLOWED_AUDIO_EXTENSIONS = {'wav', 'm4a', 'mp4', 'mp3', 'webm', 'ogg'}
MAX_AUDIO_SIZE = 20 * 1024 * 1024

VOICE_LIMIT_MESSAGE = 'You have exceeded your daily limit. Please try again tomorrow or upgrade your subscription.'
VOICE_BLOCKED_MESSAGE = 'I can\'t talk about that. Let\'s chat about something else.'


def voice_enabled_for(bot, profile):
    if not bot:
        return False
    if not bot.enable_voice:
        return False
    return profile is None or profile.voice_enabled


@api_view(['GET', 'POST'])
def voice_chat(request, chat_id):
    user = request.user
    profile_id = request.data.get('profile')
    bot_id = request.data.get('bot')

    if chat_id == 'new':
        profile = get_object_or_404(Profile, profile_id=profile_id, user=user) \
            if profile_id else None
        bot = get_object_or_404(Bot, bot_id=bot_id, user=user) if bot_id else None
    else:
        chat = get_object_or_404(Chat, chat_id=chat_id, user=user)
        profile = chat.profile
        bot = chat.bot

    if not voice_enabled_for(bot, profile):
        return JsonResponse({'error': 'Voice is not enabled for this bot'}, status=403)

    if chat_id == 'new':
        # Create the chat only after the voice gate passes so disabled-voice
        # requests don't leave orphan chats behind.
        chat = Chat.objects.create(title='Voice chat', profile=profile, bot=bot, user=user)
        chat.messages.create(text=chat.get_system_message(), role='system', order=0)

    audio_file = request.FILES.get('audio')
    if audio_file is None:
        return JsonResponse({'error': 'No audio file provided'}, status=400)
    if audio_file.size > MAX_AUDIO_SIZE:
        return JsonResponse({'error': 'Audio file exceeds the 20MB limit'}, status=400)
    extension = allowed_audio_extension(audio_file.name)
    if not extension:
        return JsonResponse({'error': 'Invalid audio file type'}, status=400)

    user_account = getattr(chat.user, 'user_account', None)
    if user_account and user_account.over_limit():
        return JsonResponse({'error': VOICE_LIMIT_MESSAGE}, status=429)

    service = NovaSonicService()
    try:
        transcript, input_seconds = service.transcribe(audio_file.read(), extension)
    except NovaSonicError as e:
        logger.error(f'VOICE_STT_ERROR: {e}')
        return JsonResponse({'error': 'Speech recognition failed'}, status=502)

    if not transcript:
        return JsonResponse({'error': 'No speech detected'}, status=400)

    voice_verdict = evaluate_text(
        transcript, SafetyPolicy.for_bot(chat.bot), source='INPUT')
    if voice_verdict.blocked:
        chat.messages.create(
            text=transcript, role='user', order=chat.messages.count(),
            meta={'voice_input': True, 'voice_blocked': True,
                  'voice_seconds': round(input_seconds, 2)},
            voice_cost=voice_cost_estimate('stt', input_seconds),
        )
        logger.info(f'VOICE_SAFETY_BLOCK: {voice_verdict.reason_code}')
        return Response({
            'response': VOICE_BLOCKED_MESSAGE,
            'chat_id': str(chat.chat_id),
            'user_message': transcript,
            'blocked': True,
            'audio_base64': None,
        })

    chat.messages.create(
        text=transcript, role='user', order=chat.messages.count(),
        meta={'voice_input': True, 'voice_seconds': round(input_seconds, 2)},
        voice_cost=voice_cost_estimate('stt', input_seconds),
    )

    response_text = chat.get_response(voice_mode=True)
    payload = {
        'response': response_text,
        'chat_id': str(chat.chat_id),
        'user_message': transcript,
        'audio_base64': None,
    }

    try:
        wav_bytes, tts_seconds = service.speak(response_text)
        payload['audio_base64'] = base64.b64encode(wav_bytes).decode('utf-8')
        assistant_message = chat.messages.filter(role='assistant').order_by('-id').first()
        if assistant_message:
            assistant_message.voice_cost += voice_cost_estimate('tts', tts_seconds)
            assistant_message.meta = {**(assistant_message.meta or {}), 'voice_output': True}
            assistant_message.save()
    except NovaSonicError as e:
        logger.error(f'VOICE_TTS_ERROR: {e}')

    return Response(payload)


def allowed_audio_extension(filename):
    if '.' not in filename:
        return None
    extension = filename.rsplit('.', 1)[1].lower()
    return extension if extension in ALLOWED_AUDIO_EXTENSIONS else None
