from django.contrib import admin
from .models import Chat, Message, Profile, Bot, UserAccount, UsageLimitHit, AiModel

admin.site.register(Chat)
admin.site.register(Message)
admin.site.register(Profile)
admin.site.register(Bot)
admin.site.register(UserAccount)
admin.site.register(UsageLimitHit)
admin.site.register(AiModel)
