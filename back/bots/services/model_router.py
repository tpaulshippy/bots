"""Jev complexity router: route cheap vs frontier models per turn ($4/mo idea).

Cost model: most kid turns are simple Q&A that a cheap default model answers
as well as the frontier model. Enforcing the router (route low-complexity
turns to the cheap default, high-complexity turns to the bot's frontier
model) cuts output-token spend because:

- Cheap vs frontier output-token price gap is ~10x (e.g. Nova Micro
  $0.14/1M out vs a frontier model ~$1.40+/1M out; exact numbers live on the
  AiModel rows as output_token_cost).
- Output tokens dominate chat cost (replies are longer than prompts and
  every agent-loop iteration bills another completion).
- If ~70% of turns route "low", enforced routing saves roughly
  0.70 * (1 - 1/10) ~= 63% of output-token cost vs always-frontier.

Modes (JEV_MODEL_ROUTER_MODE):
- "heuristic" (default): local heuristic v1, no network, no cost.
- "api": calls query_jev() (TypeSafe seam); any failure falls back to the
  heuristic so routing never breaks a turn.

Rollout (server/settings.py):
- JEV_MODEL_ROUTER_ENABLED (default True): shadow-mode logging only.
- JEV_MODEL_ROUTER_ENFORCE (default False): actually switch models.
  Shadow first, compare MODEL_ROUTE logs vs quality, then enforce.
"""

import logging
import re
from dataclasses import dataclass

logger = logging.getLogger(__name__)

LOW_TIER = "low"
HIGH_TIER = "high"

# Score >= this routes "high".
HIGH_THRESHOLD = 0.5


@dataclass(frozen=True)
class ComplexityRoute:
    tier: str  # "low" | "high"
    complexity_p: float  # 0..1, estimated P(needs frontier model)
    confidence: float  # 0..1, higher = further from the decision boundary
    reason: str  # human-readable triggered signals, e.g. "code_block+long"


_QUESTION_WORDS = (
    "why",
    "how",
    "explain",
    "compare",
    "analyze",
    "analyse",
    "analysis",
    "analyzing",
    "evaluate",
    "prove",
    "derive",
    "summarize",
    "summarise",
    "discuss",
    "critique",
    "justify",
)

_MATH_SIGNALS = (
    "integral",
    "derivative",
    "equation",
    "theorem",
    "solve",
    "calculate",
    "quadratic",
    "algebra",
    "geometry",
    "calculus",
    "probability",
    "fraction",
    "polynomial",
)

_CODE_WORDS = (
    "function",
    "traceback",
    "compile",
    "debug",
    "recursion",
    "algorithm",
    "code",
    "python",
    "javascript",
    "html",
)

# Space/symbol-anchored tokens kept as substring matches.
_CODE_TOKENS = (
    "def ",
    "import ",
    "class ",
)

_ESSAY_SIGNALS = (
    "essay",
    "paragraph",
    "thesis",
    "dissertation",
    "write a",
    "write an",
    "in detail",
    "step by step",
    "step-by-step",
)

_MULTI_PART_RES = (
    re.compile(r"(?m)^\s*\d+[.)]\s+\S"),  # "1. ...\n2. ..."
    re.compile(r"\bfirst\b.*\bthen\b", re.IGNORECASE),
    re.compile(r"\band also\b", re.IGNORECASE),
    re.compile(r"\?.*\?", re.DOTALL),  # 2+ questions
)


def _has(lowered, phrase):
    """Whole-word/phrase match (so 'thesis' doesn't hit 'photosynthesis')."""
    return re.search(r"\b" + re.escape(phrase) + r"\b", lowered) is not None


