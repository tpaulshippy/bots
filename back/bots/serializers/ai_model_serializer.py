from rest_framework import serializers
from bots.models import AiModel

class AiModelSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = AiModel
        fields = [
            'id',
            'created_at',
            'modified_at',
            'model_id',
            'name',
            'input_token_cost',
            'output_token_cost',
            'is_default',
            'url'] 