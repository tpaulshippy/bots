"""Pre-agent turn router (System One / Jev smart if-statement).

Jev-style System One router: instead of handing every turn to the agent
with the full tool belt bound, make one cheap structured judgment up
front (which tools does this turn plausibly need?) and let code branch
on the result. Heuristic v1 ships now; the live TypeSafe (Jev) API
swaps in behind the same seam via ``JEV_ROUTER_MODE=api``.

TypeSafe API shape (verified against https://docs.typesafe.ai, Sep 2026)::

    POST https://api.typesafe.ai/v1/systemone
    Authorization: Bearer <TYPESAFE_API_KEY>
    {"state": <str|dict>, "model": "jev-latest",
     "questions": {"needs_search": {"type": "noul", "instructions": ...}, ...}}
    -> {"model": "jev-latest",
        "answers": {"needs_search": {"type": "noul", "noul": 0.93}, ...},
        "usage": {"input_tokens": n, "output_tokens": m}}

Question types: noul (yes/no -> probability), choice (pick option ->
choice + probabilities + confidence), score (rate on rubric -> score +
confidence). Questions in one call are evaluated in parallel against
the same state.
"""

import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Probability below which a tool is not bound for the turn. Mirrors the
# confidence-gated routing pattern from the TypeSafe docs
# (docs.typesafe.ai/patterns/confidence-routing): the answer tells you
# what, the confidence tells you whether to act.
SKIP_THRESHOLD = 0.2

# Noul questions for the live Jev call (JEV_ROUTER_MODE=api). Heuristic
# v1 answers the same questions locally with keyword signals.
JEV_QUESTIONS = {
    "needs_web_search": {
        "type": "noul",
        "instructions": "Does this student message need current/external "
        "facts (recent events, scores, prices, weather, anything beyond "
        "training data)?",
    },
    "needs_flashcard": {
        "type": "noul",
        "instructions": "Does this student message ask to create, add, or "
        "study flashcards / a study deck / a quiz?",
    },
    "needs_html_page": {
        "type": "noul",
        "instructions": "Does this student message ask to build, make, or "
        "update a web page, game, or animation?",
    },
    "off_task": {
        "type": "noul",
        "instructions": "Is this student message off-task smalltalk, a joke "
        "request, or unrelated to learning (not a study question)?",
    },
    "frustrated": {
        "type": "noul",
        "instructions": "Does this student message express frustration, "
        "anger, or disappointment with the tutor?",
    },
    "subject": {
        "type": "choice",
        "instructions": "Which school subject is this message about?",
        "criteria": {
            "math": "Arithmetic, algebra, geometry, calculus, statistics",
            "science": "Biology, chemistry, physics, earth science",
            "english": "Reading, writing, grammar, vocabulary, literature",
            "history": "History, geography, civics, social studies",
            "coding": "Programming, computers, building software or pages",
            "general": "Anything else, greetings, or unclear",
        },
    },
}


@dataclass
class TurnRoute:
    """One structured judgment for a single kid turn."""

    needs_web_search: bool = False
    needs_flashcard: bool = False
    needs_html_page: bool = False
    off_task: bool = False
    frustrated: bool = False
    subject: str = "general"
    confidences: dict = field(default_factory=dict)


def router_enabled() -> bool:
    """True unless explicitly disabled via settings/env."""
    try:
        from django.conf import settings as dj_settings

        return bool(getattr(dj_settings, "JEV_ROUTER_ENABLED", True))
    except Exception:
        return True


def router_mode() -> str:
    """'heuristic' (default, offline) or 'api' (live TypeSafe call)."""
    try:
        from django.conf import settings as dj_settings

        return str(getattr(dj_settings, "JEV_ROUTER_MODE", "heuristic") or "heuristic").lower()
    except Exception:
        return "heuristic"


def last_user_text(message_list) -> str:
    """Extract the latest human message text from a LangChain list."""
    text = ""
    for msg in reversed(list(message_list or [])):
        cls = type(msg).__name__
        if cls in ("HumanMessage", "HumanMessageChunk"):
            content = getattr(msg, "content", "")
            if isinstance(content, str):
                text = content
            elif isinstance(content, list):
                parts = [
                    p.get("text", "")
                    for p in content
                    if isinstance(p, dict) and p.get("type") == "text"
                ]
                text = "".join(parts)
            break
    return text or ""


