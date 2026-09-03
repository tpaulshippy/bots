import logging

from django.conf import settings
from django.db import transaction
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.tools import tool
from tavily import TavilyClient

from bots.models.deck import Deck
from bots.models.flashcard import Flashcard
from bots.services.safety import (
    REASON_GLOBAL_FLOOR,
    SafetyPolicy,
    SafetyVerdict,
    evaluate_text,
    evaluate_web_query,
    evaluate_web_result,
    record_safety_event,
)

logger = logging.getLogger(__name__)

WEB_SEARCH_UNAVAILABLE = "Web search is not available."
WEB_QUERY_BLOCKED = "This search query was blocked by the safety policy. Please try a different question."
NO_SAFE_RESULTS = "No safe results found."
FLASHCARD_BLOCKED = (
    "I can't save that flashcard because it didn't pass the safety check. "
    "Please adjust the wording and try again."
)


class ChatAgentService:
    def __init__(self, chat, ai_client, policy=None):
        self.chat = chat
        self.ai_client = ai_client
        # Server-owned policy; falls back to the bot's flags when not passed.
        self.policy = policy or SafetyPolicy.for_bot(chat.bot)
        # Structured tool results the API can surface to clients (SSE status
        # payloads and the legacy `events[]` array). Roadmap doc 06 §3.
        self.client_events = []

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

    def respond_events(self, message_list):
        """Streaming variant of respond(): yields agent events for SSE.

        Event dicts follow roadmap doc 06 §1:
          {"type": "token", "text": ...}
          {"type": "tool_start", "tool": ..., "args": {...}}
          {"type": "tool_end", "tool": ..., ...result extras (deck_id, name, card_count)}
          {"type": "done", "input_tokens": n, "output_tokens": m}

        Tool-call chunks are buffered until complete, then executed; text chunks
        are emitted as tokens as they arrive. Usage metadata comes from streamed
        chunk metadata when the provider includes it; when absent, totals stay 0
        rather than being estimated inaccurately.
        """
        tools = {
            "create_flashcard_deck": self._create_flashcard_deck_tool(),
            "create_flashcard": self._create_flashcard_tool(),
        }
        web_search = self._create_web_search_tool()
        has_web_search = False
        if web_search:
            tools["web_search"] = web_search
            has_web_search = True

        model_with_tools = self.ai_client.bind_tools(list(tools.values()))
        messages = list(message_list)
        usage_totals = {"input_tokens": 0, "output_tokens": 0}

        for iteration in range(1, self.MAX_ITERATIONS + 1):
            logger.info(f"🤖 AGENT_STREAM_ITERATION: {iteration}")

            merged_chunk = None
            for chunk in model_with_tools.stream(messages):
                delta = self._message_text(chunk)
                if delta:
                    yield {"type": "token", "text": delta}
                merged_chunk = chunk if merged_chunk is None else merged_chunk + chunk

            response = self._chunk_to_ai_message(merged_chunk)
            messages.append(response)
            self._accumulate_usage(usage_totals, response)

            if not response.tool_calls:
                logger.info(f"🤖 AGENT_STREAM_COMPLETE: no more tool calls after {iteration} iterations")
                break

            for tool_call in response.tool_calls:
                tool_name = tool_call["name"]
                tool_args = tool_call["args"]
                logger.info("🔍 AGENT_TOOL_CALL: %s", tool_name)

                yield {"type": "tool_start", "tool": tool_name, "args": tool_args or {}}

                tool_result = self._execute_tool(tool_name, tool_args, tools, has_web_search)
                logger.info(f"🔍 AGENT_TOOL_RESULT: {tool_result[:100]}")

                tool_end = {"type": "tool_end", "tool": tool_name}
                # Flatten extras from the recorded client_event (deck_id, name,
                # card_count, result_preview, ...) onto the tool_end payload.
                for event in reversed(self.client_events):
                    if event.get("tool") == tool_name:
                        tool_end.update({k: v for k, v in event.items() if k != "tool"})
                        break
                yield tool_end

                messages.append(ToolMessage(
                    content=tool_result,
                    tool_call_id=tool_call["id"],
                    name=tool_name
                ))

        yield {"type": "done", **usage_totals}

    MAX_ITERATIONS = 5

    def _run_agent_loop(self, model_with_tools, messages, tools):
        iteration = 0
        has_web_search = "web_search" in tools

        while iteration < self.MAX_ITERATIONS:
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

                tool_result = self._execute_tool(tool_name, tool_args, tools, has_web_search)

                logger.info(f"🔍 AGENT_TOOL_RESULT: {tool_result[:100]}")

                messages.append(ToolMessage(
                    content=tool_result,
                    tool_call_id=tool_call["id"],
                    name=tool_name
                ))

        return messages

    def _execute_tool(self, tool_name, tool_args, tools, has_web_search):
        if tool_name == "web_search" and not has_web_search:
            return WEB_SEARCH_UNAVAILABLE
        elif tool_name in tools:
            return tools[tool_name].invoke(tool_args)
        return f"Unknown tool: {tool_name}"

    @staticmethod
    def _chunk_to_ai_message(chunk):
        """Normalize a merged AIMessageChunk (or None) into an AIMessage."""
        from langchain_core.messages import AIMessageChunk

        if isinstance(chunk, AIMessageChunk):
            kwargs = {}
            usage = getattr(chunk, "usage_metadata", None)
            if usage:
                kwargs["usage_metadata"] = usage
            return AIMessage(
                content=chunk.content,
                additional_kwargs=getattr(chunk, "additional_kwargs", {}),
                tool_calls=getattr(chunk, "tool_calls", None) or [],
                **kwargs,
            )
        return AIMessage(content="")

    @staticmethod
    def _accumulate_usage(totals, message):
        usage = getattr(message, "usage_metadata", None)
        if usage:
            totals["input_tokens"] += usage.get("input_tokens", 0) or 0
            totals["output_tokens"] += usage.get("output_tokens", 0) or 0

    def _record_event(self, event):
        self.client_events.append(event)

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

            # Tool filter: reject unsafe deck name/description or cards before
            # anything is stored so the model can apologize instead of persisting junk.
            deck_verdict = evaluate_text(f"{name} {description}", self.policy, source="OUTPUT")
            if deck_verdict.blocked:
                record_safety_event(
                    stage="tool_flashcard",
                    verdict=deck_verdict,
                    chat=self.chat,
                    snippet=f"{name} {description}",
                )
                return FLASHCARD_BLOCKED
            for card in flashcards:
                card_verdict = evaluate_text(
                    f"{card.get('front', '')} {card.get('back', '')}",
                    self.policy,
                    source="OUTPUT",
                )
                if card_verdict.blocked:
                    record_safety_event(
                        stage="tool_flashcard",
                        verdict=card_verdict,
                        chat=self.chat,
                        snippet=f"{card.get('front', '')} {card.get('back', '')}",
                    )
                    return FLASHCARD_BLOCKED

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
                    self._record_event({
                        "tool": "create_flashcard_deck",
                        "deck_id": str(deck.deck_id),
                        "name": name,
                        "card_count": created_cards,
                    })
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

            # Tool filter: reject unsafe deck name or front/back before saving.
            deck_name_verdict = evaluate_text(deck_name, self.policy, source="OUTPUT")
            if deck_name_verdict.blocked:
                record_safety_event(
                    stage="tool_flashcard",
                    verdict=deck_name_verdict,
                    chat=self.chat,
                    snippet=deck_name,
                )
                return FLASHCARD_BLOCKED
            card_verdict = evaluate_text(f"{front} {back}", self.policy, source="OUTPUT")
            if card_verdict.blocked:
                record_safety_event(
                    stage="tool_flashcard",
                    verdict=card_verdict,
                    chat=self.chat,
                    snippet=f"{front} {back}",
                )
                return FLASHCARD_BLOCKED

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
                    self._record_event({
                        "tool": "create_flashcard",
                        "deck_id": str(deck.deck_id),
                        "name": deck_name,
                    })
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
            """Search the web for current information. Use this when you need up-to-date information or facts that may not be in your training data. Queries and results are filtered for teen-safe content."""
            logger.info(f"🔍 WEB_SEARCH_TOOL_INVOKED: query='{query}'")

            # Pre-query filter: block high-risk queries before hitting Tavily.
            query_verdict = evaluate_web_query(query, self.policy)
            if query_verdict.blocked:
                # Keep global_floor attribution for floor hits; other web
                # blocks roll up under `web_blocked` for parent reporting.
                event_verdict = query_verdict
                if query_verdict.reason_code != REASON_GLOBAL_FLOOR:
                    event_verdict = SafetyVerdict(True, "web_blocked", query_verdict.matched_terms)
                record_safety_event(
                    stage="web_query",
                    verdict=event_verdict,
                    chat=self.chat,
                    snippet=query,
                )
                return WEB_QUERY_BLOCKED

            try:
                results = tavily_client.search(query=query)
                num_results = len(results.get('results', []))
                logger.info(f"🔍 WEB_SEARCH_SUCCESS: returned {num_results} results")
                self._record_event({
                    "tool": "web_search",
                    "query": query,
                    "result_preview": f"{num_results} results",
                })
                formatted_results = []
                for r in results.get('results', [])[:3]:
                    title = r.get('title', 'No title')
                    content = r.get('content', '')[:200]
                    title_and_snippet = f"{title} {content}"
                    result_verdict = evaluate_web_result(title_and_snippet, self.policy)
                    if result_verdict.blocked:
                        # Post-results filter: drop unsafe results.
                        record_safety_event(
                            stage="web_result",
                            verdict=result_verdict,
                            chat=self.chat,
                            snippet=title_and_snippet,
                        )
                        continue
                    formatted_results.append(f"- {title}: {content}")

                if not formatted_results:
                    logger.info("🔍 WEB_SEARCH_ALL_RESULTS_FILTERED")
                    return NO_SAFE_RESULTS

                formatted = "\n".join(formatted_results)
                logger.debug("🔍 WEB_SEARCH_FORMATTED_RESULTS:\n%s", formatted)
                return formatted
            except Exception as e:
                logger.error(f"🔍 WEB_SEARCH_ERROR: {e!s}")
                return f"Error during search: {e!s}"

        return web_search
