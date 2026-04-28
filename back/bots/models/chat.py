from django.conf import settings
from django.db import models, transaction
import uuid
from langchain_aws import ChatBedrock
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage
from langchain_core.tools import tool
from langchain_core.callbacks.base import BaseCallbackHandler
from tavily import TavilyClient
import logging
import base64
import boto3

from .profile import Profile
from .bot import Bot
from .ai_model import AiModel
from .deck import Deck
from .flashcard import Flashcard

logger = logging.getLogger(__name__)

class TokenTracker(BaseCallbackHandler):
    def __init__(self):
        self.input_tokens = 0
        self.output_tokens = 0
    
    def on_llm_end(self, response, *, run_id=None, parent_run_id=None, **kwargs):
        usage_metadata = getattr(response, 'usage_metadata', None)
        if usage_metadata:
            self.input_tokens += usage_metadata.get('input_tokens', 0)
            self.output_tokens += usage_metadata.get('output_tokens', 0)


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
        return self.title if self.user is None else self.user.email + ' - ' + self.title

    def use_default_model(self, ai=None):
        try:
            default_model = AiModel.objects.get(is_default=True)
        except AiModel.DoesNotExist:
            raise ValueError("No default AI model configured in the system")
        
        self.ai = AiClientWrapper(model_id=default_model.model_id, client=ai)

    def get_response(self, ai=None):
        if self.bot and self.bot.ai_model:
            self.ai = AiClientWrapper(model_id=self.bot.ai_model.model_id, client=ai)
        else:
            self.use_default_model(ai)
        
        message_list, contains_image = self.get_input()

        if contains_image and self.bot and 'image' not in self.bot.ai_model.supported_input_modalities:
            self.use_default_model(ai)
        
        if self.user.user_account.over_limit():
            return "You have exceeded your daily limit. Please try again tomorrow or upgrade your subscription."
        
        @tool
        def create_flashcard_deck(name: str, description: str = "", flashcards: list = None) -> str:
            """Create a new flashcard deck with flashcards. Use this when the user wants to create flashcards for studying.
            
            Args:
                name: The name of the deck (e.g., "Biology Test Terms")
                description: Optional description of the deck
                flashcards: Optional list of flashcards, each with 'front' and 'back' keys
            """
            logger.info(f"🃏 CREATE_FLASHCARD_DECK_TOOL_INVOKED: name='{name}'")
            try:
                with transaction.atomic():
                    deck = Deck.objects.create(
                        profile=self.profile,
                        chat=self,
                        name=name,
                        description=description or ""
                    )
                    deck = Deck.objects.select_for_update().get(pk=deck.pk)
                    created_cards = 0
                    if flashcards:
                        for i, card in enumerate(flashcards):
                            Flashcard.objects.create(
                                deck=deck,
                                front=card.get('front', ''),
                                back=card.get('back', ''),
                                order=i
                            )
                            created_cards += 1
                    logger.info(f"🃏 CREATE_FLASHCARD_DECK_SUCCESS: deck_id={deck.deck_id}, cards={created_cards}")
                    return f"Created deck '{name}' with {created_cards} flashcards. Deck ID: {deck.deck_id}"
            except Exception as e:
                logger.error(f"🃏 CREATE_FLASHCARD_DECK_ERROR: {str(e)}")
                return f"Error creating deck: {str(e)}"
        
        @tool
        def create_flashcard(deck_name: str, front: str, back: str) -> str:
            """Add a single flashcard to an existing deck or create a new deck. Use this when the user wants to add flashcards to study.
            
            Args:
                deck_name: The name of the deck to add the card to
                front: The front of the flashcard (question/term)
                back: The back of the flashcard (answer/definition)
            """
            logger.info(f"🃏 CREATE_FLASHCARD_TOOL_INVOKED: deck_name='{deck_name}'")
            try:
                with transaction.atomic():
                    deck = Deck.objects.select_for_update().filter(profile=self.profile, name=deck_name).first()
                    if not deck:
                        deck = Deck.objects.create(
                            profile=self.profile,
                            chat=self,
                            name=deck_name,
                            description=""
                        )
                        deck = Deck.objects.select_for_update().get(pk=deck.pk)
                    max_order = Flashcard.objects.filter(deck=deck).aggregate(models.Max('order'))['order__max'] or -1
                    Flashcard.objects.create(
                        deck=deck,
                        front=front,
                        back=back,
                        order=max_order + 1
                    )
                    logger.info(f"🃏 CREATE_FLASHCARD_SUCCESS: deck={deck.name}")
                    return f"Added flashcard to deck '{deck_name}'. Deck ID: {deck.deck_id}"
            except Exception as e:
                logger.error(f"🃏 CREATE_FLASHCARD_ERROR: {str(e)}")
                return f"Error creating flashcard: {str(e)}"
        
        tools = [create_flashcard_deck, create_flashcard]
        
        chat_model = ChatBedrock(model_id=self.ai.model_id)
        model_with_tools = chat_model.bind_tools(tools)
        
        web_search = None
        
        if self.bot and self.bot.enable_web_search and settings.TAVILY_API_KEY:
            logger.info(f"Web search enabled for bot {self.bot.name}")
            tavily_client = TavilyClient(api_key=settings.TAVILY_API_KEY)
            
            @tool
            def web_search(query: str) -> str:
                """Search the web for current information. Use this when you need up-to-date information or facts that may not be in your training data."""
                logger.info(f"🔍 WEB_SEARCH_TOOL_INVOKED: query='{query}'")
                try:
                    results = tavily_client.search(query=query)
                    num_results = len(results.get('results', []))
                    logger.info(f"🔍 WEB_SEARCH_SUCCESS: returned {num_results} results")
                    if results.get('results'):
                        formatted = "\n".join([
                            f"- {r.get('title', 'No title')}: {r.get('content', '')[:200]}"
                            for r in results['results'][:3]
                        ])
                        logger.debug(f"🔍 WEB_SEARCH_FORMATTED_RESULTS:\n{formatted}")
                        return formatted
                    else:
                        logger.info("🔍 WEB_SEARCH_NO_RESULTS: empty result set")
                        return "No results found."
                except Exception as e:
                    logger.error(f"🔍 WEB_SEARCH_ERROR: {str(e)}")
                    return f"Error during search: {str(e)}"
            
            tools.append(web_search)
            model_with_tools = chat_model.bind_tools(tools)
        
        has_web_search = web_search is not None
        
        if has_web_search:
            logger.info(f"Invoking agent with full context ({len(message_list)} messages)")
            logger.info("🤖 AGENT_INVOKE_START: web_search and flashcard tools available")
        else:
            logger.info(f"Invoking agent with flashcard tools only ({len(message_list)} messages)")
            logger.info("🤖 AGENT_INVOKE_START: flashcard tools available (web_search disabled)")
        
        messages = message_list
        
        max_iterations = 5
        iteration = 0
        
        while iteration < max_iterations:
            iteration += 1
            logger.info(f"🤖 AGENT_LOOP_ITERATION: {iteration}")
            
            response = model_with_tools.invoke(messages)
            messages.append(response)
            
            if not response.tool_calls:
                logger.info(f"🤖 AGENT_LOOP_COMPLETE: no more tool calls after {iteration} iterations")
                break
            
            for tool_call in response.tool_calls:
                tool_name = tool_call["name"]
                tool_args = tool_call["args"]
                logger.info(
                    "🔍 AGENT_TOOL_CALL: %s with arg keys: %s",
                    tool_name,
                    list(tool_args.keys()) if isinstance(tool_args, dict) else type(tool_args).__name__,
                )
                
                if tool_name == "web_search":
                    if has_web_search:
                        tool_result = web_search.invoke(tool_args)
                    else:
                        tool_result = "Web search is not available."
                elif tool_name == "create_flashcard_deck":
                    tool_result = create_flashcard_deck.invoke(tool_args)
                elif tool_name == "create_flashcard":
                    tool_result = create_flashcard.invoke(tool_args)
                else:
                    tool_result = f"Unknown tool: {tool_name}"
                
                logger.info(f"🔍 AGENT_TOOL_RESULT: {tool_result[:100]}")
                
                messages.append(ToolMessage(
                    content=tool_result,
                    tool_call_id=tool_call["id"],
                    name=tool_name
                ))
        
        logger.info("🤖 AGENT_LOOP_COMPLETE: extracting final response")
        
        response_text = ""
        usage_metadata = {"input_tokens": 0, "output_tokens": 0}
        
        for msg in reversed(messages):
            if isinstance(msg, AIMessage) and not msg.tool_calls:
                if isinstance(msg.content, str):
                    response_text = msg.content
                elif isinstance(msg.content, list):
                    text_parts = []
                    for item in msg.content:
                        if isinstance(item, dict) and item.get('type') == 'text':
                            text_parts.append(item.get('text', ''))
                        elif isinstance(item, str):
                            text_parts.append(item)
                    response_text = "".join(text_parts).strip()
                
                if hasattr(msg, 'usage_metadata') and msg.usage_metadata:
                    usage_metadata = msg.usage_metadata
                
                logger.info(f"🤖 FINAL_RESPONSE: {len(response_text)} chars")
                break
        
        if not response_text:
            for msg in reversed(messages):
                if isinstance(msg, AIMessage):
                    if isinstance(msg.content, str):
                        response_text = msg.content
                    elif isinstance(msg.content, list):
                        text_parts = [item.get('text', '') for item in msg.content if isinstance(item, dict) and item.get('type') == 'text']
                        response_text = "".join(text_parts).strip()
                    break
        
        message_order = self.messages.count()
        
        input_tokens = usage_metadata.get('input_tokens', 0)
        output_tokens = usage_metadata.get('output_tokens', 0)
        
        self.messages.create(
            text=response_text, 
            role='assistant', 
            order=message_order,
            input_tokens=input_tokens,
            output_tokens=output_tokens
        )
        self.input_tokens += input_tokens
        self.output_tokens += output_tokens
        self.save()
        return response_text

    def _extract_agent_input(self, message_list):
        """Extract text input from message_list for the agent.
        
        Handles both simple text and multimodal content.
        Assumes message_list has system message at index 0 and user message at end.
        """
        # Find the last non-system message (should be the user's query)
        user_input = ""
        for msg in reversed(message_list):
            if isinstance(msg, HumanMessage):
                if isinstance(msg.content, list):
                    # Multimodal content - extract text
                    for item in msg.content:
                        if isinstance(item, dict) and item.get('type') == 'text':
                            user_input = item.get('text', '')
                            break
                else:
                    # Simple text content
                    user_input = msg.content
                break
        
        return user_input if user_input else "Please help me."
    
    def get_response_standard(self, message_list, ai=None):
        """Handle response without web search."""
        response = self.ai.invoke(message_list)

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
