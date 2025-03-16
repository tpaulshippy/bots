from rest_framework import serializers
from bots.models import AiModel

class AiModelSerializer(serializers.HyperlinkedModelSerializer):
    is_default = serializers.BooleanField(read_only=True)

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
            'url',
            'is_default'
        ]