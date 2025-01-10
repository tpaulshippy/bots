from rest_framework import viewsets, serializers
from rest_framework.permissions import IsAuthenticated, IsAdminUser
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

class AiModelViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AiModel.objects.all()
    serializer_class = AiModelSerializer
    permission_classes = [IsAuthenticated]
