from django.db import models
import uuid
import json
from langchain_aws import ChatBedrock

MODEL_ID = "us.amazon.nova-lite-v1:0"

def get_bedrock_client():
    llm = ChatBedrock(model_id=MODEL_ID)

    return llm


class Chat(models.Model):
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
        message_order = self.messages.count()
        self.messages.create(text=response_text, role='assistant', order=message_order)
        return response_text
        

    def get_input(self):
        messages = self.messages.all()
        message_list = [{"role": message.role, "content": [{"text": message.text}]} for message in messages]
        return message_list
