import json
import logging
import uuid
import base64
import asyncio
import wave
import io
import time
from datetime import datetime
from typing import Dict, List, Optional, Any, AsyncGenerator, Callable, Awaitable

import boto3
import numpy as np
from botocore.exceptions import BotoCoreError, ClientError
from botocore.config import Config
from rx import subject, operators as ops
from rx.scheduler.eventloop import AsyncIOScheduler

from channels.generic.websocket import AsyncWebsocketConsumer, AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.conf import settings

from ..models import Message, Chat, TranscriptionStatus

# Audio configuration
SAMPLE_RATE = 16000  # Sample rate in Hz for input
OUTPUT_SAMPLE_RATE = 24000  # Sample rate in Hz for output
CHANNELS = 1  # Mono audio
SAMPLE_WIDTH = 2  # 16-bit audio
CHUNK_SIZE = 512  # Number of frames per buffer

# Nova Sonic configuration
NOVA_REGION = getattr(settings, 'NOVA_REGION', 'us-east-1')
NOVA_ACCESS_KEY = getattr(settings, 'AWS_ACCESS_KEY_ID', '')
NOVA_SECRET_KEY = getattr(settings, 'AWS_SECRET_ACCESS_KEY', '')
NOVA_SESSION_TOKEN = getattr(settings, 'AWS_SESSION_TOKEN', None)
NOVA_MODEL_ID = getattr(settings, 'NOVA_MODEL_ID', 'amazon.nova-express-tts')

# Audio format mapping
AUDIO_FORMATS = {
    'pcm': 'pcm',
    'mp3': 'mp3',
    'ogg_vorbis': 'ogg',
    'ogg_opus': 'opus'
}

# WebSocket message types
class MessageType(Enum):
    # Client to server
    START_SESSION = 'start_session'
    AUDIO_CHUNK = 'audio_chunk'
    END_SESSION = 'end_session'
    
    # Server to client
    SESSION_STARTED = 'session_started'
    TRANSCRIPTION_UPDATE = 'transcription_update'
    AUDIO_RESPONSE = 'audio_response'
    SESSION_ENDED = 'session_ended'
    ERROR = 'error'

logger = logging.getLogger(__name__)

class MessageType(Enum):
    AUDIO_CHUNK = 'audio_chunk'
    TRANSCRIPTION_UPDATE = 'transcription_update'
    AUDIO_RESPONSE = 'audio_response'
    ERROR = 'error'
    CONNECTION_ESTABLISHED = 'connection_established'

