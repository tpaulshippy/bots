import re

from django.conf import settings


class SafetyBlock(Exception):
    def __init__(self, reason):
        self.reason = reason
        super().__init__(reason)


def compiled_patterns():
    return [re.compile(pattern, re.IGNORECASE)
            for pattern in settings.SAFETY_BLOCKED_PATTERNS]


def check_text(text):
    """Raises SafetyBlock if the text violates the safety policy."""
    for pattern in compiled_patterns():
        match = pattern.search(text)
        if match:
            raise SafetyBlock(match.group(0))
