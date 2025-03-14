from django.contrib import admin
from django.apps import apps
from .models import Chat, Message, Profile, Bot, UserAccount, UsageLimitHit, AiModel, Device, RevenueCatWebhookEvent

class BaseAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return ['created_at', 'modified_at']

def register_all_models():
    app_models = apps.get_models()
    for model in app_models:
        if hasattr(model, 'created_at') and hasattr(model, 'modified_at'):
            admin_class = type(f"{model.__name__}Admin", (BaseAdmin,), {})
            admin.site.register(model, admin_class)     

register_all_models()
admin.site.register(UserAccount)