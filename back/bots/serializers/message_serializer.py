import boto3
from django.conf import settings
from rest_framework import serializers

from bots.models import Message


class MessageSerializer(serializers.HyperlinkedModelSerializer):
    image_url = serializers.SerializerMethodField()
    agent_events = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            'id', 
            'chat_id',
            'message_id', 
            'order', 
            'role', 
            'text', 
            'input_tokens',
            'output_tokens',
            'created_at', 
            'modified_at',
            'image_url',
            'agent_events'
        ]

    def get_agent_events(self, obj):
        # Already stored frontend-ready by Chat persist (see
        # client_events_to_agent_events); pre-fix rows default to [].
        return getattr(obj, 'agent_events', None) or []

    def get_image_url(self, obj):
        if obj.image_filename:
            s3 = boto3.client('s3')
            bucket_name = settings.AWS_STORAGE_BUCKET_NAME
            image_url = s3.generate_presigned_url('get_object', 
                Params={'Bucket': bucket_name, 'Key': obj.image_filename}, 
                ExpiresIn=3600)
            return image_url
        return None