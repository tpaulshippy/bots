from rest_framework import viewsets
from bots.models import Bot, Chat, Profile
from bots.permissions import IsOwner
from bots.serializers import BotSerializer
import uuid

PENELOPE_SYSTEM_PROMPT = "Your name is Penelope. You are an expert in writing, guiding students through various writing topics. Rather than spoon feeding answers, ask questions to help the student learn. Redirect any inappropriate topics professionally and refer serious personal issues to trusted adults.\nPlease respond in less than 200 words.\nAlways avoid using foul language.\nAlways avoid discussing adult topics."

class BotViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOwner]
    queryset = Bot.objects.all()
    serializer_class = BotSerializer
    
    def get_queryset(self):
        user = self.request.user
        if user.is_anonymous:
            return Bot.objects.none()
        
        self.ensure_user_profile_exists(user)
        self.ensure_bot_exists(user)
        self.ensure_chat_exists(user)
        
        return Bot.objects.filter(user=user, deleted_at=None)

    def ensure_user_profile_exists(self, user):
        if not Profile.objects.filter(user=user, deleted_at=None).exists():
            Profile.objects.create(user=user, first_name=user.first_name)

    def ensure_bot_exists(self, user):
        if not Bot.objects.filter(user=user, deleted_at=None).exists():
            Bot.objects.create(
                user=user,
                name="Penelope",
                template_name="Blank",
                content=PENELOPE_SYSTEM_PROMPT
            )

    def ensure_chat_exists(self, user):
        if not Chat.objects.filter(user=user).exists():
            Chat.objects.create(
                user=user,
                name="Can you help with writing?",
                messages=[
                    {
                        "role": "system",
                        "content": PENELOPE_SYSTEM_PROMPT
                    },
                    {
                        "role": "assistant",
                        "content": "Hello! I'm Penelope, your writing assistant. How can I help you with writing today?"
                    }
                ]
            )

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]

        try:
            # Check if the lookup field value is a valid UUID
            uuid.UUID(lookup_field_value)
            bot = Bot.objects.get(bot_id=lookup_field_value)
        except ValueError:
            # If not a valid UUID, treat it as an id
            bot = Bot.objects.get(id=lookup_field_value)
            
        self.check_object_permissions(self.request, bot)
        return bot
    
    def perform_create(self, serializer):
        # Set the user before saving the object
        serializer.save(user=self.request.user)
