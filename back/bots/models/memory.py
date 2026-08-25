from django.db import models


class ProfileMemory(models.Model):
    """Persistent per-profile memory the model sees every turn.

    Stores a rolling summary, parent-authored notes, active learning goals,
    and per-topic strength ratings.  1:1 with Profile.
    """
    profile = models.OneToOneField(
        'Profile',
        on_delete=models.CASCADE,
        related_name='memory',
    )
    summary = models.TextField(
        blank=True,
        default='',
        help_text='Model-maintained rolling summary of the student.',
    )
    parent_notes = models.TextField(
        blank=True,
        default='',
        help_text='Parent-authored notes visible to the tutor.',
    )
    goals_json = models.JSONField(
        default=list,
        blank=True,
        help_text='Active learning goals, e.g. [{"id": "...", "text": "...", "status": "active"}].',
    )
    topics_json = models.JSONField(
        default=list,
        blank=True,
        help_text='Per-topic strength, e.g. [{"topic": "fractions", "strength": 0.3, "source": "srs"}].',
    )
    updated_at = models.DateTimeField(auto_now=True)
    summary_updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'profile memory'
        verbose_name_plural = 'profile memories'

    def __str__(self):
        return f'Memory({self.profile})'


class ChatSummary(models.Model):
    """Per-chat summary covering older turns that have scrolled out of the
    live window.  Created / extended by the summarizer job.
    """
    chat = models.OneToOneField(
        'Chat',
        on_delete=models.CASCADE,
        related_name='summary',
    )
    summary = models.TextField(blank=True, default='')
    covered_through_order = models.PositiveIntegerField(
        default=0,
        help_text='Highest message.order already included in summary.',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'chat summary'
        verbose_name_plural = 'chat summaries'

    def __str__(self):
        return f'ChatSummary({self.chat_id})'


class MemoryEvent(models.Model):
    """Audit / debug log for memory mutations."""
    profile = models.ForeignKey(
        'Profile',
        on_delete=models.CASCADE,
        related_name='memory_events',
    )
    chat = models.ForeignKey(
        'Chat',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='memory_events',
    )
    kind = models.CharField(
        max_length=32,
        help_text='E.g. summary_refresh, topic_extract, parent_edit.',
    )
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'memory event'
        verbose_name_plural = 'memory events'

    def __str__(self):
        return f'MemoryEvent({self.kind}, {self.profile_id})'
