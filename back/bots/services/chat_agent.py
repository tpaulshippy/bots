import logging
import re

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

def _harden_tool(tool, retry_hint: str):
    """Never let arg-validation or tool errors kill the turn.

    Without this, a model call missing a required arg raises ValidationError
    out of tool.invoke() and aborts the whole response (prod incident:
    save_html_page called with title-only). With it, the model gets the
    hint back as a ToolMessage and can retry correctly.
    """
    tool.handle_validation_error = retry_hint
    tool.handle_tool_error = (
        "That tool call failed. Fix the arguments and try again, "
        "or explain what you were trying to do."
    )
    return tool



WEB_SEARCH_UNAVAILABLE = "Web search is not available."
WEB_QUERY_BLOCKED = "This search query was blocked by the safety policy. Please try a different question."
NO_SAFE_RESULTS = "No safe results found."
HTML_PAGE_BLOCKED = (
    "I can't save that page because it didn't pass the safety check. "
    "Please adjust the wording and try again."
)
HTML_PAGE_DISABLED = "HTML pages are not enabled for this bot."
HTML_PAGE_TOO_LARGE = "That page is too large. Please keep pages under 200KB."
_HTML_FENCE_RE = re.compile(r"```html\s*\n(.*?)```", re.DOTALL | re.IGNORECASE)
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
        # Image observations queued by tools (e.g. page screenshots) to be
        # appended as HumanMessages right after their ToolMessage.
        self._pending_observations = []
        self._preview_count = 0

    def _html_tools(self):
        """save + update tools when the parent-enabled flag is on.

        Both write DB rows (never host files). Update keeps the same page_id
        so the local raw URL / download stays stable across iterations.
        """
        save_tool = self._create_html_page_tool()
        if not save_tool:
            return {}
        tools = {
            "save_html_page": save_tool,
            "update_html_page": self._create_html_page_update_tool(),
        }
        preview_tool = self._create_preview_page_tool()
        if preview_tool:
            tools["preview_page"] = preview_tool
        return tools

    def _vision_capable(self):
        """True when the resolved model accepts image input.

        Mirrors Chat.resolve_ai_client: the bot's model when set, else the
        default model. Unresolvable (no rows) -> False so image observations
        are never sent to a text-only model.
        """
        try:
            from bots.models.ai_model import AiModel
            model = None
            bot = self.chat.bot
            if bot is not None and getattr(bot, "ai_model_id", None):
                model = AiModel.objects.filter(pk=bot.ai_model_id).first()
            if model is None:
                model = AiModel.objects.filter(is_default=True).first()
            if model is None:
                return False
            return "image" in (model.supported_input_modalities or [])
        except Exception:
            return False

    HTML_GUIDANCE = (
        "HTML pages are enabled: you can build single-file web pages for the kid.\n"
        "To create a page, write the COMPLETE page in your reply inside one "
        "```html fenced block — it is saved automatically. (You may instead call "
        "save_html_page, but then title AND the complete html document are both "
        "required in ONE call; never call it with title alone.)\n"
        "To change an existing page from the catalog below, call update_html_page "
        "with its page_id and the full replacement html.\n"
        "After saving, call preview_page to look at the render and fix issues.\n"
        "Always mention the page title in your reply so the kid can reference it later."
    )

    def _html_enabled(self):
        return bool(
            self.chat.bot
            and getattr(self.chat.bot, "enable_html_pages", False)
            and self.chat.profile is not None
        )

    def _page_catalog_message(self):
        """Recent pages for this profile across chats, so later turns — even
        in a new chat ("update my dino page") — can iterate.

        Tool calls are not persisted as chat messages, so without this the
        agent cannot discover page_ids from history on follow-up turns.
        Ownership is enforced by the profile scope; updates still require
        the exact page_id from this catalog.
        """
        from langchain_core.messages import SystemMessage

        if not self._html_enabled():
            return None
        try:
            from bots.models.html_page import HtmlPage
            pages = (
                HtmlPage.objects.filter(profile=self.chat.profile)
                .select_related("chat")
                .order_by("-updated_at")[:10]
            )
            if not pages:
                return None
            lines = [
                "The kid's saved HTML pages (prefer update_html_page over save_html_page when they refine one):",
            ]
            for p in reversed(list(pages)):
                chat_title = getattr(p.chat, "title", "") or "this chat"
                marker = " (this chat)" if p.chat_id == self.chat.pk else f" (from chat '{chat_title}')"
                lines.append(f"- '{p.title}' page_id={p.page_id} updated={p.updated_at:%Y-%m-%d %H:%M}{marker}")
            return SystemMessage(content="\n".join(lines))
        except Exception:
            logger.exception("🌐 PAGE_CATALOG_FAILED")
            return None

    def _with_catalog(self, message_list):
        """Fold HTML guidance (+ page catalog when pages exist) into the
        leading SystemMessage.

        The guidance is always present while the flag is on — like the
        web_search sentence in bot prompts — so first turns know the fenced
        path without any pages existing yet. Anthropic (via Bedrock Converse)
        rejects multiple non-consecutive system messages, so this must never
        be appended as its own SystemMessage after the prompt (prod crash).
        Merging keeps one.
        """
        from langchain_core.messages import SystemMessage

        if not self._html_enabled():
            return message_list
        parts = [self.HTML_GUIDANCE]
        catalog = self._page_catalog_message()
        if catalog is not None:
            parts.append(catalog.content)
        suffix = "\n\n".join(parts)
        messages = list(message_list)
        if messages and isinstance(messages[0], SystemMessage):
            first = messages[0]
            content = first.content if isinstance(first.content, str) else ""
            messages[0] = SystemMessage(content=content + "\n\n" + suffix)
        else:
            messages.insert(0, SystemMessage(content=suffix))
        return messages

    def respond(self, message_list):
        tools = {
            "create_flashcard_deck": self._create_flashcard_deck_tool(),
            "create_flashcard": self._create_flashcard_tool(),
        }
        self._preview_count = 0

        web_search = self._create_web_search_tool()
        if web_search:
            tools["web_search"] = web_search
        tools.update(self._html_tools())
        message_list = self._with_catalog(message_list)
        logger.info(f"Invoking agent with full context ({len(message_list)} messages)")

        model_with_tools = self.ai_client.bind_tools(list(tools.values()))

        messages = self._run_agent_loop(model_with_tools, message_list, tools)

        logger.info("🤖 AGENT_LOOP_COMPLETE: extracting final response")

        response_text, usage_metadata = self._extract_response(messages)
        fence_note = self._save_fenced_page(messages)
        if fence_note:
            response_text = response_text + fence_note
        return response_text, usage_metadata

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
        self._preview_count = 0
        web_search = self._create_web_search_tool()
        has_web_search = False
        if web_search:
            tools["web_search"] = web_search
            has_web_search = True
        tools.update(self._html_tools())

        model_with_tools = self.ai_client.bind_tools(list(tools.values()))
        messages = self._with_catalog(list(message_list))
        usage_totals = {"input_tokens": 0, "output_tokens": 0}
        yielded_text = ""
        after_tool = False

        for iteration in range(1, self.MAX_ITERATIONS + 1):
            logger.info(f"🤖 AGENT_STREAM_ITERATION: {iteration}")

            merged_chunk = None
            for chunk in model_with_tools.stream(messages):
                # Per-chunk deltas must keep their whitespace: Bedrock streams
                # list content blocks like {"type": "text", "text": " Hey"},
                # where the leading space separates words. Stripping here
                # glues words together ("Heythere"). Final-message callers use
                # the default strip=True.
                delta = self._message_text(chunk, strip=False)
                if delta:
                    # Separate responses across a tool call: iteration N can end
                    # with "you:" and iteration N+1 start with "Done!" — neither
                    # side carries the space, so abutting them yields "you:Done!".
                    # Only at tool boundaries, never between raw chunks (which
                    # can split mid-word, e.g. "Hel"+"lo").
                    if after_tool and yielded_text and not yielded_text[-1].isspace() and not delta[0].isspace():
                        delta = " " + delta
                    after_tool = False
                    yielded_text += delta
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

                events_before = len(self.client_events)
                tool_result = self._execute_tool(tool_name, tool_args, tools, has_web_search)
                logger.info(f"🔍 AGENT_TOOL_RESULT: {tool_result[:100]}")

                tool_end = {"type": "tool_end", "tool": tool_name}
                # Flatten extras from the client_event recorded BY THIS CALL
                # (deck_id, name, card_count, result_preview, ...) onto the
                # tool_end payload. Snapshotting the event count first avoids
                # merging a previous success's extras when this call errored
                # or was blocked (no new event recorded).
                for event in reversed(self.client_events[events_before:]):
                    if event.get("tool") == tool_name:
                        tool_end.update({k: v for k, v in event.items() if k != "tool"})
                        break
                yield tool_end
                after_tool = True

                messages.append(ToolMessage(
                    content=tool_result,
                    tool_call_id=tool_call["id"],
                    name=tool_name
                ))
            # Drain once per assistant turn, not per tool call: providers
            # require all ToolMessages for one assistant message to stay
            # contiguous, and a HumanMessage in the middle gets rejected.
            messages.extend(self._drain_observations())

        # Fenced-code fallback: the reply text may carry the page when the
        # model wouldn't emit it as a tool arg. The note joins the stream so
        # clients persist it with the rest of the bubble; the tool_end chip
        # is synthesized below from the recorded event.
        fence_note = self._save_fenced_page(messages)
        if fence_note:
            for event in reversed(self.client_events):
                if event.get("tool") == "save_html_page":
                    yield {"type": "tool_start", "tool": "save_html_page", "args": {"title": event.get("name", "")}}
                    tool_end = {"type": "tool_end", "tool": "save_html_page"}
                    tool_end.update({k: v for k, v in event.items() if k != "tool"})
                    yield tool_end
                    break
            yielded_text += fence_note
            yield {"type": "token", "text": fence_note}

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
            # Drained once per assistant turn (see streaming loop): a
            # HumanMessage between ToolMessages breaks tool-calling providers.
            messages.extend(self._drain_observations())

        return messages

    def _drain_observations(self):
        """Image observations queued by tools as follow-up HumanMessages.

        Same base64 data-URL shape as user uploads in Chat.get_input, so the
        Bedrock image path needs no changes.
        """
        from langchain_core.messages import HumanMessage

        pending, self._pending_observations = self._pending_observations, []
        return [
            HumanMessage(content=[
                {"type": "text", "text": "Page render screenshot:"},
                obs,
            ])
            for obs in pending
        ]

    def _execute_tool(self, tool_name, tool_args, tools, has_web_search):
        if tool_name == "web_search" and not has_web_search:
            return WEB_SEARCH_UNAVAILABLE
        elif tool_name in tools:
            try:
                return tools[tool_name].invoke(tool_args)
            except Exception as e:
                # Last resort: tool-level handlers should already convert
                # arg/validation failures to text, but never let an
                # unexpected tool exception abort the whole turn.
                logger.exception("🔍 AGENT_TOOL_FAILED: %s", tool_name)
                return f"The {tool_name} tool failed ({e!s}). Fix the arguments and try again."
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
    def _message_text(message, strip=True):
        if isinstance(message.content, str):
            return message.content
        if isinstance(message.content, list):
            text_parts = []
            for item in message.content:
                if isinstance(item, dict) and item.get('type') == 'text':
                    text_parts.append(item.get('text', ''))
                elif isinstance(item, str):
                    text_parts.append(item)
            text = "".join(text_parts)
            return text.strip() if strip else text
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

        return _harden_tool(
            create_flashcard_deck,
            "Missing required arguments. Call create_flashcard_deck again with "
            "'name' and a non-empty 'flashcards' list.",
        )

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

        return _harden_tool(
            create_flashcard,
            "Missing required arguments. Call create_flashcard again with "
            "'deck_name', 'front', and 'back'.",
        )

    def _persist_html_page(self, title, html):
        """Validate, safety-check, and store a new page. Shared by the save
        tool and the fenced-code fallback. Returns (page, message)."""
        from bots.models.html_page import HtmlPage
        from bots.serializers.html_page_serializer import (
            MAX_HTML_BYTES,
            html_to_text,
            is_single_file_html,
        )

        clean_title = (title or "").strip()[:255]
        if not clean_title or not (html or "").strip():
            return None, "Title and html are both required."
        if len(html.encode("utf-8")) > MAX_HTML_BYTES:
            return None, HTML_PAGE_TOO_LARGE
        if not is_single_file_html(html):
            return None, "HTML must be a single self-contained page."
        verdict = evaluate_text(f"{clean_title} {html_to_text(html)}", self.policy, source="OUTPUT")
        if verdict.blocked:
            record_safety_event(
                stage="tool_html_page",
                verdict=verdict,
                chat=self.chat,
                snippet=f"{clean_title} {html_to_text(html)[:200]}",
            )
            return None, HTML_PAGE_BLOCKED
        try:
            with transaction.atomic():
                page = HtmlPage.objects.create(
                    profile=self.chat.profile,
                    chat=self.chat,
                    bot=self.chat.bot,
                    title=clean_title,
                    html=html,
                )
                self._record_event({
                    "tool": "save_html_page",
                    "page_id": str(page.page_id),
                    "name": clean_title,
                })
                return page, (
                    f"Saved page '{clean_title}'. Open it in the browser with "
                    f"/api/html-pages/{page.page_id}/raw"
                )
        except Exception as e:
            logger.error(f"🌐 SAVE_HTML_PAGE_ERROR: {e!s}")
            return None, f"Error saving page: {e!s}"

    def _save_fenced_page(self, messages):
        """Fallback when the model writes ```html instead of calling the tool.

        Some models won't emit a multi-KB document as a single tool arg and
        call save_html_page with title alone instead. A fenced block in
        prose is the same content through a path they use reliably, so a
        trailing fence is saved with the identical validation as the tool.
        Returns note text to append, or None.
        """
        if not (self.chat.bot and getattr(self.chat.bot, "enable_html_pages", False)):
            return None
        if self.chat.profile is None:
            return None
        if any(e.get("tool") in ("save_html_page", "update_html_page") for e in self.client_events):
            return None
        fence_html = None
        for msg in reversed(messages):
            if isinstance(msg, AIMessage) and not getattr(msg, "tool_calls", None):
                text = msg.content if isinstance(msg.content, str) else ""
                matches = _HTML_FENCE_RE.findall(text or "")
                if matches:
                    fence_html = matches[-1].strip()
                    break
        if not fence_html:
            return None
        title_match = re.search(r"<title[^>]*>(.*?)</title>", fence_html, re.DOTALL | re.IGNORECASE)
        if title_match:
            title = re.sub(r"\s+", " ", title_match.group(1)).strip()
        else:
            h1_match = re.search(r"<h1[^>]*>(.*?)</h1>", fence_html, re.DOTALL | re.IGNORECASE)
            title = re.sub(r"<[^>]+>", "", h1_match.group(1)).strip() if h1_match else ""
        page, message = self._persist_html_page(title or "Untitled page", fence_html)
        if page is None:
            logger.info(f"🌐 FENCED_PAGE_REJECTED: {message[:80]}")
            return None
        logger.info(f"🌐 FENCED_PAGE_SAVED: '{page.title}'")
        return f"\n\nSaved page '{page.title}' — open it from the page button above."

    def _create_html_page_tool(self):
        if not (self.chat.bot and getattr(self.chat.bot, "enable_html_pages", False)):
            return None
        if self.chat.profile is None:
            return None

        @tool
        def save_html_page(title: str, html: str) -> str:
            """Build a NEW single-file HTML page the kid can open in their browser.

            Use this for a fresh page. When the user refines an existing page
            listed in the chat catalog, call update_html_page instead.
            After saving, call preview_page to look at the render when available.
            Both arguments are always required: never call with title alone.
            Args:
                title: Short page title shown in chat.
                html: Complete single-file HTML document (inline CSS/JS allowed).
            """
            logger.info(f"🌐 SAVE_HTML_PAGE_INVOKED: title='{title}' bytes={len((html or '').encode('utf-8'))}")
            _, message = self._persist_html_page(title, html)
            return message

        return _harden_tool(
            save_html_page,
            "Missing required arguments. Call save_html_page again with BOTH "
            "'title' AND the complete single-file 'html' document. Never call "
            "it with title alone.",
        )

    def _create_html_page_update_tool(self):
        from bots.serializers.html_page_serializer import (
            MAX_HTML_BYTES,
            html_to_text,
            is_single_file_html,
        )

        @tool
        def update_html_page(page_id: str, html: str, title: str = "") -> str:
            """Update an EXISTING page in place (same URL). Use when the user
            iterates ("change X", "make it blue", "add Y").

            Args:
                page_id: The page_id from the chat catalog or a prior save.
                html: Complete replacement single-file HTML document.
                title: Optional new title.
            """
            import uuid as uuid_lib

            from bots.models.html_page import HtmlPage

            logger.info(f"🌐 UPDATE_HTML_PAGE_INVOKED: page_id='{page_id}'")
            try:
                page_uuid = uuid_lib.UUID(str(page_id))
            except (ValueError, AttributeError):
                return "Unknown page. Ask which page to update or save a new one."
            try:
                page = HtmlPage.objects.get(
                    page_id=page_uuid,
                    profile=self.chat.profile,
                )
            except HtmlPage.DoesNotExist:
                return "Unknown page. Ask which page to update or save a new one."
            if not (html or "").strip():
                return "html is required."
            if len(html.encode("utf-8")) > MAX_HTML_BYTES:
                return HTML_PAGE_TOO_LARGE
            if not is_single_file_html(html):
                return "HTML must be a single self-contained page."
            new_title = (title or "").strip()[:255] or page.title
            verdict = evaluate_text(f"{new_title} {html_to_text(html)}", self.policy, source="OUTPUT")
            if verdict.blocked:
                record_safety_event(
                    stage="tool_html_page",
                    verdict=verdict,
                    chat=self.chat,
                    snippet=f"{new_title} {html_to_text(html)[:200]}",
                )
                return HTML_PAGE_BLOCKED
            try:
                with transaction.atomic():
                    page = HtmlPage.objects.select_for_update().get(pk=page.pk)
                    page.html = html
                    page.title = new_title
                    page.save(update_fields=["html", "title", "updated_at"])
                    self._record_event({
                        "tool": "update_html_page",
                        "page_id": str(page.page_id),
                        "name": page.title,
                    })
                    return (
                        f"Updated page '{page.title}'. Reopen "
                        f"/api/html-pages/{page.page_id}/raw/ to see the changes"
                    )
            except Exception as e:
                logger.error(f"🌐 UPDATE_HTML_PAGE_ERROR: {e!s}")
                return f"Error updating page: {e!s}"

        return _harden_tool(
            update_html_page,
            "Missing required arguments. Call update_html_page again with "
            "'page_id' AND the complete replacement 'html' document.",
        )

    def _create_preview_page_tool(self):
        if not (self.chat.bot and getattr(self.chat.bot, "enable_html_pages", False)):
            return None
        if self.chat.profile is None:
            return None
        if not self._vision_capable():
            return None
        from bots.services.page_render import render_available
        if not render_available():
            return None

        from bots.services.page_render import MAX_PREVIEWS_PER_TURN, render_page_shot

        @tool
        def preview_page(page_id: str) -> str:
            """Render an existing page headlessly and LOOK at the screenshot.

            Use after save_html_page/update_html_page to check layout and JS
            errors, then fix with update_html_page if needed. Max two previews
            per turn. Only accepts page_ids from this chat's catalog.
            Args:
                page_id: The page_id from the chat catalog or a prior save.
            """
            import base64
            import uuid as uuid_lib

            from bots.models.html_page import HtmlPage

            logger.info(f"👁 PREVIEW_PAGE_INVOKED: page_id='{page_id}'")
            if self._preview_count >= MAX_PREVIEWS_PER_TURN:
                return "Render already checked twice this turn; proceed with fixes."
            try:
                page_uuid = uuid_lib.UUID(str(page_id))
            except (ValueError, AttributeError):
                return "Unknown page. Ask which page to preview or save a new one."
            try:
                page = HtmlPage.objects.get(
                    page_id=page_uuid,
                    profile=self.chat.profile,
                )
            except HtmlPage.DoesNotExist:
                return "Unknown page. Ask which page to preview or save a new one."
            shot = render_page_shot(page.html)
            if shot is None:
                return "Render preview is not available on this server."
            self._preview_count += 1
            # Runtime safety gate: static source filtering cannot see text
            # the page's own JS writes into the DOM, so the rendered text
            # gets the same policy check before anything is shown or kept.
            rendered_text = shot.get("rendered_text") or ""
            if rendered_text.strip():
                render_verdict = evaluate_text(rendered_text, self.policy, source="OUTPUT")
                if render_verdict.blocked:
                    record_safety_event(
                        stage="tool_html_page",
                        verdict=render_verdict,
                        chat=self.chat,
                        snippet=rendered_text[:200],
                    )
                    return (
                        "I can't show that render because the finished page "
                        "didn't pass the safety check. Fix the page with "
                        "update_html_page and try previewing again."
                    )
            png_bytes = shot.get("png_bytes")
            if png_bytes:
                b64 = base64.b64encode(png_bytes).decode("ascii")
                self._pending_observations.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{b64}"},
                })
            console_errors = shot.get("console_errors") or []
            page_errors = shot.get("page_errors") or []
            # Claim "checked render" only when a screenshot was captured:
            # without page_id the frontend shows no chip (and shouldn't).
            if png_bytes:
                self._record_event({
                    "tool": "preview_page",
                    "page_id": str(page.page_id),
                    "name": page.title,
                    "console_errors": len(console_errors) + len(page_errors),
                })
            parts = [f"Rendered '{page.title}'."]
            if console_errors:
                parts.append("Console errors:\n" + "\n".join(f"- {e}" for e in console_errors[:5]))
            if page_errors:
                parts.append("Page errors:\n" + "\n".join(f"- {e}" for e in page_errors[:5]))
            if not console_errors and not page_errors:
                parts.append("No JS errors.")
            if png_bytes:
                parts.append("The screenshot follows as an image; inspect the layout and fix issues with update_html_page if needed.")
            else:
                parts.append("No screenshot captured.")
            return "\n".join(parts)

        return _harden_tool(
            preview_page,
            "Missing required arguments. Call preview_page again with 'page_id'.",
        )

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

        return _harden_tool(
            web_search,
            "Missing required arguments. Call web_search again with 'query'.",
        )
