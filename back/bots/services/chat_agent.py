import logging

from django.conf import settings
from django.db import transaction
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.tools import tool
from tavily import TavilyClient

from bots.models.deck import Deck
from bots.models.flashcard import Flashcard

logger = logging.getLogger(__name__)


class ChatAgentService:
    def __init__(self, chat, ai_client):
        self.chat = chat
        self.ai_client = ai_client

    def respond(self, message_list):
        tools = {
            "create_flashcard_deck": self._create_flashcard_deck_tool(),
            "create_flashcard": self._create_flashcard_tool(),
        }

        web_search = self._create_web_search_tool()
        if web_search:
            tools["web_search"] = web_search
            logger.info(f"Invoking agent with full context ({len(message_list)} messages)")
            logger.info("🤖 AGENT_INVOKE_START: web_search and flashcard tools available")
        else:
            logger.info(f"Invoking agent with flashcard tools only ({len(message_list)} messages)")
            logger.info("🤖 AGENT_INVOKE_START: flashcard tools available (web_search disabled)")

        model_with_tools = self.ai_client.bind_tools(list(tools.values()))

        messages = self._run_agent_loop(model_with_tools, message_list, tools)

        logger.info("🤖 AGENT_LOOP_COMPLETE: extracting final response")

        return self._extract_response(messages)

    def _run_agent_loop(self, model_with_tools, messages, tools):
        max_iterations = 5
        iteration = 0
        has_web_search = "web_search" in tools

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

                if tool_name == "web_search" and not has_web_search:
                    tool_result = "Web search is not available."
                elif tool_name in tools:
                    tool_result = tools[tool_name].invoke(tool_args)
                else:
                    tool_result = f"Unknown tool: {tool_name}"

                logger.info(f"🔍 AGENT_TOOL_RESULT: {tool_result[:100]}")

                messages.append(ToolMessage(
                    content=tool_result,
                    tool_call_id=tool_call["id"],
                    name=tool_name
                ))

        return messages

    def _extract_response(self, messages):
        response_text = ""
        usage_metadata = {"input_tokens": 0, "output_tokens": 0}
        ai_messages = [msg for msg in reversed(messages) if isinstance(msg, AIMessage)]

        for msg in ai_messages:
            if not msg.tool_calls:
                response_text = self._message_text(msg)
                if hasattr(msg, 'usage_metadata') and msg.usage_metadata:
                    usage_metadata = msg.usage_metadata
                logger.info(f"🤖 FINAL_RESPONSE: {len(response_text)} chars")
                break

        if not response_text and ai_messages:
            response_text = self._message_text(ai_messages[0])

        return response_text, usage_metadata

    @staticmethod
    def _message_text(message):
        if isinstance(message.content, str):
            return message.content
        if isinstance(message.content, list):
            text_parts = []
            for item in message.content:
                if isinstance(item, dict) and item.get('type') == 'text':
                    text_parts.append(item.get('text', ''))
                elif isinstance(item, str):
                    text_parts.append(item)
            return "".join(text_parts).strip()
        return ""

    def _create_flashcard_deck_tool(self):
        chat = self.chat

        @tool
        def create_flashcard_deck(name: str, flashcards: list, description: str = "") -> str:
            """Create a new flashcard deck with flashcards. Use this when the user wants to create flashcards for studying.

            Args:
                name: The name of the deck (e.g., "Biology Test Terms")
                flashcards: List of flashcards, each with 'front' and 'back' keys. Must include at least one card.
                description: Optional description of the deck
            """
            logger.info(f"🃏 CREATE_FLASHCARD_DECK_TOOL_INVOKED: name='{name}'")
            try:
                with transaction.atomic():
                    deck = Deck.objects.create(
                        profile=chat.profile,
                        chat=chat,
                        name=name,
                        description=description or ""
                    )
                    deck = Deck.objects.select_for_update().get(pk=deck.pk)
                    created_cards = 0
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
                logger.error(f"🃏 CREATE_FLASHCARD_DECK_ERROR: {e!s}")
                return f"Error creating deck: {e!s}"

        return create_flashcard_deck

    def _create_flashcard_tool(self):
        chat = self.chat

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
                    deck = Deck.objects.filter(profile=chat.profile, name=deck_name).first()
                    if not deck:
                        deck = Deck.objects.create(
                            profile=chat.profile,
                            chat=chat,
                            name=deck_name,
                            description=""
                        )
                    last_card = Flashcard.objects.filter(deck=deck).order_by('-order').first()
                    max_order = last_card.order if last_card else -1
                    Flashcard.objects.create(
                        deck=deck,
                        front=front,
                        back=back,
                        order=max_order + 1
                    )
                    logger.info(f"🃏 CREATE_FLASHCARD_SUCCESS: deck={deck.name}")
                    return f"Added flashcard to deck '{deck_name}'. Deck ID: {deck.deck_id}"
            except Exception as e:
                logger.error(f"🃏 CREATE_FLASHCARD_ERROR: {e!s}")
                return f"Error creating flashcard: {e!s}"

        return create_flashcard

    def _create_web_search_tool(self):
        if not (self.chat.bot and self.chat.bot.enable_web_search and settings.TAVILY_API_KEY):
            return None

        logger.info(f"Web search enabled for bot {self.chat.bot.name}")
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
                logger.error(f"🔍 WEB_SEARCH_ERROR: {e!s}")
                return f"Error during search: {e!s}"

        return web_search
