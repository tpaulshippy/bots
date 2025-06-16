from django.db import models
import uuid
import json
from django.utils import timezone
from .chat import Chat
from enum import Enum

class TranscriptionStatus(Enum):
    PENDING = 'pending'
    PARTIAL = 'partial'
    COMPLETED = 'completed'
    FAILED = 'failed'

class Message(models.Model):
    chat = models.ForeignKey(Chat, related_name='messages', on_delete=models.CASCADE)
    message_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    text = models.TextField(blank=True)
    role = models.CharField(max_length=50, default='user')
    order = models.IntegerField(default=0)
    input_tokens = models.IntegerField(default=0)
    output_tokens = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)
    image_filename = models.CharField(max_length=255, blank=True, null=True)
    
    # Voice mode fields
    is_voice = models.BooleanField(default=False)
    audio_url = models.URLField(blank=True, null=True)
    transcription_status = models.CharField(
        max_length=20,
        default=TranscriptionStatus.PENDING.value,
        choices=[(status.value, status.name) for status in TranscriptionStatus]
    )
    partial_transcriptions = models.JSONField(default=list, blank=True)
    language = models.CharField(max_length=10, default='en-US')
    audio_duration = models.FloatField(null=True, blank=True)
    
    class Meta:
        ordering = ['created_at']

    def __str__(self):
        user_str = getattr(self.chat.user, 'email', 'unknown')
        profile_str = getattr(self.chat.profile, 'name', 'unknown')
        return f'{user_str} - {profile_str} - {self.text}'
        
    def add_partial_transcription(self, text, is_final=False):
        """Add a partial transcription to the message"""
        self.partial_transcriptions.append({
            'text': text,
            'timestamp': timezone.now().isoformat(),
            'is_final': is_final
        })
        
        # Update the main text with the latest transcription
        self.text = text
        
        # Update status
        if is_final:
            self.transcription_status = TranscriptionStatus.COMPLETED.value
        elif self.transcription_status == TranscriptionStatus.PENDING.value:
            self.transcription_status = TranscriptionStatus.PARTIAL.value
            
        self.save(update_fields=['text', 'transcription_status', 'partial_transcriptions', 'modified_at'])
        return self
        
    def get_latest_transcription(self):
        """Get the most recent transcription"""
        if not self.partial_transcriptions:
            return self.text
        return self.partial_transcriptions[-1]['text']
        
    def to_serializable_dict(self):
        """Convert message to a serializable dictionary"""
        return {
            'id': str(self.message_id),
            'chat_id': str(self.chat_id),
            'text': self.text,
            'role': self.role,
            'created_at': self.created_at.isoformat(),
            'is_voice': self.is_voice,
            'audio_url': self.audio_url,
            'transcription_status': self.transcription_status,
            'partial_transcriptions': self.partial_transcriptions,
            'language': self.language,
            'audio_duration': self.audio_duration
        }