def query_jev(state: dict, questions: list) -> dict:
    """Seam for the real TypeSafe System One API.

    Args:
        state: JSON-serializable turn state, e.g.
            {"text": "...", "subject_hint": "...", "history": "..."}.
        questions: list of question keys (subset of JEV_QUESTIONS).

    Returns:
        dict mapping question key -> probability/confidence payload,
        e.g. {"needs_web_search": {"p": 0.9, "confidence": 0.8}}.

    Heuristic mode (default) returns {} so callers fall back to local
    signals and NO network call is ever made. API mode POSTs the
    TypeSafe SystemOne shape (state + typed questions) and returns the
    parsed answers.

    TODO(live-jev): requires TYPESAFE_API_KEY; flip JEV_ROUTER_MODE=api
    and add `typesafe-sdk` (TypeSafeClient.system_one) or keep the raw
    urllib POST below. See https://docs.typesafe.ai/introduction/quickstart
    """
    if router_mode() != "api":
        return {}
    import json
    import urllib.request

    try:
        from django.conf import settings as dj_settings

        api_key = getattr(dj_settings, "TYPESAFE_API_KEY", "")
        api_url = getattr(
            dj_settings, "TYPESAFE_API_URL", "https://api.typesafe.ai/v1/systemone"
        )
        model = getattr(dj_settings, "TYPESAFE_MODEL", "jev-latest")
    except Exception:
        return {}
    if not api_key:
        logger.warning("JEV_ROUTER_MODE=api but no TYPESAFE_API_KEY; using heuristic")
        return {}
    payload_questions = {k: JEV_QUESTIONS[k] for k in questions if k in JEV_QUESTIONS}
    body = json.dumps(
        {"state": state, "model": model, "questions": payload_questions}
    ).encode()
    req = urllib.request.Request(
        api_url,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode() or "{}")
    except Exception:
        logger.exception("JEV_API_CALL_FAILED")
        return {}
    out = {}
    for key, ans in (data.get("answers") or {}).items():
        if not isinstance(ans, dict):
            continue
        if ans.get("type") == "noul" and "noul" in ans:
            out[key] = {"p": float(ans["noul"]), "confidence": 1.0}
        elif ans.get("type") == "choice":
            probs = ans.get("probabilities") or {}
            top = ans.get("choice")
            out[key] = {
                "p": float(probs.get(top, 0.0)) if top else 0.0,
                "choice": top,
                "confidence": float(ans.get("confidence", 0.0)),
                "probabilities": probs,
            }
    return out


# --- Heuristic v1 signals (offline, deterministic) -------------------------

_SEARCH_RE = re.compile(
    r"\b(who won|latest|newest|current|today|yesterday|this week|news|score of|"
    r"weather|price of|stock|election|president|look ?up|search( the web)?|"
    r"on the internet|up[- ]to[- ]date|recently|2025|2026)\b|"
    r"\b(what happened|when did|who is (the )?(current|new|latest))\b",
    re.IGNORECASE,
)
_FLASHCARD_RE = re.compile(
    r"\b(flashcards?|deck of cards|study deck|quiz me|test me|memoriz(e|e it)|"
    r"vocab(ulary)? (list|deck|set)|make (me )?(flashcards|cards)|"
    r"\bdrill me\b|study (for|guide))\b",
    re.IGNORECASE,
)
_HTML_RE = re.compile(
    r"\b(web ?page|web ?site|html|animation|mini-?game|"
    r"build me|make me (a|an)|create (a|me)|interactive (page|demo|quiz|game))\b",
    re.IGNORECASE,
)
_OFFTASK_RE = re.compile(
    r"^\s*(hi+|hello|hey+|yo|sup|what'?s up|how are you|tell me a joke|"
    r"joke please|i'?m bored|let'?s (talk|chat) about )\b",
    re.IGNORECASE,
)
_OFFTASK_ANY_RE = re.compile(
    r"\b(minecraft|fortnite|roblox|tiktok|youtube (video|drama)|gossip|"
    r"dating|crush|tell me a joke|funny meme)\b",
    re.IGNORECASE,
)
_FRUSTRATED_RE = re.compile(
    r"\b(stupid|dumb|hate|ugh+|annoying|doesn'?t work|wrong again|"
    r"you'?re (bad|dumb|useless)|shut up|boring|this sucks|wtf|idiot)\b|!{2,}",
    re.IGNORECASE,
)
_SUBJECT_RES = [
    ("math", re.compile(r"\b(math|algebra|geometry|calculus|fraction|equation|triangle|pythagoras|statistics|multiply|division)\b", re.IGNORECASE)),
    ("science", re.compile(r"\b(science|biology|chemistry|physics|mitosis|photosynthesis|atom|gravity|dna|cell|planet)\b", re.IGNORECASE)),
    ("english", re.compile(r"\b(english|essay|grammar|vocabulary|vocabulary|shakespeare|metaphor|thesis|paragraph|spelling)\b", re.IGNORECASE)),
    ("history", re.compile(r"\b(history|civil war|wwii|world war|ancient|rome|egypt|revolution|geography|president lincoln)\b", re.IGNORECASE)),
    ("coding", re.compile(r"\b(code|coding|python|javascript|html|css|function|variable|loop|debug|program)\b", re.IGNORECASE)),
]


