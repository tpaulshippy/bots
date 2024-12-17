from django.db import models
import uuid
import boto3
import json

MODEL_ID = "us.amazon.nova-lite-v1:0"

def get_bedrock_client():
    llm = boto3.client("bedrock-runtime", region_name="us-west-2")

    return llm


class Chat(models.Model):
    chat_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return str(self.chat_id)

    def get_response(self, ai=get_bedrock_client()):
        message_list = self.get_input()

        response = ai.converse(
            modelId=MODEL_ID, 
            messages=message_list
        )
        response_text = response["output"]["message"]["content"][0]["text"]
        self.messages.create(text=response_text, role='assistant')

        

    def get_input(self):
        messages = self.messages.all()
        message_list = [{"role": message.role, "content": [{"text": message.text}]} for message in messages]
        return message_list
