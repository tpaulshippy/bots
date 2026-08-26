from rest_framework import serializers

from bots.models import Bot, Profile


class ActivityProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ['profile_id', 'name']


class ActivityBotSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bot
        fields = ['bot_id', 'name', 'color', 'icon']


class ActivityChatListSerializer(serializers.Serializer):
    """Row of the parent activity inbox. Fields are annotations on the Chat queryset."""

    chat_id = serializers.UUIDField()
    title = serializers.CharField()
    profile = ActivityProfileSerializer()
    bot = ActivityBotSerializer(allow_null=True)
    message_count = serializers.IntegerField()
    last_message_preview = serializers.CharField(allow_null=True, allow_blank=True)
    last_message_at = serializers.DateTimeField(allow_null=True)
    safety_event_count = serializers.IntegerField(read_only=True)


class ActivityBotCountSerializer(serializers.Serializer):
    name = serializers.CharField(allow_null=True)
    count = serializers.IntegerField()


class ActivityProfileSummarySerializer(serializers.Serializer):
    profile_id = serializers.UUIDField()
    name = serializers.CharField(allow_null=True, allow_blank=True)
    chat_count = serializers.IntegerField()
    message_count = serializers.IntegerField()
    safety_event_count = serializers.IntegerField(read_only=True)
    top_bots = ActivityBotCountSerializer(many=True)


class ActivitySummarySerializer(serializers.Serializer):
    profiles = ActivityProfileSummarySerializer(many=True)