def _p(hit: bool, high: float = 0.9, low: float = 0.05) -> float:
    return high if hit else low


def route_turn(text: str, bot=None, history_snippet: str = "") -> TurnRoute:
    """Route one kid turn. Pure + offline in heuristic mode.

    Keyword/subject signals produce probabilities; bot capability flags
    (enable_web_search / enable_html_pages) gate the web/html booleans so
    a disabled tool is never bound. API mode consults query_jev() first
    and falls back to heuristic per-question on miss.
    """
    text = text or ""
    search_hit = bool(_SEARCH_RE.search(text))
    flash_hit = bool(_FLASHCARD_RE.search(text))
    html_hit = bool(_HTML_RE.search(text))
    offtask_hit = bool(_OFFTASK_RE.search(text) or _OFFTASK_ANY_RE.search(text))
    frust_hit = bool(_FRUSTRATED_RE.search(text))
    subject = "general"
    for name, rx in _SUBJECT_RES:
        if rx.search(text):
            subject = name
            break

    confidences = {
        "needs_web_search": _p(search_hit, 0.85),
        "needs_flashcard": _p(flash_hit, 0.9),
        "needs_html_page": _p(html_hit, 0.85),
        "off_task": _p(offtask_hit, 0.8),
        "frustrated": _p(frust_hit, 0.85),
        "subject": 0.7 if subject != "general" else 0.4,
    }

    # Live Jev answers override heuristic probabilities when available.
    if router_mode() == "api":
        try:
            answers = query_jev(
                {"text": text, "history": history_snippet or ""},
                ["needs_web_search", "needs_flashcard", "needs_html_page",
                 "off_task", "frustrated"],
            )
        except Exception:
            answers = {}
        for key in ("needs_web_search", "needs_flashcard", "needs_html_page",
                    "off_task", "frustrated"):
            payload = answers.get(key)
            if isinstance(payload, dict) and "p" in payload:
                try:
                    confidences[key] = max(0.0, min(1.0, float(payload["p"])))
                except (TypeError, ValueError):
                    pass

    web_allowed = bot is None or bool(getattr(bot, "enable_web_search", False))
    html_allowed = bot is None or bool(getattr(bot, "enable_html_pages", False))
    # bot=None (unit tests without a bot row) means "no flag info": keep
    # the raw signal; real ChatAgentService always passes a bot.
    if bot is not None:
        if not web_allowed:
            confidences["needs_web_search"] = 0.0
        if not html_allowed:
            confidences["needs_html_page"] = 0.0

    return TurnRoute(
        needs_web_search=bool(web_allowed and confidences["needs_web_search"] >= SKIP_THRESHOLD),
        needs_flashcard=bool(confidences["needs_flashcard"] >= SKIP_THRESHOLD),
        needs_html_page=bool(html_allowed and confidences["needs_html_page"] >= SKIP_THRESHOLD),
        off_task=bool(confidences["off_task"] >= 0.5),
        frustrated=bool(confidences["frustrated"] >= 0.5),
        subject=subject,
        confidences=confidences,
    )
