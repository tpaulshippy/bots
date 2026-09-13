import uuid

from django.db import models


class HtmlPage(models.Model):
    """Single-file HTML page built by the agent for local browser viewing.

    Stored in the DB (never the host filesystem). Served verbatim via the
    sandboxed raw view so JS runs without access to Syft cookies/storage.
    """

    page_id = models.UUIDField(default=uuid.uuid4, unique=True)
    profile = models.ForeignKey('Profile', on_delete=models.CASCADE, related_name='html_pages')
    chat = models.ForeignKey('Chat', on_delete=models.SET_NULL, null=True, blank=True, related_name='html_pages')
    bot = models.ForeignKey('Bot', on_delete=models.SET_NULL, null=True, blank=True, related_name='html_pages')
    title = models.CharField(max_length=255)
    html = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title
