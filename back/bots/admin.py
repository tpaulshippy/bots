from django.contrib import admin
from .models import Chat, Message, Profile, Bot, UserAccount, UsageLimitHit, AiModel, Device, RevenueCatWebhookEvent, Deck, Flashcard
from django.contrib.auth.models import User
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

class UsageLimitHitAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return ['created_at', 'modified_at']
    
    def get_list_display(self, request):
        return ['user_account', 'subscription_level', 'total_input_tokens', 'total_output_tokens'] + list(super().get_list_display(request))
    

class AiModelAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return ['created_at', 'modified_at', 'model_id']
    
    def get_list_display(self, request):
        return ['model_id', 'created_at', 'modified_at'] + list(super().get_list_display(request))

class ChatAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return ['created_at', 'modified_at', 'chat_id']

    def get_list_display(self, request):
        return ['chat_id', 'created_at', 'modified_at'] + list(super().get_list_display(request))

class MessageAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return ['created_at', 'modified_at', 'message_id']

    def get_list_display(self, request):
        return ['message_id', 'created_at', 'modified_at'] + list(super().get_list_display(request))

class ProfileAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return ['created_at', 'modified_at', 'profile_id']

    def get_list_display(self, request):
        return ['profile_id', 'name', 'user', 'oauth_email', 'created_at', 'modified_at'] + list(super().get_list_display(request))

class BotAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return ['created_at', 'modified_at', 'bot_id']

    def get_list_display(self, request):
        return ['bot_id', 'created_at', 'modified_at'] + list(super().get_list_display(request))

class DeviceAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return ['created_at', 'modified_at', 'device_id']

    def get_list_display(self, request):
        return ['device_id', 'created_at', 'modified_at'] + list(super().get_list_display(request))
    

class RevenueCatWebhookEventAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return ['created_at', 'raw_event']
    
    def get_list_display(self, request):
        return ['created_at', 'raw_event'] + list(super().get_list_display(request))

class DeckAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return ['deck_id', 'created_at', 'updated_at']
    
    def get_list_display(self, request):
        return ['deck_id', 'name', 'profile', 'chat', 'card_count', 'created_at', 'updated_at'] + list(super().get_list_display(request))

class FlashcardAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return ['flashcard_id', 'created_at', 'updated_at']
    
    def get_list_display(self, request):
        return ['flashcard_id', 'deck', 'front', 'order', 'created_at', 'updated_at'] + list(super().get_list_display(request))

class UserAccountAdmin(admin.ModelAdmin):
    def get_list_display(self, request):
        return ['user_id', 'pin', 'subscription_level', 'timezone'] + list(super().get_list_display(request))

class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'email', 'first_name', 'last_name', 'date_joined']
    ordering = ['-date_joined']

admin.site.register(Chat, ChatAdmin)
admin.site.register(Message, MessageAdmin)
admin.site.register(Profile, ProfileAdmin)
admin.site.register(Bot, BotAdmin)
admin.site.register(Device, DeviceAdmin)
admin.site.register(UserAccount, UserAccountAdmin)
admin.site.register(AiModel, AiModelAdmin)
admin.site.register(UsageLimitHit, UsageLimitHitAdmin)
admin.site.register(RevenueCatWebhookEvent, RevenueCatWebhookEventAdmin)
admin.site.register(Deck, DeckAdmin)
admin.site.register(Flashcard, FlashcardAdmin)
admin.site.unregister(User)
admin.site.register(User, UserAdmin)
