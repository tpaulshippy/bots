from django.db import models
import uuid
import json
from langchain_aws import ChatBedrock
from .profile import Profile

MODEL_ID = "us.amazon.nova-micro-v1:0"

def get_bedrock_client():
    llm = ChatBedrock(model_id=MODEL_ID)

    return llm


class Chat(models.Model):
    profile = models.ForeignKey(Profile, related_name='profiles', on_delete=models.CASCADE, null=True)
    chat_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    title = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return str(self.chat_id)

    def get_response(self, ai=get_bedrock_client()):
        message_list = self.get_input()

        response = ai.invoke(
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
        return response_text
        

    def get_input(self):
        messages = self.messages.exclude(role='system').order_by('-id')[:10]
        messages = sorted(messages, key=lambda message: message.id)
        message_list = [{"role": message.role, "content": [{"text": message.text}]} for message in messages]
        
        system_message = {"role": "system", "content": [{"text": self.get_system_message()}]}
        message_list.insert(0, system_message)
    
        return message_list
    
    def get_system_message(self):
        return "You are chatting with a teen. Please keep the conversation appropriate and respectful. Your responses should be 200 words or less."
