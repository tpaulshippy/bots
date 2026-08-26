import asyncio
import base64
import io
import json
import logging
import struct
import subprocess
import uuid
import wave

from django.conf import settings

logger = logging.getLogger(__name__)

INPUT_SAMPLE_RATE = 16000
OUTPUT_SAMPLE_RATE = 24000
BYTES_PER_SAMPLE = 2
AUDIO_CHUNK_BYTES = 6400
TURN_TIMEOUT_SECONDS = 120


class NovaSonicError(Exception):
    pass


class NovaSonicService:
    """Turn-based STT and TTS backed by Amazon Nova Sonic.

    Each call opens a short Bedrock InvokeModelWithBidirectionalStream session,
    plays one user turn through the model, collects the transcript or spoken
    audio, and closes the session.
    """

    def __init__(self, model_id=None, region=None, voice_id=None):
        self.model_id = model_id or settings.NOVA_SONIC_MODEL_ID
        self.region = region or settings.NOVA_SONIC_REGION
        self.voice_id = voice_id or settings.NOVA_SONIC_VOICE_ID

    def transcribe(self, audio_bytes, source_format='wav'):
        """Speech-to-text. Returns (transcript, input_seconds)."""
        pcm = self.to_pcm_16k(audio_bytes, source_format)
        seconds = len(pcm) / (INPUT_SAMPLE_RATE * BYTES_PER_SAMPLE)
        transcript = asyncio.run(self._transcribe_async(pcm))
        return transcript, seconds

    def speak(self, text, voice_id=None):
        """Text-to-speech. Returns (wav_bytes, output_seconds)."""
        pcm = asyncio.run(self._speak_async(text, voice_id or self.voice_id))
        seconds = len(pcm) / (OUTPUT_SAMPLE_RATE * BYTES_PER_SAMPLE)
        return pcm_to_wav(pcm, OUTPUT_SAMPLE_RATE), seconds

    def _client(self):
        try:
            from aws_sdk_bedrock_runtime.client import (
                AsyncBedrockRuntimeClient,
                InvokeModelWithBidirectionalStreamOperationInput,
            )
            from aws_sdk_bedrock_runtime.config import AsyncBedrockRuntimeConfig
            from aws_sdk_bedrock_runtime.models import (
                BidirectionalInputPayloadPart,
                InvokeModelWithBidirectionalStreamInputChunk,
            )
        except ImportError as e:
            raise NovaSonicError(f'Nova Sonic SDK unavailable: {e}') from e

        try:
            from smithy_aws_core.identity.environment import (
                EnvironmentCredentialsResolver,
            )
        except ImportError:
            try:
                from smithy_aws_core.credentials_resolvers.environment import (
                    EnvironmentCredentialsResolver,
                )
            except ImportError:
                from smithy_aws_core.identity import EnvironmentCredentialsResolver

        return {
            'config': AsyncBedrockRuntimeConfig,
            'client': AsyncBedrockRuntimeClient,
            'operation_input': InvokeModelWithBidirectionalStreamOperationInput,
            'chunk_type': InvokeModelWithBidirectionalStreamInputChunk,
            'part_type': BidirectionalInputPayloadPart,
            'credentials': EnvironmentCredentialsResolver,
        }

    async def _open_stream(self):
        sdk = self._client()
        endpoint = f'https://bedrock-runtime.{self.region}.amazonaws.com'
        config = await sdk['config'].resolve(
            region=self.region,
            endpoint_uri=endpoint,
            aws_credentials_identity_resolver=sdk['credentials'](),
        )
        client = sdk['client'](config=config)
        stream = await client.invoke_model_with_bidirectional_stream(
            input=sdk['operation_input'](model_id=self.model_id)
        )
        return {
            'stream': stream,
            'chunk_type': sdk['chunk_type'],
            'part_type': sdk['part_type'],
        }

    async def _send_event(self, state, event_json):
        chunk = state['chunk_type'](
            value=state['part_type'](bytes_=event_json.encode('utf-8'))
        )
        await state['stream'].input_stream.send(chunk)

    async def _start_session(self, state, system_prompt):
        prompt_name = str(uuid.uuid4())
        state.update(prompt_name=prompt_name)

        await self._send_event(state, json.dumps({
            'event': {'sessionStart': {'inferenceConfiguration': {
                'maxTokens': 1024, 'topP': 0.9, 'temperature': 0.7,
            }}},
        }))
        await self._send_event(state, json.dumps({
            'event': {'promptStart': {
                'promptName': prompt_name,
                'textOutputConfiguration': {'mediaType': 'text/plain'},
                'audioOutputConfiguration': {
                    'mediaType': 'audio/lpcm',
                    'sampleRateHertz': OUTPUT_SAMPLE_RATE,
                    'sampleSizeBits': 16,
                    'channelCount': 1,
                    'voiceId': self.voice_id,
                    'encoding': 'base64',
                    'audioType': 'SPEECH',
                },
            }},
        }))

        content_name = str(uuid.uuid4())
        await self._send_text_content(state, content_name, 'SYSTEM', False, system_prompt)

    async def _send_text_content(self, state, content_name, role, interactive, text):
        await self._send_event(state, json.dumps({
            'event': {'contentStart': {
                'promptName': state['prompt_name'],
                'contentName': content_name,
                'type': 'TEXT',
                'interactive': interactive,
                'role': role,
                'textInputConfiguration': {'mediaType': 'text/plain'},
            }},
        }))
        await self._send_event(state, json.dumps({
            'event': {'textInput': {
                'promptName': state['prompt_name'],
                'contentName': content_name,
                'content': text,
            }},
        }))
        await self._send_event(state, json.dumps({
            'event': {'contentEnd': {
                'promptName': state['prompt_name'],
                'contentName': content_name,
            }},
        }))

    async def _teardown(self, state):
        try:
            await self._send_event(state, json.dumps({
                'event': {'promptEnd': {'promptName': state['prompt_name']}},
            }))
            await self._send_event(state, json.dumps({'event': {'sessionEnd': {}}}))
            await state['stream'].close()
        except Exception as e:
            logger.warning(f'Nova Sonic teardown error: {e}')

    async def _open_stream(self):
        client, operation_input, chunk_type, part_type = self._client()
        stream = await client.invoke_model_with_bidirectional_stream(
            operation_input(model_id=self.model_id)
        )
        return {
            'stream': stream,
            'chunk_type': chunk_type,
            'part_type': part_type,
        }

    async def _read_events(self, state, handler):
        _, output_stream = await state['stream'].await_output()
        deadline = asyncio.get_event_loop().time() + TURN_TIMEOUT_SECONDS
        while asyncio.get_event_loop().time() < deadline:
            try:
                result = await asyncio.wait_for(output_stream.receive(), timeout=10)
            except (asyncio.TimeoutError, StopAsyncIteration):
                continue
            except Exception:
                return
            if result.value is None or result.value.bytes_ is None:
                continue
            event = json.loads(result.value.bytes_.decode('utf-8')).get('event', {})
            if not event:
                continue
            if 'sessionEnd' in event:
                return
            if handler(event) is False:
                return

    async def _transcribe_async(self, pcm):
        state = await self._open_stream()
        transcript_parts = []
        saw_user_audio_end = False

        async def run():
            nonlocal saw_user_audio_end
            await self._start_session(
                state,
                'You are a transcription engine. Repeat exactly what the user '
                'says. Never answer, comment, or add anything of your own.',
            )

            def on_event(event):
                if 'contentStart' in event:
                    role = event['contentStart'].get('role')
                    if role == 'ASSISTANT':
                        return False
                elif 'textOutput' in event:
                    if event['textOutput'].get('role') == 'USER':
                        transcript_parts.append(event['textOutput'].get('content', ''))
                        return None
                elif 'contentEnd' in event:
                    if event['contentEnd'].get('stopReason') == 'END_TURN':
                        return False
                return None

            audio_content_name = str(uuid.uuid4())
            await self._send_event(state, json.dumps({
                'event': {'contentStart': {
                    'promptName': state['prompt_name'],
                    'contentName': audio_content_name,
                    'type': 'AUDIO',
                    'interactive': True,
                    'role': 'USER',
                    'audioInputConfiguration': {
                        'mediaType': 'audio/lpcm',
                        'sampleRateHertz': INPUT_SAMPLE_RATE,
                        'sampleSizeBits': 16,
                        'channelCount': 1,
                        'audioType': 'SPEECH',
                        'encoding': 'base64',
                    },
                }},
            }))

            reader_task = asyncio.create_task(self._read_events(state, on_event))
            for offset in range(0, len(pcm), AUDIO_CHUNK_BYTES):
                chunk = pcm[offset:offset + AUDIO_CHUNK_BYTES]
                await self._send_event(state, json.dumps({
                    'event': {'audioInput': {
                        'promptName': state['prompt_name'],
                        'contentName': audio_content_name,
                        'content': base64.b64encode(chunk).decode('utf-8'),
                    }},
                }))
                await asyncio.sleep(0.02)
            await self._send_event(state, json.dumps({
                'event': {'contentEnd': {
                    'promptName': state['prompt_name'],
                    'contentName': audio_content_name,
                }},
            }))
            saw_user_audio_end = True
            await reader_task

        try:
            await asyncio.wait_for(run(), timeout=TURN_TIMEOUT_SECONDS)
        finally:
            await self._teardown(state)

        if not saw_user_audio_end:
            raise NovaSonicError('Audio input was not fully delivered')
        return ''.join(transcript_parts).strip()

    async def _speak_async(self, text, voice_id):
        state = await self._open_stream()
        audio_parts = []

        async def run():
            await self._start_session(
                state,
                'You are a text-to-speech engine. Speak the user\'s message '
                'out loud word for word. Do not answer it, shorten it, or add '
                'anything of your own.',
            )

            def on_event(event):
                if 'audioOutput' in event:
                    audio_parts.append(event['audioOutput'].get('content', ''))
                elif 'contentEnd' in event:
                    if event['contentEnd'].get('stopReason') == 'END_TURN':
                        return False
                return None

            reader_task = asyncio.create_task(self._read_events(state, on_event))
            await self._send_text_content(state, str(uuid.uuid4()), 'USER', True, text)
            await reader_task

        try:
            await asyncio.wait_for(run(), timeout=TURN_TIMEOUT_SECONDS)
        finally:
            await self._teardown(state)

        pcm = b''.join(base64.b64decode(part) for part in audio_parts if part)
        if not pcm:
            raise NovaSonicError('Nova Sonic returned no audio')
        return pcm

    @staticmethod
    def to_pcm_16k(audio_bytes, source_format='wav'):
        source_format = (source_format or 'wav').lower()
        if source_format in ('wav', 'x-wav', 'wave', 'vnd.wave'):
            pcm = _pcm_from_wav(audio_bytes)
            if pcm is not None:
                return pcm
        return _ffmpeg_to_pcm_16k(audio_bytes)


