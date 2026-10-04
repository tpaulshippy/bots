"""Map-reduce learning analytics (Jev features over chats) — heuristic v1.

Map: per-message feature extraction (pure, no network).
Reduce: per-profile summary over user messages + flashcard reviews.

`query_jev()` is the batch seam for a future TypeSafe map-reduce call.
It is a stub: with no network by default, gated by JEV_ANALYTICS_ENABLED.
"""
import os
import re
from dataclasses import asdict, dataclass

from django.utils import timezone

SUBJECT_KEYWORDS = {
    "math": ["algebra", "geometry", "fraction", "equation", "multiply", "divide",
             "plus", "minus", "times", "math", "calculus", "pythagoras", "decimal"],
    "science": ["science", "biology", "chemistry", "physics", "cell", "atom",
                "gravity", "photosynthesis", "experiment"],
    "history": ["history", "war", "ancient", "rome", "egypt", "revolution",
                "president", "century"],
    "english": ["essay", "grammar", "spelling", "poem", "novel", "writing",
                "english", "paragraph", "thesis"],
    "geography": ["geography", "map", "country", "capital", "river", "continent"],
}

STRUGGLING_CUES = [
    "i don't get it", "i dont get it", "don't understand", "dont understand",
    "confused", "i'm stuck", "im stuck", "stuck", "help", "wrong",
    "hard", "difficult", "i give up", "no idea", "??", "huh?",
    "can you explain", "what do you mean",
]

MASTERY_CUES = [
    "got it", "i understand", "i get it", "makes sense", "easy",
    "that helps", "thanks", "correct", "i knew", "nailed it", "ohh",
]

REVIEW_MASTERY = {"again": 0.1, "hard": 0.4, "good": 0.75, "easy": 0.95}


def is_jev_enabled() -> bool:
    return os.environ.get("JEV_ANALYTICS_ENABLED", "").lower() in ("1", "true", "yes")


@dataclass
class MessageFeatures:
    subject: str
    mastery_p: float
    struggling: bool
    needs_review: bool
    scores: dict


def _detect_subject(text_lower: str) -> str:
    for subject, keywords in SUBJECT_KEYWORDS.items():
        for kw in keywords:
            if kw in text_lower:
                return subject
    return "general"


def _count_cues(text_lower: str, cues: list) -> int:
    return sum(1 for cue in cues if cue in text_lower)


def extract_message_features(text: str) -> MessageFeatures:
    """Heuristic v1 map step: text -> typed per-message features."""
    lowered = (text or "").lower()
    subject = _detect_subject(lowered)
    struggle_hits = _count_cues(lowered, STRUGGLING_CUES)
    mastery_hits = _count_cues(lowered, MASTERY_CUES)

    # Length/effort proxy: very short messages lean disengaged, longer
    # explanatory messages lean mastery. Bounded so it never dominates cues.
    words = len(re.findall(r"\w+", lowered))
    if words <= 3:
        effort = -0.05
    elif words >= 25:
        effort = 0.10
    elif words >= 10:
        effort = 0.05
    else:
        effort = 0.0

    mastery_p = 0.5 + 0.15 * mastery_hits - 0.20 * struggle_hits + effort
    mastery_p = max(0.0, min(1.0, round(mastery_p, 3)))

    struggling = struggle_hits > 0 and mastery_p < 0.5
    needs_review = struggling or mastery_p < 0.4
    scores = {
        "struggle_hits": struggle_hits,
        "mastery_hits": mastery_hits,
        "words": words,
        "effort": effort,
    }
    return MessageFeatures(
        subject=subject,
        mastery_p=mastery_p,
        struggling=struggling,
        needs_review=needs_review,
        scores=scores,
    )


def query_jev(messages_batch, mode="map"):
    """Batch seam stub for a future TypeSafe Jev map-reduce call.

    Returns None unless JEV_ANALYTICS_ENABLED is set; never touches the
    network in v1. Callers must fall back to the local heuristic.
    """
    if not is_jev_enabled():
        return None
    # Future: TypeSafe client batch call here. Stub returns sentinel so
    # wiring can be tested without network.
    return {"mode": mode, "stub": True, "count": len(list(messages_batch))}


def _review_mastery(rating: str) -> float:
    return REVIEW_MASTERY.get((rating or "").lower(), 0.5)


def summarize_profile(messages_qs, reviews_qs, now=None) -> dict:
    """Reduce step: aggregate mapped message features + reviews.

    messages_qs: iterable of Message (or objects with .text/.created_at).
    reviews_qs: iterable of FlashcardReview (or objects with .rating/.reviewed_at).
    """
    now = now or timezone.now()
    features = [extract_message_features(getattr(m, "text", "") or "") for m in messages_qs]

    subjects: dict = {}
    for feat in features:
        bucket = subjects.setdefault(
            feat.subject, {"count": 0, "mastery_sum": 0.0, "struggling": 0, "needs_review": 0}
        )
        bucket["count"] += 1
        bucket["mastery_sum"] += feat.mastery_p
        bucket["struggling"] += 1 if feat.struggling else 0
        bucket["needs_review"] += 1 if feat.needs_review else 0

    review_ratings = [_review_mastery(getattr(r, "rating", "")) for r in list(reviews_qs or [])]
    review_avg = round(sum(review_ratings) / len(review_ratings), 3) if review_ratings else None

    subject_out = {}
    for subject, bucket in subjects.items():
        avg = bucket["mastery_sum"] / bucket["count"] if bucket["count"] else 0.0
        subject_out[subject] = {
            "count": bucket["count"],
            "avg_mastery": round(avg, 3),
            "struggling": bucket["struggling"],
            "needs_review": bucket["needs_review"],
        }

    if features:
        msg_avg = sum(f.mastery_p for f in features) / len(features)
    else:
        msg_avg = None
    if msg_avg is not None and review_avg is not None:
        avg_mastery = round((msg_avg + review_avg) / 2, 3)
    elif msg_avg is not None:
        avg_mastery = round(msg_avg, 3)
    elif review_avg is not None:
        avg_mastery = review_avg
    else:
        avg_mastery = 0.5

    struggling_topics = sorted(
        s for s, b in subject_out.items() if b["avg_mastery"] < 0.5 or b["struggling"] > 0
    )

    # Churn: days since last activity (message or review) dominates.
    last_activity = None
    for m in messages_qs:
        ts = getattr(m, "created_at", None)
        if ts is not None and (last_activity is None or ts > last_activity):
            last_activity = ts
    for r in reviews_qs or []:
        ts = getattr(r, "reviewed_at", None)
        if ts is not None and (last_activity is None or ts > last_activity):
            last_activity = ts
    if last_activity is None:
        days_inactive = 30
    else:
        days_inactive = max(0, (now - last_activity).days)

    churn = min(0.95, round(days_inactive / 10 + 0.1, 3))
    if avg_mastery < 0.4:
        churn = min(0.95, round(churn + 0.1, 3))
    if review_ratings and len(review_ratings) >= 3 and review_avg is not None and review_avg >= 0.7:
        churn = max(0.05, round(churn - 0.1, 3))

    return {
        "subjects": subject_out,
        "avg_mastery": avg_mastery,
        "struggling_topics": struggling_topics,
        "churn_likelihood": churn,
        "message_count": len(features),
        "review_count": len(review_ratings),
        "review_avg": review_avg,
        "days_inactive": days_inactive,
    }


def feature_dict(feat: MessageFeatures) -> dict:
    return asdict(feat)
