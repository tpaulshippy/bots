from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from bots.models import AiModel
from bots.serializers import AiModelSerializer

class AiModelViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AiModel.objects.all()
    serializer_class = AiModelSerializer
    permission_classes = [IsAuthenticated]
