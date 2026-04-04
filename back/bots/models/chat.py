from django.conf import settings
from django.db import models
import uuid
from langchain_aws import ChatBedrock
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_core.tools import tool
from langchain_core.callbacks.base import BaseCallbackHandler
from langchain.agents import create_agent
from tavily import TavilyClient
import logging
import base64
import boto3

from .profile import Profile
from .bot import Bot
from .ai_model import AiModel

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
        
        # Use agent with tool calling if web search is enabled
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
                    # Format results as a readable string for the model
                    if results.get('results'):
                        formatted = "\n".join([
                            f"- {r.get('title', 'No title')}: {r.get('content', '')[:200]}"
                            for r in results['results'][:3]
                        ])
                        logger.debug(f"🔍 WEB_SEARCH_FORMATTED_RESULTS:\n{formatted}")
                        return formatted
                    else:
                        logger.info(f"🔍 WEB_SEARCH_NO_RESULTS: empty result set")
                        return "No results found."
                except Exception as e:
                    logger.error(f"🔍 WEB_SEARCH_ERROR: {str(e)}")
                    return f"Error during search: {str(e)}"
            
            
            # Create chat model
            chat_model = ChatBedrock(model_id=self.ai.model_id)
            tools = [web_search]
            
            # Create modern agent with tool calling support
            # This is the recommended approach per LangChain docs
            agent = create_agent(
                model=chat_model,
                tools=tools,
                system_prompt=self.get_system_message(),
                debug=settings.DEBUG
            )
            
            # Extract text input from message_list for agent
            agent_input = self._extract_agent_input(message_list)
            
            logger.info(f"Invoking agent with input: {agent_input[:100]}...")
            logger.info(f"🤖 AGENT_INVOKE_START: web_search tool available")
            
            # Invoke agent - the CompiledStateGraph handles tool loop internally
            response = agent.invoke({"messages": [HumanMessage(content=agent_input)]})
            
            logger.info(f"🤖 AGENT_INVOKE_COMPLETE: got response")
            
            # Extract response text from the agent result
            # The response is a dict with 'messages' key containing final messages
            response_text = ""
            usage_metadata = {"input_tokens": 0, "output_tokens": 0}
            
            if isinstance(response, dict) and "messages" in response:
                for msg in reversed(response["messages"]):
                    if isinstance(msg, AIMessage):
                        response_text = msg.content
                        # Extract token usage from the message metadata
                        if hasattr(msg, 'usage_metadata') and msg.usage_metadata:
                            usage_metadata = msg.usage_metadata
                        break
            elif isinstance(response, dict) and "output" in response:
                response_text = response["output"]
            else:
                response_text = str(response)
            
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
        
        # Standard response without web search
        return self.get_response_standard(message_list, ai)

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
