from django.contrib import admin
from .models import Chat, Message, Profile, Bot

admin.site.register(Chat)
admin.site.register(Message)
admin.site.register(Profile)
admin.site.register(Bot)

