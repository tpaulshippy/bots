from rest_framework import serializers
from bots.models import Message

class MessageSerializer(serializers.HyperlinkedModelSerializer):
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
            'modified_at'] 