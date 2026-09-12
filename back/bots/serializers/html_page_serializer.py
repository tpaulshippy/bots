import html as html_lib
import re

from rest_framework import serializers

from bots.models import HtmlPage

MAX_HTML_BYTES = 200_000

_HTML_TAG_RE = re.compile(r"<[^>]+>")
# Resource-loading attributes whose values must stay offline: pages are
# single-file, so any remote/scriptable URL is rejected. `data:` images and
# `#` fragment links are allowed.
_EXTERNAL_URL_ATTRS = (
    "src", "href", "srcset", "action", "formaction", "cite",
    "data", "poster", "codebase",
)
_EXTERNAL_URL_RE = re.compile(
    r"(?i)\b(?:src|href|srcset|action|formaction|cite|data|poster|codebase)"
    r"\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+))"
)


def _is_remote_url(value: str) -> bool:
    v = (value or "").strip().lower()
    if not v or v.startswith("#"):
        return False
    if v.startswith(("http:", "https:", "//", "javascript:", "vbscript:")):
        return True
    # data: is only allowed for images/media/fonts, never executable HTML.
    # Checked before comma-splitting since data URIs contain commas.
    if v.startswith("data:"):
        return not v.startswith(("data:image/", "data:audio/", "data:video/", "data:font/"))
    # srcset lists mix candidates: "a.png 1x, https://evil/x.js 2x".
    if "," in v:
        return any(
            _is_remote_url(part.split()[0])
            for part in v.split(",") if part.strip()
        )
    return False


def has_external_resource(html: str) -> bool:
    """True when the document references any off-page resource."""
    for match in _EXTERNAL_URL_RE.finditer(html or ""):
        value = next((g for g in match.groups() if g is not None), "")
        if _is_remote_url(value):
            return True
    return False


def html_to_text(html: str) -> str:
    """Strip tags then decode entities so safety checks see rendered words.

    Without unescaping, `p&#111;rn` looks innocent to the text filter while
    the browser renders `porn`.
    """
    text = _HTML_TAG_RE.sub(" ", html or "")
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def is_single_file_html(html: str) -> bool:
    lowered = (html or "").lower()
    if not ("<html" in lowered or "<!doctype html" in lowered or "<body" in lowered):
        return False
    return not has_external_resource(html or "")


class HtmlPageLinkSerializer(serializers.Serializer):
    """Response shape of the signed browser-handoff link action."""

    url = serializers.CharField()


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
