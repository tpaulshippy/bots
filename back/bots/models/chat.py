from django.conf import settings
from django.db import models
import uuid
import json
from langchain_aws import ChatBedrock
from langchain.schema import HumanMessage, SystemMessage, AIMessage

from .profile import Profile

DEFAULT_MODEL_ID = "us.amazon.nova-lite-v1:0"

class AiClientWrapper:
    def __init__(self, model_id, client=None):
        self.model_id = model_id
        if client:
            self.client = client
        else:
            self.client = ChatBedrock(model_id=model_id)

    def invoke(self, message_list):
        return self.client.invoke(message_list)

class Chat(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True
    )
    profile = models.ForeignKey(Profile, related_name='profiles', on_delete=models.CASCADE, null=True)
    bot = models.ForeignKey('Bot', related_name='chats', on_delete=models.CASCADE, null=True)
    chat_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    title = models.CharField(max_length=100, blank=True)
    input_tokens = models.IntegerField(default=0)
    output_tokens = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.ai = None

    def __str__(self):
        return self.title if self.user == None else self.user.email + ' - ' + self.title

    def get_response(self, ai=None):
        if self.bot and self.bot.model:
            self.ai = AiClientWrapper(model_id=self.bot.model, client=ai)
        else:
            self.ai = AiClientWrapper(model_id=DEFAULT_MODEL_ID, client=ai)
        
        if self.user.user_account.over_limit():
            return "You have exceeded your daily limit. Please try again tomorrow or upgrade your subscription."
        message_list = self.get_input()

        response = self.ai.invoke(
            message_list
        )

        response_text = response.content
        usage_metadata = response.usage_metadata
        message_order = self.messages.count()
        self.messages.create(
            text=response_text, 
            role='assistant', 
            order=message_order,
            input_tokens=usage_metadata['input_tokens'],
            output_tokens=usage_metadata['output_tokens']
        )
        self.input_tokens += usage_metadata['input_tokens']
        self.output_tokens += usage_metadata['output_tokens']
        self.save()
        return response_text
        

    def get_input(self):
        messages = self.messages.exclude(role='system').order_by('-id')[:10]
        messages = sorted(messages, key=lambda message: message.id)
        message_list = []
        
        for message in messages:
            if message.role == "user":
                message_list.append(HumanMessage(content=message.text))
            elif message.role == "assistant":
                if len(message_list) > 0: # need to start with a user message
                    message_list.append(AIMessage(content=message.text))
        
        system_message = SystemMessage(content=self.get_system_message())
        message_list.insert(0, system_message)
    
        return message_list
    
    def get_system_message(self):
        if self.bot and self.bot.system_prompt:
            return self.bot.system_prompt
        return "You are chatting with a teen. Please keep the conversation appropriate and respectful. Your responses should be 200 words or less."
