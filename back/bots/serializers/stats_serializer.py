from rest_framework import serializers


class StatsDaySerializer(serializers.Serializer):
    """One UTC day bucket of kid activity (see bots/services/stats.py)."""

    date = serializers.DateField()
    messages = serializers.IntegerField()
    reviews = serializers.IntegerField()


class StatsSerializer(serializers.Serializer):
    """Gamification stats for one profile, fed by chat + flashcard use."""

    profile_id = serializers.CharField()
    name = serializers.CharField()
    current_streak = serializers.IntegerField()
    longest_streak = serializers.IntegerField()
    total_chats = serializers.IntegerField()
    total_messages = serializers.IntegerField()
    total_reviews = serializers.IntegerField()
    chatted_today = serializers.BooleanField()
    studied_today = serializers.BooleanField()
    week = StatsDaySerializer(many=True)
