from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from bots.models import AiModel, AppAiModel
from bots.serializers import AiModelSerializer
from django.db import models
class AiModelViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AiModel.objects.all()
    serializer_class = AiModelSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        app_id = self.request.headers.get('x-app-id', 1)
        return AiModel.objects.filter(appaimodel__app_id=app_id).annotate(
            is_default=models.Exists(
                AppAiModel.objects.filter(
                    app_id=app_id,
                    ai_model=models.OuterRef('pk'),
                    is_default=True
                )
            )
        ).order_by('input_token_cost')
