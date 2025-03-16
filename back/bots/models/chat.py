from django.conf import settings
from django.db import models
import uuid
from langchain_aws import ChatBedrock
from langchain.schema import HumanMessage, SystemMessage, AIMessage
import requests
import base64
import boto3

from .profile import Profile
from .bot import Bot
from .app_ai_model import AppAiModel

S3_CLIENT = boto3.client('s3')
S3_BUCKET = settings.AWS_STORAGE_BUCKET_NAME

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
    bot = models.ForeignKey(Bot, related_name='chats', on_delete=models.CASCADE, null=True)
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

    def use_default_model(self, ai=None):
        try:
            app = self.bot.app
            default_model = app.app_ai_models.get(is_default=True)
            ai_model = default_model.ai_model
        except AppAiModel.DoesNotExist:
            raise ValueError("No default AI model configured in the system")
        
        self.ai = AiClientWrapper(model_id=ai_model.model_id, client=ai)
    
    def use_cheapest_image_processing_model(self, ai=None):
        app = self.bot.app
        cheapest_models = app.app_ai_models.order_by('ai_model__input_token_cost')
        for model in cheapest_models:
            if 'image' in model.ai_model.supported_input_modalities:
                self.ai = AiClientWrapper(model_id=model.ai_model.model_id, client=ai)
                return

        raise ValueError("No image processing AI model configured in the system")

    def get_response(self, ai=None):
        if self.bot and self.bot.ai_model:
            self.ai = AiClientWrapper(model_id=self.bot.ai_model.model_id, client=ai)
        else:
            self.use_default_model(ai)
        
        message_list, contains_image = self.get_input()

        # Check if any messages have image_filename and if the model supports images
        if contains_image and self.bot and 'image' not in self.bot.ai_model.supported_input_modalities:
            self.use_cheapest_image_processing_model(ai)
        
        if self.user.user_account.over_limit():
            return "You have exceeded your daily limit. Please try again tomorrow or upgrade your subscription."
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
        

    def setup_human_message_content(self, message):
        if self.has_image(message):
            return [
                {"type": "text", "text": message.text},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{self.get_image_data(message.image_filename)}"
                    }
                }
            ]
        return [{"type": "text", "text": message.text}]
    
    def has_image(self, message: HumanMessage):
        return hasattr(message, 'image_filename') and message.image_filename

    def get_input(self):
        contains_image = False
        messages = self.messages.exclude(role='system').order_by('-id')[:10]
        messages = sorted(messages, key=lambda message: message.id)
        message_list = []

        for message in messages:
            if self.has_image(message):
                contains_image = True
            if message.role == "user":
                human_message_content = self.setup_human_message_content(message)
                message_list.append(HumanMessage(content=human_message_content))
            elif message.role == "assistant":
                if len(message_list) > 0: # need to start with a user message
                    message_list.append(AIMessage(content=message.text))

        system_message = SystemMessage(content=self.get_system_message())
        message_list.insert(0, system_message)

        return message_list, contains_image
    
    def get_system_message(self):
        if self.bot and self.bot.system_prompt:
            return self.bot.system_prompt
        return "You are chatting with a teen. Please keep the conversation appropriate and respectful. Your responses should be 200 words or less."

    def get_image_data(self, filename):
        try:
            response = S3_CLIENT.get_object(Bucket=S3_BUCKET, Key=filename)
            image_data = response['Body'].read()
            return base64.b64encode(image_data).decode('utf-8')
        except Exception as e:
            raise ValueError(f'Unable to retrieve image from S3: {str(e)}')