def _heuristic_score(text, history_len=0):
    """Return (score 0..1, [signal names]). Pure function, no I/O."""
    text = text or ""
    lowered = text.lower()
    signals = []
    score = 0.0

    n_chars = len(text)
    n_words = len(text.split())
    if n_chars >= 800 or n_words >= 150:
        score += 0.35
        signals.append("long")
    elif n_chars >= 300 or n_words >= 60:
        score += 0.15
        signals.append("medium-length")

    if any(_has(lowered, w) for w in _QUESTION_WORDS):
        score += 0.15
        signals.append("deep-question-word")

    if any(_has(lowered, s) for s in _MATH_SIGNALS) or re.search(
        r"\d\s*[-+*/^=]\s*\d", text
    ):
        # Exclude trivial arithmetic ("what is 2+2?"): short text with a
        # single bare operator stays low; anything longer scores math.
        if n_words > 12 or any(s in lowered for s in _MATH_SIGNALS):
            score += 0.30
            signals.append("math")

    if "```" in text or any(_has(lowered, s) for s in _CODE_WORDS) or any(
        s in lowered for s in _CODE_TOKENS
    ):
        score += 0.35
        signals.append("code")

    if any(_has(lowered, s) for s in _ESSAY_SIGNALS):
        score += 0.40
        signals.append("essay")

    if any(rx.search(text) for rx in _MULTI_PART_RES):
        score += 0.35
        signals.append("multi-part")

    if history_len and history_len >= 6:
        score += 0.10
        signals.append("long-history")

    score = max(0.0, min(1.0, score))
    return score, signals


def query_jev(text, history_len=0):
    """TypeSafe API seam for model-based complexity scoring.

    Behind JEV_MODEL_ROUTER_MODE=api. Not wired to a real endpoint yet —
    raises so callers fall back to the heuristic. Replace the body with the
    TypeSafe call returning a float in [0, 1]; keep the signature.
    """
    raise NotImplementedError("Jev API not wired yet; heuristic fallback applies")


def _mode():
    try:
        from django.conf import settings

        return getattr(settings, "JEV_MODEL_ROUTER_MODE", "heuristic")
    except Exception:
        return "heuristic"


def route_complexity(text, history_len=0):
    """Route one turn to the low (cheap) or high (frontier) tier."""
    complexity_p = None
    if _mode() == "api":
        try:
            complexity_p = float(query_jev(text, history_len=history_len))
        except Exception:
            logger.warning("MODEL_ROUTE_API_FALLBACK: query_jev failed, using heuristic")
            complexity_p = None
    if complexity_p is None:
        complexity_p, signals = _heuristic_score(text, history_len=history_len)
    else:
        _, signals = _heuristic_score(text, history_len=history_len)
        complexity_p = max(0.0, min(1.0, complexity_p))
    tier = HIGH_TIER if complexity_p >= HIGH_THRESHOLD else LOW_TIER
    confidence = 0.5 + abs(complexity_p - HIGH_THRESHOLD)  # [0.5, 1.0]
    reason = "+".join(signals) if signals else "simple"
    return ComplexityRoute(
        tier=tier,
        complexity_p=round(complexity_p, 3),
        confidence=round(confidence, 3),
        reason=reason,
    )


def resolve_model_for_turn(bot, text, history_len=0):
    """Return (model_id, route) for one turn; never raises on missing rows.

    Low tier -> cheap default model; high tier -> bot.ai_model. Falls back
    safely (other side, then None) when AiModel rows are missing.
    """
    route = route_complexity(text, history_len=history_len)
    try:
        from bots.models.ai_model import AiModel

        default = AiModel.objects.filter(is_default=True).first()
        cheap_id = default.model_id if default is not None else None
        bot_model = getattr(bot, "ai_model", None) if bot is not None else None
        bot_id = getattr(bot_model, "model_id", None) if bot_model is not None else None

        if route.tier == HIGH_TIER:
            return (bot_id or cheap_id, route)
        return (cheap_id or bot_id, route)
    except Exception:
        logger.exception("MODEL_ROUTE_RESOLVE_FALLBACK")
        try:
            bot_model = getattr(bot, "ai_model", None) if bot is not None else None
            return (getattr(bot_model, "model_id", None), route)
        except Exception:
            return (None, route)
