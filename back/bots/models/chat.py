import base64
import logging
import uuid

import boto3
from django.conf import settings
from django.db import models, transaction
from langchain_aws import ChatBedrock
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from bots.services import fake_ai
from bots.services.chat_agent import ChatAgentService
from bots.services.safety import (
    SafetyPolicy,
    build_system_prompt,
    evaluate_text,
    record_safety_event,
    refusal_for_verdict,
)

from .ai_model import AiModel
from .bot import Bot
from .profile import Profile

logger = logging.getLogger(__name__)

S3_CLIENT = boto3.client('s3')
S3_BUCKET = settings.AWS_STORAGE_BUCKET_NAME

class AiClientWrapper:
    def __init__(self, model_id, client=None):
        self.model_id = model_id
        if client:
            self.client = client
        elif model_id.startswith(fake_ai.FAKE_MODEL_PREFIX):
            # Deterministic fake streaming client for e2e/demo — no AWS creds.
            self.client = fake_ai.FakeStreamingClient()
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
        self.last_client_events = []

    def __str__(self):
        return self.title if self.user is None else self.user.email + ' - ' + self.title

    def use_default_model(self, ai=None):
        try:
            default_model = AiModel.objects.get(is_default=True)
        except AiModel.DoesNotExist:
            raise ValueError("No default AI model configured in the system")
        
        self.ai = AiClientWrapper(model_id=default_model.model_id, client=ai)

    def _input_refusal(self, user_message=None):
        """Evaluate input safety BEFORE any model setup or quota check.

        Returns the fixed refusal text when the latest user turn is blocked
        (marking it so later turns exclude it via get_input()), else None.
        A misconfigured model or an over-limit account can therefore never
        swallow the crisis refusal or leave the unsafe message unmarked.
        """
        policy = SafetyPolicy.for_bot(self.bot)
        subject = user_message or self.messages.filter(role='user').order_by('-id').first()
        if subject is None:
            return None
        verdict = evaluate_text(subject.text, policy, source='INPUT')
        if not verdict.blocked:
            return None
        # Short transaction only for the state change; external calls
        # (moderation, Bedrock, Tavily) are never made while a row
        # lock is held, so the DB connection is not held for tens of
        # seconds.
        with transaction.atomic():
            Chat.objects.select_for_update().get(pk=self.pk)
            if not subject.safety_blocked:
                subject.safety_blocked = True
                subject.save(update_fields=['safety_blocked', 'modified_at'])
            refusal = refusal_for_verdict(verdict)
            self.messages.create(
                text=refusal,
                role='assistant',
                order=self.messages.count(),
            )
            record_safety_event(
                stage='input',
                verdict=verdict,
                chat=self,
                snippet=subject.text,
            )
        return refusal

    def resolve_ai_client(self, ai=None, contains_image=False):
        if self.bot and self.bot.ai_model:
            self.ai = AiClientWrapper(model_id=self.bot.ai_model.model_id, client=ai)
        else:
            self.use_default_model(ai)

        if contains_image and self.bot and self.bot.ai_model and 'image' not in self.bot.ai_model.supported_input_modalities:
            self.use_default_model(ai)

    def get_response(self, ai=None, user_message=None):
        # Input safety is evaluated BEFORE any model setup or quota check so
        # a misconfigured model or an over-limit account cannot swallow the
        # fixed crisis refusal or leave the unsafe message unmarked.
        refusal = self._input_refusal(user_message=user_message)
        if refusal is not None:
            return refusal

        if self.user.user_account.over_limit():
            return "You have exceeded your daily limit. Please try again tomorrow or upgrade your subscription."

        policy = SafetyPolicy.for_bot(self.bot)
        # AI client is instantiated only after input has passed the global
        # floor, so a missing default model never blocks the crisis path.
        # Context is built AFTER the blocked check so any safety-blocked
        # message (including this turn's) is excluded from model history.
        # This work is done outside any DB transaction.
        message_list, contains_image = self.get_input()
        self.resolve_ai_client(ai=ai, contains_image=contains_image)

        service = ChatAgentService(self, self.ai.client, policy=policy)
        response_text, usage_metadata = service.respond(message_list)
        # Structured tool results for the legacy `events[]` payload (doc 06 §3).
        self.last_client_events = service.client_events

        # Post-model output filter: replace flagged completions before save.
        output_verdict = evaluate_text(response_text, policy, source='OUTPUT')
        flagged_output = None
        if output_verdict.blocked:
            flagged_output = response_text
            response_text = refusal_for_verdict(output_verdict)

        # Short transaction only for the final persist; the row lock is held
        # briefly to claim the message order, not across the model call.
        with transaction.atomic():
            Chat.objects.select_for_update().get(pk=self.pk)
            message_order = self.messages.count()
            input_tokens = usage_metadata.get('input_tokens', 0)
            output_tokens = usage_metadata.get('output_tokens', 0)
            self.messages.create(
                text=response_text,
                role='assistant',
                order=message_order,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
            self.input_tokens += input_tokens
            self.output_tokens += output_tokens
            self.save()
            if output_verdict.blocked:
                record_safety_event(stage='output', verdict=output_verdict, chat=self, snippet=flagged_output)
        return response_text

    def stream_response(self, ai=None, message_id=None):
        """Yield agent events for SSE while persisting the assistant message.

        The assistant row is persisted on `done` with token totals. On early
        exit (client disconnect / abort mid-stream) the partial text is saved
        so history matches what the kid saw (roadmap doc 06 §2 "prefer save
        partial"). Partial saves carry the usage accumulated so far.
        """
        # Blocked input short-circuits the stream with the fixed refusal,
        # already persisted by _input_refusal — never streamed to the model.
        refusal = self._input_refusal()
        if refusal is not None:
            yield {"type": "token", "text": refusal}
            yield {"type": "done", "input_tokens": 0, "output_tokens": 0}
            return

        message_list, contains_image = self.get_input()
        self.resolve_ai_client(ai=ai, contains_image=contains_image)

        if self.user.user_account.over_limit():
            yield {"type": "error", "code": "over_limit",
                   "message": "You have exceeded your daily limit. Please try again tomorrow or upgrade your subscription."}
            return

        service = ChatAgentService(self, self.ai.client)
        self.last_client_events = service.client_events

        streamed_text = []
        usage_totals = {"input_tokens": 0, "output_tokens": 0}

        def persist(text):
            self._persist_assistant_message(text, usage_totals)

        try:
            for event in service.respond_events(message_list):
                event_type = event.get("type")
                if event_type == "token":
                    streamed_text.append(event.get("text", ""))
                elif event_type == "done":
                    usage_totals["input_tokens"] += event.get("input_tokens", 0) or 0
                    usage_totals["output_tokens"] += event.get("output_tokens", 0) or 0
                yield event
        finally:
            # Runs both after normal completion and on GeneratorExit when the
            # client disconnects mid-stream: whatever the kid saw gets saved.
            text = "".join(streamed_text)
            if text.strip():
                persist(text)


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
        # Safety-blocked messages are excluded: denied content never becomes
        # later model context even after the turn ends.
        messages = (
            self.messages.exclude(role='system')
            .exclude(safety_blocked=True)
            .order_by('-id')[:10]
        )
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
        """Server-owned layered prompt: preamble + parent customization + policy suffix.

        The flags are restated here every turn so a custom (advanced-editor)
        system_prompt cannot strip the safety layers, and the client is never
        the control plane for policy text.
        """
        policy = SafetyPolicy.for_bot(self.bot)
        bot_prompt = self.bot.system_prompt if self.bot else None
        response_length = self.bot.response_length if self.bot else None
        return build_system_prompt(bot_prompt, policy, response_length)

    def get_image_data(self, filename):
        try:
            response = S3_CLIENT.get_object(Bucket=S3_BUCKET, Key=filename)
            image_data = response['Body'].read()
            return base64.b64encode(image_data).decode('utf-8')
        except Exception as e:
            raise ValueError(f'Unable to retrieve image from S3: {e!s}')
