from rest_framework import serializers
from bots.models import Message
import boto3
from django.conf import settings
class MessageSerializer(serializers.HyperlinkedModelSerializer):
    image_url = serializers.SerializerMethodField()

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
            'image_url'
        ]

    def get_image_url(self, obj):
        if obj.image_filename:
            s3 = boto3.client('s3')
            bucket_name = settings.AWS_STORAGE_BUCKET_NAME
            image_url = s3.generate_presigned_url('get_object', 
                Params={'Bucket': bucket_name, 'Key': obj.image_filename}, 
                ExpiresIn=3600)
            return image_url
        return None