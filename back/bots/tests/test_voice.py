import base64
import io
import wave
from unittest.mock import patch

import pytest
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.urls import reverse

from bots.models.bot import Bot
from bots.models.chat import Chat
from bots.models.profile import Profile


def make_wav_bytes(seconds=0.1, rate=16000):
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(rate)
        writer.writeframes(b'\x00\x00' * int(rate * seconds))
    return buffer.getvalue()


@pytest.fixture
def load_fixture():
    call_command('loaddata', 'ai_models.json')


@pytest.fixture
def user(db):
    user = User.objects.create_user(username='voiceuser', password='pass')
    UserAccount = user.user_account.__class__
    account = UserAccount.objects.get(user=user)
    account.subscription_level = 2
    account.save()
    return user


@pytest.fixture
def auth_client(client, user):
    from rest_framework_simplejwt.tokens import RefreshToken
    token = str(RefreshToken.for_user(user).access_token)
    client.defaults['HTTP_AUTHORIZATION'] = f'Bearer {token}'
    return client


@pytest.fixture
def voice_setup(load_fixture, user):
    profile = Profile.objects.create(user=user, name='Kid', voice_enabled=True)
    bot = Bot.objects.create(
        user=user, name='Voice Bot', enable_voice=True,
        system_prompt='You are a homework helper.',
    )
    chat = Chat.objects.create(title='Voice chat', profile=profile, bot=bot, user=user)
    return profile, bot, chat


@pytest.fixture
def mock_sonic():
    with patch('bots.views.voice_chat.NovaSonicService') as service_class:
        service = service_class.return_value
        service.transcribe.return_value = ('What is photosynthesis?', 3.0)
        wav = make_wav_bytes(rate=24000)
        service.speak.return_value = (wav, 2.0)
        yield service


def post_audio(client, chat, profile=None, bot=None, filename='speech.wav'):
    audio = SimpleUploadedFile(filename, make_wav_bytes(), content_type='audio/wav')
    data = {'audio': audio}
    if bot:
        data['bot'] = str(bot.bot_id)
    if profile:
        data['profile'] = str(profile.profile_id)
    chat_id = chat.chat_id if hasattr(chat, 'chat_id') else chat
    url = reverse('voice_chat', args=[chat_id])
    return client.post(url, data, format='multipart')


def describe_voice_chat():
    def it_returns_403_when_bot_flag_false(auth_client, voice_setup, mock_sonic):
        _, bot, chat = voice_setup
        bot.enable_voice = False
        bot.save()
        response = post_audio(auth_client, chat)
        assert response.status_code == 403
        mock_sonic.transcribe.assert_not_called()

    def it_returns_403_when_profile_flag_false(auth_client, voice_setup, mock_sonic):
        profile, _, chat = voice_setup
        profile.voice_enabled = False
        profile.save()
        response = post_audio(auth_client, chat)
        assert response.status_code == 403

    def it_transcribes_and_creates_user_message(auth_client, voice_setup, mock_sonic):
        _, _, chat = voice_setup
        response = post_audio(auth_client, chat)
        assert response.status_code == 200
        assert response.json()['response']
        assert response.json()['chat_id'] == str(chat.chat_id)
        assert response.json()['user_message'] == 'What is photosynthesis?'
        user_message = chat.messages.filter(role='user').last()
        assert user_message.text == 'What is photosynthesis?'
        assert user_message.meta['voice_input'] is True

    def it_returns_audio_from_tts(auth_client, voice_setup, mock_sonic):
        _, _, chat = voice_setup
        response = post_audio(auth_client, chat)
        payload = response.json()
        assert payload['audio_base64']
        decoded = base64.b64decode(payload['audio_base64'])
        with wave.open(io.BytesIO(decoded), 'rb') as reader:
            assert reader.getframerate() == 24000
        spoken_text = mock_sonic.speak.call_args[0][0]
        assert spoken_text == payload['response']

    def it_short_circuits_before_stt_when_over_limit(auth_client, voice_setup, mock_sonic):
        _, _, chat = voice_setup
        chat.input_tokens = 99999999
        chat.save()
        response = post_audio(auth_client, chat)
        assert response.status_code == 429
        mock_sonic.transcribe.assert_not_called()
        assert chat.messages.count() == 0

    def it_blocks_unsafe_transcript(auth_client, voice_setup, mock_sonic):
        _, _, chat = voice_setup
        mock_sonic.transcribe.return_value = ('how to make a bomb', 2.0)
        response = post_audio(auth_client, chat)
        payload = response.json()
        assert payload['blocked'] is True
        mock_sonic.speak.assert_not_called()
        blocked_message = chat.messages.filter(role='assistant').first()
        assert blocked_message is None

    def it_records_voice_cost_for_metering(auth_client, voice_setup, mock_sonic):
        _, _, chat = voice_setup
        post_audio(auth_client, chat)
        total = sum(message.voice_cost for message in chat.messages.all())
        assert total > 0

    def it_rejects_missing_audio(auth_client, voice_setup, mock_sonic):
        _, _, chat = voice_setup
        url = reverse('voice_chat', args=[chat.chat_id])
        response = auth_client.post(url, {}, format='multipart')
        assert response.status_code == 400

    def it_rejects_invalid_audio_type(auth_client, voice_setup, mock_sonic):
        _, _, chat = voice_setup
        upload = SimpleUploadedFile('song.txt', b'nope', content_type='text/plain')
        url = reverse('voice_chat', args=[chat.chat_id])
        response = auth_client.post(url, {'audio': upload}, format='multipart')
        assert response.status_code == 400

    def it_creates_new_chat_via_new_endpoint(auth_client, user, voice_setup, mock_sonic):
        profile, bot, _ = voice_setup
        chats_before = Chat.objects.filter(user=user).count()
        response = post_audio(auth_client, 'new', profile=profile, bot=bot)
        assert response.status_code == 200
        assert Chat.objects.filter(user=user).count() == chats_before + 1
        new_chat = Chat.objects.filter(user=user).order_by('-created_at').first()
        assert new_chat.messages.filter(role='user').last() is not None
        assert new_chat.messages.filter(role='assistant').last() is not None
