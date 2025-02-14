from rest_framework import serializers
from bots.models import Bot, AiModel

class BotSerializer(serializers.HyperlinkedModelSerializer):
    ai_model = serializers.SlugRelatedField(
        queryset=AiModel.objects.all(),
        slug_field='model_id',
    )
    class Meta:
        model = Bot
        fields = [
            'id',
            'bot_id',
            'name',
            'ai_model',
            'system_prompt',
            'simple_editor',
            'template_name',
            'response_length',
            'restrict_adult_topics',
            'restrict_language',
            'created_at',
            'modified_at',
            'deleted_at',
            'url'] 