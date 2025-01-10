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

class AiModelViewSet(viewsets.ModelViewSet):
    queryset = AiModel.objects.all()
    serializer_class = AiModelSerializer
    permission_classes = [IsAuthenticated, IsAdminUser]

    from django.db import transaction

    def perform_create(self, serializer):
        with transaction.atomic():
            if serializer.validated_data.get('is_default', False):
                AiModel.objects.update(is_default=False)
            super().perform_create(serializer)

    def perform_update(self, serializer):
        with transaction.atomic():
            instance = serializer.instance
            if serializer.validated_data.get('is_default', False):
                AiModel.objects.exclude(pk=instance.pk).update(is_default=False)
            super().perform_update(serializer)
