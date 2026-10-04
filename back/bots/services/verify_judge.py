"""Jev-style parallel verifier ("verify-everything judge") for tools + web.

Heuristic v1: runs the existing denylist safety signals
(``bots.services.safety.evaluate_text``) plus extra jailbreak-phrase
detection in parallel and returns calibrated per-dimension scores in
[0, 1]. No strings are generated as decisions — callers branch only on
the booleans / score thresholds.

Seams:
- ``JEV_VERIFY_MODE=heuristic|api`` (django settings): ``api`` calls
  ``query_jev()``, which is a stub for the future TypeSafe API. When the
  stub is unimplemented we fall back to the heuristic so the gate never
  fails open or crashes the turn.
- ``JEV_VERIFY_ENABLED`` (django settings, default True): chat_agent
  gates consult this; when False the legacy ``evaluate_*`` path runs
  untouched.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

CONTEXT_WEB_RESULT = "web_result"
CONTEXT_HTML_PAGE = "html_page"
CONTEXT_TOOL_OUTPUT = "tool_output"

# Extra jailbreak / prompt-injection phrasings the base denylist does not
# cover. Matched case-insensitively by substring.
JAILBREAK_PHRASES = (
    "ignore previous instructions",
    "ignore all previous instructions",
    "disregard all prior instructions",
    "disregard previous instructions",
    "do anything now",
    "dan mode",
    "developer mode",
    "bypass safety",
    "bypass your safety",
    "forget your rules",
    "forget all your rules",
    "override your instructions",
    "no restrictions",
    "act as if you have no restrictions",
    "pretend you are",
    "you are now",
    "jailbreak",
    "jailbroken",
)


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


@dataclass(frozen=True)
class VerifyVerdict:
    safe: bool
    age_appropriate: bool
    correct: bool
    jailbroken: bool
    scores: dict[str, float] = field(default_factory=dict)
    reason: str = ""
    # Preserved legacy verdict so SafetyEvent recording stays identical.
    safety_verdict: object = None
    safety_reason_code: str | None = None


def is_verify_enabled() -> bool:
    try:
        from django.conf import settings as dj_settings

        return bool(getattr(dj_settings, "JEV_VERIFY_ENABLED", True))
    except Exception:
        return True


def _verify_mode() -> str:
    try:
        from django.conf import settings as dj_settings

        return str(getattr(dj_settings, "JEV_VERIFY_MODE", "heuristic") or "heuristic").lower()
    except Exception:
        return "heuristic"


def query_jev(text: str, policy, context: str = CONTEXT_WEB_RESULT) -> VerifyVerdict:
    """Seam stub for the future TypeSafe Jev API.

    Follow-up work will POST ``{text, policy, context}`` to the live API
    and map its parallel scores to :class:`VerifyVerdict`. Until then this
    raises so callers fall back to the local heuristic (fail-closed to the
    heuristic, never fail-open to "allowed").
    """
    raise NotImplementedError(
        "TypeSafe Jev API not wired yet; set JEV_VERIFY_MODE=heuristic "
        "(follow-up: implement live scoring in query_jev)."
    )


def _jailbreak_hits(text: str) -> list[str]:
    lowered = (text or "").lower()
    return [phrase for phrase in JAILBREAK_PHRASES if phrase in lowered]


def _heuristic_verify(text: str, policy, context: str):
    from bots.services.safety import (
        REASON_ADULT_TOPIC,
        REASON_GLOBAL_FLOOR,
        REASON_LANGUAGE,
        evaluate_text,
    )
    from bots.services.safety import SafetyVerdict as LegacyVerdict

    source = "OUTPUT"  # all three gated contexts are model/tool outputs
    legacy = evaluate_text(text or "", policy, source=source)
    hits = _jailbreak_hits(text)
    jailbroken = bool(hits)

    # --- parallel scores, all calibrated in [0, 1] ---
    if not legacy.blocked:
        safety_score = 1.0
    elif legacy.reason_code == REASON_GLOBAL_FLOOR:
        safety_score = 0.0
    elif legacy.reason_code == REASON_ADULT_TOPIC:
        safety_score = 0.2
    elif legacy.reason_code == REASON_LANGUAGE:
        safety_score = 0.4
    else:
        safety_score = 0.1
    if jailbroken:
        safety_score = min(safety_score, 0.1)

    if not legacy.blocked:
        age_score = 1.0
    elif legacy.reason_code in (REASON_GLOBAL_FLOOR, REASON_ADULT_TOPIC):
        age_score = 0.0
    else:  # language-only hit: still not kid-appropriate
        age_score = 0.3
    if jailbroken:
        age_score = min(age_score, 0.1)

    stripped = (text or "").strip()
    if not stripped:
        correctness_score = 0.0
    else:
        # Heuristic v1 cannot verify factual correctness; non-empty
        # content passes, empty content fails. Live API will score this.
        correctness_score = 1.0

    jailbreak_free_score = 0.0 if jailbroken else 1.0

    scores = {
        "safe": _clamp01(safety_score),
        "age_appropriate": _clamp01(age_score),
        "correct": _clamp01(correctness_score),
        "jailbreak_free": _clamp01(jailbreak_free_score),
    }

    safe = (not legacy.blocked) and (not jailbroken)
    age_appropriate = (not legacy.blocked) and (not jailbroken)
    correct = correctness_score >= 0.5

    # Preserve exact legacy verdict for identical SafetyEvent recording;
    # a jailbreak with no denylist hit still fails closed to the floor.
    safety_verdict = legacy
    if jailbroken and not legacy.blocked:
        safety_verdict = LegacyVerdict(True, REASON_GLOBAL_FLOOR, tuple(hits))

    reason = (
        f"[jev:{context}] legacy={legacy.reason_code or 'pass'} "
        f"jailbreak={'|'.join(hits) if hits else 'none'} "
        f"scores=safe:{scores['safe']:.2f},age:{scores['age_appropriate']:.2f},"
        f"correct:{scores['correct']:.2f},jb_free:{scores['jailbreak_free']:.2f}"
    )
    verdict = VerifyVerdict(
        safe=safe,
        age_appropriate=age_appropriate,
        correct=correct,
        jailbroken=jailbroken,
        scores=scores,
        reason=reason,
        safety_verdict=safety_verdict,
        safety_reason_code=safety_verdict.reason_code,
    )
    return verdict


def verify_content(text: str, policy, context: str = CONTEXT_WEB_RESULT) -> VerifyVerdict:
    """Score ``text`` with parallel Jev-style sub-verdicts.

    ``context`` is one of ``web_result|html_page|tool_output`` (free-form
    strings tolerated for tests). ``policy`` is a
    ``bots.services.safety.SafetyPolicy``.
    """
    mode = _verify_mode()
    if mode == "api":
        try:
            return query_jev(text, policy, context=context)
        except NotImplementedError:
            logger.info("JEV_VERIFY_MODE=api stub unimplemented; using heuristic")
        except Exception:
            logger.exception("Jev API call failed; falling back to heuristic")
    return _heuristic_verify(text, policy, context)


def verify_to_safety_verdict(verdict: VerifyVerdict):
    """Map a :class:`VerifyVerdict` back to the legacy SafetyVerdict.

    Keeps SafetyEvent recording identical: when the heuristic preserved
    the legacy verdict we return it as-is.
    """
    if verdict.safety_verdict is not None:
        return verdict.safety_verdict
    from bots.services.safety import REASON_GLOBAL_FLOOR
    from bots.services.safety import SafetyVerdict as LegacyVerdict

    if verdict.safe:
        return LegacyVerdict(blocked=False)
    return LegacyVerdict(True, REASON_GLOBAL_FLOOR, ())


def gate_text(text: str, policy, context: str, legacy_fn):
    """Run the verify gate, falling back to ``legacy_fn`` when disabled.

    Returns ``(safety_verdict, verify_verdict_or_None)``. The safety
    verdict is what callers record in SafetyEvent (identical schema);
    the verify verdict only enriches log/reason strings.
    """
    if not is_verify_enabled():
        return legacy_fn(text, policy), None
    verdict = verify_content(text, policy, context=context)
    return verify_to_safety_verdict(verdict), verdict