class NovaSonicClient:
    """Client for interacting with Nova Sonic for speech-to-speech processing"""
    
    def __init__(self, language_code: str = 'en-US'):
        # Initialize Bedrock Runtime client
        self.bedrock_runtime = boto3.client(
            'bedrock-runtime',
            region_name=NOVA_REGION,
            aws_access_key_id=NOVA_ACCESS_KEY,
            aws_secret_access_key=NOVA_SECRET_KEY,
            aws_session_token=NOVA_SESSION_TOKEN
        )
        
        self.language_code = language_code
        self.sample_rate = SAMPLE_RATE
        self.output_sample_rate = OUTPUT_SAMPLE_RATE
        self.media_encoding = 'pcm'
        
        # Rx subjects for handling streams
        self.audio_input_subject = subject.Subject()
        self.transcription_subject = subject.Subject()
        self.audio_output_subject = subject.Subject()
        
        # Scheduler for Rx
        self.scheduler = AsyncIOScheduler()
        
        # Session state
        self.session_id = str(uuid.uuid4())
        self.is_streaming = False
    
    async def start_session(self, on_transcription: Callable[[str, bool], Awaitable[None]]):
        """Start a new Nova Sonic session"""
        if self.is_streaming:
            logger.warning("Session already in progress")
            return
            
        self.is_streaming = True
        self.session_id = str(uuid.uuid4())
        
        # Reset subjects
        self.audio_input_subject = subject.Subject()
        self.transcription_subject = subject.Subject()
        self.audio_output_subject = subject.Subject()
        
        # Subscribe to transcription updates
        self.transcription_subscription = self.transcription_subject.pipe(
            ops.filter(lambda x: x is not None),
            ops.map(lambda x: json.loads(x.decode('utf-8')) if isinstance(x, bytes) else x)
        ).subscribe(
            on_next=lambda data: asyncio.create_task(self._handle_transcription(data, on_transcription)),
            on_error=lambda e: logger.error(f"Transcription error: {str(e)}"),
            scheduler=self.scheduler
        )
        
        # Start the bidirectional stream
        asyncio.create_task(self._start_bidirectional_stream())
        
        logger.info(f"Started Nova Sonic session: {self.session_id}")
    
    async def end_session(self):
        """End the current session"""
        if not self.is_streaming:
            return
            
        self.is_streaming = False
        
        # Complete the input subject to signal end of input
        self.audio_input_subject.on_completed()
        
        # Unsubscribe from subjects
        if hasattr(self, 'transcription_subscription'):
            self.transcription_subscription.dispose()
        
        logger.info(f"Ended Nova Sonic session: {self.session_id}")
    
    async def _send_raw_event(self, event_data):
        """Send a raw event to the Bedrock stream"""
        if not self.is_streaming:
            logger.warning("Cannot send event - not streaming")
            return False
            
        try:
            if isinstance(event_data, str):
                event_data = event_data.encode('utf-8')
                
            event = {
                'chunk': {
                    'bytes': io.BytesIO(event_data)
                }
            }
            
            await self.audio_input_subject.on_next(event)
            return True
            
        except Exception as e:
            logger.error(f"Error sending event: {str(e)}")
            self.transcription_subject.on_error(e)
            return False
            
    async def _start_bidirectional_stream(self):
        """Start the bidirectional streaming with Bedrock Runtime"""
        try:
            # Configure the input stream
            input_stream = self._create_input_stream()
            
            # Start the bidirectional stream
            response = self.bedrock_runtime.invoke_model_with_bidirectional_stream(
                modelId=NOVA_MODEL_ID,
                body=json.dumps({
                    "sessionId": self.session_id,
                    "inputSampleRate": SAMPLE_RATE,
                    "outputSampleRate": self.output_sample_rate,
                    "languageCode": self.language_code,
                    "enablePartialResults": True,
                    "enableInterimResults": True
                }),
                contentType="application/json",
                accept="*/*"
            )
            
            # Send initialization events
            start_session_event = {
                "event": {
                    "sessionStart": {
                        "inferenceConfiguration": {
                            "maxTokens": 1024,
                            "topP": 0.9,
                            "temperature": 0.7
                        }
                    }
                }
            }
            
            # Start prompt event
            start_prompt_event = {
                "event": {
                    "promptStart": {
                        "promptName": self.session_id,
                        "textOutputConfiguration": {
                            "mediaType": "text/plain"
                        },
                        "audioOutputConfiguration": {
                            "mediaType": "audio/lpcm",
                            "sampleRateHertz": self.output_sample_rate,
                            "sampleSizeBits": 16,
                            "channelCount": 1,
                            "voiceId": "Joanna",
                            "encoding": "base64",
                            "audioType": "SPEECH"
                        },
                        "toolUseOutputConfiguration": {
                            "mediaType": "application/json"
                        },
                        "toolConfiguration": {
                            "tools": []
                        }
                    }
                }
            }
            
            # Content start event for system message
            content_start_event = {
                "event": {
                    "contentStart": {
                        "promptName": self.session_id,
                        "contentName": f"{self.session_id}-system",
                        "type": "TEXT",
                        "interactive": True,
                        "role": "SYSTEM",
                        "textInputConfiguration": {
                            "mediaType": "text/plain"
                        }
                    }
                }
            }
            
            # System message
            system_message = {
                "event": {
                    "textInput": {
                        "promptName": self.session_id,
                        "contentName": f"{self.session_id}-system",
                        "content": "You are a helpful AI assistant. Respond concisely and naturally in conversation."
                    }
                }
            }
            
            # Content end for system message
            content_end_event = {
                "event": {
                    "contentEnd": {
                        "promptName": self.session_id,
                        "contentName": f"{self.session_id}-system"
                    }
                }
            }
            
            # Send all initialization events
            for event in [start_session_event, start_prompt_event, 
                         content_start_event, system_message, content_end_event]:
                await self._send_raw_event(json.dumps(event))
            
            # Process the response stream
            stream = response.get('body')
            if stream:
                async for event in stream:
                    try:
                        if 'chunk' in event:
                            chunk = event['chunk']
                            if 'bytes' in chunk:
                                chunk_data = chunk['bytes'].read()
                                if chunk_data:
                                    try:
                                        # Try to parse as JSON for transcription updates
                                        data = json.loads(chunk_data.decode('utf-8'))
                                        if 'transcript' in data or 'audioData' in data:
                                            self.transcription_subject.on_next(data)
                                    except json.JSONDecodeError:
                                        # If not JSON, it's binary audio data
                                        self.audio_output_subject.on_next(chunk_data)
                    except Exception as e:
                        logger.error(f"Error processing chunk: {str(e)}")
                        continue
            
            logger.info(f"Bidirectional stream completed for session: {self.session_id}")
            
        except Exception as e:
            error_msg = f"Error in bidirectional stream: {str(e)}"
            logger.error(error_msg)
            self.transcription_subject.on_error(Exception(error_msg))
        finally:
            # Signal completion
            self.transcription_subject.on_completed()
            self.audio_output_subject.on_completed()
            self.is_streaming = False
    
    def _create_input_stream(self):
        """Create an input stream from the audio input subject"""
        for chunk in self.audio_input_subject:
            yield {
                'chunk': {
                    'bytes': io.BytesIO(chunk),
                    'contentType': 'audio/pcm; rate=16000; sample-width=2; channel-count=1'
                }
            }
    
    async def _handle_transcription(self, data: dict, callback: Callable[[str, bool], Awaitable[None]]):
        """Handle transcription data from the stream"""
        try:
            if 'transcript' in data:
                is_final = data.get('isFinal', False)
                await callback(data['transcript'], is_final)
                
                # If we have audio data, emit it
                if 'audioData' in data and data['audioData']:
                    audio_bytes = base64.b64decode(data['audioData'])
                    self.audio_output_subject.on_next(audio_bytes)
                    
        except Exception as e:
            logger.error(f"Error handling transcription: {str(e)}")
    
    async def send_audio_chunk(self, chunk: bytes):
        """Send an audio chunk to the Nova Sonic service"""
        if self.is_streaming:
            self.audio_input_subject.on_next(chunk)
    
    async def text_to_speech(self, text: str, voice_id: str = 'Joanna') -> Optional[bytes]:
        """Convert text to speech using Nova Sonic's bidirectional stream"""
        if not self.is_streaming:
            logger.warning("Cannot send text - not streaming")
            return None
            
        try:
            # Create a unique ID for this text content
            content_id = str(uuid.uuid4())
            
            # Content start event for text input
            content_start = {
                "event": {
                    "contentStart": {
                        "promptName": self.session_id,
                        "contentName": content_id,
                        "type": "TEXT",
                        "interactive": True,
                        "role": "USER",
                        "textInputConfiguration": {
                            "mediaType": "text/plain"
                        }
                    }
                }
            }
            
            # Text input event
            text_input = {
                "event": {
                    "textInput": {
                        "promptName": self.session_id,
                        "contentName": content_id,
                        "content": text
                    }
                }
            }
            
            # Content end event
            content_end = {
                "event": {
                    "contentEnd": {
                        "promptName": self.session_id,
                        "contentName": content_id
                    }
                }
            }
            
            # Send all events
            for event in [content_start, text_input, content_end]:
                await self._send_raw_event(json.dumps(event))
                
            # The audio response will be handled by the stream processor
            # and emitted through the audio_output_subject
            return None
            
        except Exception as e:
            logger.error(f"Error in text-to-speech: {str(e)}")
            return None
            
        except (BotoCoreError, ClientError) as error:
            logger.error(f"Error in text-to-speech: {str(error)}")
            return None


class VoiceConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for handling real-time voice interactions.
    Handles audio streaming, transcription, and response generation.
    """
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.chat_id = None
        self.message_id = None
        self.audio_chunks = []
        self.nova_client = None
        self.audio_file_path = None
        self.user = None
        self.channel_layer = None
        self.room_group_name = None
        self.transcription_task = None
        self.audio_buffer = asyncio.Queue()
        self.stream_sid = None
        self.media_stream_sid = None
        self.language_code = 'en-US'
        self.voice_id = 'Joanna'  # Default voice for text-to-speech
        self.is_streaming = False

    async def connect(self):
        """Handle WebSocket connection"""
        self.chat_id = self.scope['url_route']['kwargs'].get('chat_id')
        self.user = self.scope["user"]
        
        if not self.user.is_authenticated:
            await self.close(code=4001)
            return
            
        if not self.chat_id:
            await self.close(code=4000)
            return
            
        # Initialize Nova Sonic client
        self.nova_sonic = NovaSonicClient()
        self.audio_chunks = []
        self.current_message = None
        self.session_id = str(uuid.uuid4())
        
        # Accept the connection
        await self.accept()
        
        # Start a new Nova Sonic session
        await self.nova_sonic.start_session(self._handle_transcription_update)
        
        # Send session info
        await self.send_json({
            'type': MessageType.SESSION_READY.value,
            'session_id': self.session_id,
            'sample_rate': SAMPLE_RATE,
            'output_sample_rate': OUTPUT_SAMPLE_RATE,
            'channels': CHANNELS,
            'sample_width': SAMPLE_WIDTH,
            'chunk_size': CHUNK_SIZE
        })

    async def disconnect(self, close_code):
        """Handle WebSocket disconnection"""
        # Clean up Nova Sonic session
        if hasattr(self, 'nova_sonic'):
            await self.nova_sonic.end_session()
            
        await super().disconnect(close_code)

    async def receive_json(self, content, **kwargs):
        """Handle incoming WebSocket messages"""
        message_type = content.get('type')
        
        try:
            if message_type == 'audio_chunk':
                await self._handle_audio_chunk(content)
            elif message_type == 'start_recording':
                await self._handle_start_recording(content)
            elif message_type == 'stop_recording':
                await self._handle_stop_recording()
            elif message_type == 'tts_request':
                await self._handle_tts_request(content)
        except Exception as e:
            logger.error(f"Error handling message type {message_type}: {str(e)}")
            await self._send_error(f"Error processing {message_type}: {str(e)}")

    async def _handle_audio_chunk(self, content):
        """Handle incoming audio chunk"""
        try:
            chunk = base64.b64decode(content['data'])
            
            # Store the chunk for potential replay or debugging
            self.audio_chunks.append(chunk)
            
            # Send the chunk to Nova Sonic
            await self.nova_sonic.send_audio_chunk(chunk)
            
        except Exception as e:
            logger.error(f"Error handling audio chunk: {str(e)}")
            await self._send_error("Error processing audio")

    async def _handle_transcription_update(self, text: str, is_final: bool):
        """Handle transcription updates from Nova Sonic"""
        if not self.current_message:
            logger.warning("Received transcription update but no current message")
            return
            
        try:
            # Update the message in the database
            message = await self._update_message_transcription(
                self.current_message.id,
                text,
                is_final=is_final
            )
            
            # Send the update to the client
            await self.send_json({
                'type': MessageType.TRANSCRIPTION_UPDATE.value,
                'message_id': str(self.current_message.id),
                'text': text,
                'is_final': is_final
            })
            
            # If this is the final transcription, we can clear the current message
            if is_final:
                self.current_message = None
                
        except Exception as e:
            logger.error(f"Error handling transcription update: {str(e)}")
            await self._send_error("Error processing transcription")

    @database_sync_to_async
    def _update_message_transcription(self, message_id, text, is_final=False):
        """Update a message with new transcription text"""
        try:
            message = Message.objects.get(id=message_id, chat_id=self.chat_id)
            
            if is_final:
                message.text = text
                message.transcription_status = TranscriptionStatus.COMPLETED.value
            else:
                # Add as a partial transcription
                message.add_partial_transcription(text)
                message.transcription_status = TranscriptionStatus.IN_PROGRESS.value
            
            message.save(update_fields=['text', 'partial_transcriptions', 'transcription_status', 'updated_at'])
            return message
            
        except Message.DoesNotExist:
            logger.error(f"Message {message_id} not found")
            return None
        except Exception as e:
            logger.error(f"Error updating message transcription: {str(e)}")
            raise

    async def _handle_start_recording(self, content):
        """Handle start recording request"""
        try:
            # Create a new message for this recording session
            self.current_message = await self._create_new_message()
            self.audio_chunks = []
            
            # Reset the Nova Sonic session for a new conversation
            if hasattr(self, 'nova_sonic'):
                await self.nova_sonic.end_session()
            
            self.nova_sonic = NovaSonicClient()
            await self.nova_sonic.start_session(self._handle_transcription_update)
            
            await self.send_json({
                'type': MessageType.RECORDING_STARTED.value,
                'message_id': str(self.current_message.id)
            })
            
        except Exception as e:
            logger.error(f"Error starting recording: {str(e)}")
            await self._send_error("Error starting recording")

    async def _create_new_message(self):
        """Create a new message for this voice interaction"""
        try:
            chat = await self._get_chat()
            if not chat:
                raise ValueError("Chat not found")
                
            message = await database_sync_to_async(Message.objects.create)(
                chat=chat,
                role='user',
                is_voice=True,
                language=self.language_code,
                transcription_status=TranscriptionStatus.PENDING.value,
                partial_transcriptions=[]
            )
            
            return message
            
        except Exception as e:
            logger.error(f"Error creating new message: {str(e)}")
            raise

    async def _generate_and_send_response(self, text: str):
        """Generate a response to the user's message"""
        try:
            # Generate a response using your existing chat logic
            response_text = await self._generate_chat_response(text)
            
            # Create a response message
            response_message = await database_sync_to_async(Message.objects.create)(
                chat_id=self.chat_id,
                role='assistant',
                text=response_text,
                is_voice=True,
                transcription_status=TranscriptionStatus.COMPLETED.value
            )
            
            # Convert the response to speech using Nova Sonic
            audio_data = await self.nova_sonic.text_to_speech(response_text, self.voice_id)
            
            if audio_data:
                # Save the audio file
                audio_url = await self._save_audio_file(
                    audio_data, 
                    f"response_{response_message.message_id}.mp3"
                )
                
                # Update the message with the audio URL
                response_message.audio_url = audio_url
                response_message.audio_duration = len(audio_data) / (SAMPLE_RATE * CHANNELS * (SAMPLE_WIDTH / 8))
                await database_sync_to_async(response_message.save)()
                
                # Send the response to the client
                await self.send_json({
                    'type': MessageType.AUDIO_RESPONSE.value,
                    'message_id': str(response_message.message_id),
                    'text': response_text,
                    'audio_url': audio_url,
                    'audio_duration': response_message.audio_duration,
                    'is_final': True
                })
                
                return response_message
            
            return None
                
            
        except Exception as e:
            logger.error(f"Error generating response: {str(e)}")
            await self._send_error("Error generating response")

    async def _generate_chat_response(self, text):
        """Generate a chat response using your existing logic"""
        # This should be implemented based on your existing chat system
        return f"Response to: {text}"

    # Text-to-speech is handled through the bidirectional stream
    # by sending text input events to the Nova Sonic service

    async def _save_audio_file(self, audio_data, filename):
        """Save audio data to a file and return the URL"""
        try:
            file_path = f"voice_messages/{filename}"
            saved_path = default_storage.save(file_path, ContentFile(audio_data))
            return default_storage.url(saved_path)
        except Exception as e:
            logger.error(f"Error saving audio file: {str(e)}")
            raise

    async def _cleanup_audio_file(self):
        """Clean up temporary audio files"""
        try:
            if self.audio_file_path and default_storage.exists(self.audio_file_path):
                default_storage.delete(self.audio_file_path)
        except Exception as e:
            logger.error(f"Error cleaning up audio file: {str(e)}")

    async def _send_error(self, message):
        """Send an error message to the client"""
        await self.send(text_data=json.dumps({
            'type': MessageType.ERROR.value,
            'error': message
        }))

    @database_sync_to_async
    def _get_chat(self):
        """Get the chat object"""
        try:
            return Chat.objects.get(id=self.chat_id, user=self.user)
        except Chat.DoesNotExist:
            return None

    def _is_final_chunk(self, chunk):
        """Determine if this is the final chunk of audio"""
        # Implement logic to determine if this is the final chunk
        # This might be based on silence detection or a signal from the client
        return False  # Placeholder