def _unpack_samples(frames):
    count = len(frames) // BYTES_PER_SAMPLE
    return list(struct.unpack(f'<{count}h', frames[:count * BYTES_PER_SAMPLE]))


def _pcm_from_wav(audio_bytes):
    try:
        with wave.open(io.BytesIO(audio_bytes), 'rb') as reader:
            channels = reader.getnchannels()
            width = reader.getsampwidth()
            rate = reader.getframerate()
            frames = reader.readframes(reader.getnframes())
    except (wave.Error, EOFError):
        return None
    if width != BYTES_PER_SAMPLE:
        return None
    if channels > 1:
        frames = downmix_to_mono(frames, channels)
    if rate != INPUT_SAMPLE_RATE:
        frames = resample_linear(frames, rate, INPUT_SAMPLE_RATE)
    return frames


def downmix_to_mono(frames, channels):
    samples = _unpack_samples(frames)
    out = []
    for i in range(0, len(samples) - channels + 1, channels):
        out.append(int(sum(samples[i:i + channels]) / channels))
    return struct.pack(f'<{len(out)}h', *out)


def resample_linear(frames, from_rate, to_rate):
    samples = _unpack_samples(frames)
    count = len(samples)
    if count == 0:
        return b''
    ratio = to_rate / from_rate
    out_count = int(count * ratio)
    out = []
    for i in range(out_count):
        pos = i / ratio
        left = int(pos)
        right = min(left + 1, count - 1)
        frac = pos - left
        value = samples[left] * (1 - frac) + samples[right] * frac
        out.append(max(-32768, min(32767, int(value))))
    return struct.pack(f'<{len(out)}h', *out)


def _ffmpeg_to_pcm_16k(audio_bytes):
    try:
        process = subprocess.run(
            ['ffmpeg', '-nostdin', '-i', 'pipe:0',
             '-f', 's16le', '-acodec', 'pcm_s16le',
             '-ar', str(INPUT_SAMPLE_RATE), '-ac', '1', 'pipe:1'],
            input=audio_bytes, capture_output=True, check=True,
        )
        return process.stdout
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        raise NovaSonicError(
            'Unsupported audio format: WAV is supported natively and other '
            f'formats require ffmpeg on the server ({e})'
        ) from e


def pcm_to_wav(pcm, sample_rate):
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as writer:
        writer.setnchannels(1)
        writer.setsampwidth(BYTES_PER_SAMPLE)
        writer.setframerate(sample_rate)
        writer.writeframes(pcm)
    return buffer.getvalue()
