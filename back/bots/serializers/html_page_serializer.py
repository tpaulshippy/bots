import re

from rest_framework import serializers

from bots.models import HtmlPage

MAX_HTML_BYTES = 200_000

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def html_to_text(html: str) -> str:
    """Strip tags so safety text checks see rendered words, not markup."""
    text = _HTML_TAG_RE.sub(" ", html or "")
    return re.sub(r"\s+", " ", text).strip()


def is_single_file_html(html: str) -> bool:
    lowered = (html or "").lower()
    return "<html" in lowered or "<!doctype html" in lowered or "<body" in lowered


class HtmlPageSerializer(serializers.ModelSerializer):
    raw_url = serializers.SerializerMethodField()

    class Meta:
        model = HtmlPage
        fields = [
            'id', 'page_id', 'title', 'html',
            'raw_url', 'created_at', 'updated_at',
        ]
        read_only_fields = ['page_id', 'raw_url', 'created_at', 'updated_at']

    def get_raw_url(self, obj):
        return f"/api/html-pages/{obj.page_id}/raw/"

    def validate_title(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Title is required.")
        return value[:255]

    def validate_html(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("HTML is required.")
        if len(value.encode("utf-8")) > MAX_HTML_BYTES:
            raise serializers.ValidationError("HTML exceeds 200KB limit.")
        if not is_single_file_html(value):
            raise serializers.ValidationError("HTML must be a single self-contained page.")
        return value
