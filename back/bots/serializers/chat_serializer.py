from rest_framework import serializers
from bots.models import Chat, Profile, Bot
from .message_serializer import MessageSerializer
from .profile_serializer import ProfileIdSerializer
from .bot_serializer import BotSerializer

class ChatListSerializer(serializers.HyperlinkedModelSerializer):
    message_count = serializers.IntegerField(read_only=True)
    profile = ProfileIdSerializer(read_only=True)
    bot = BotSerializer(read_only=True)

    class Meta:
        model = Chat
        fields = ['id', 
                'chat_id', 
                'profile',
                'bot',
                'title', 
                'message_count',
                'input_tokens',
                'output_tokens',
                'created_at', 
                'modified_at', 
                'url']

class ChatSerializer(serializers.HyperlinkedModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)
    profile = ProfileIdSerializer(read_only=True)

    class Meta:
        model = Chat
        fields = ['id', 
                'chat_id',
                'profile',
                'title', 
                'messages',
                'input_tokens',
                'output_tokens',
                'created_at', 
                'modified_at'] 