# Generated to persist assistant tool activity for chat history replay.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0051_htmlpage'),
    ]

    operations = [
        migrations.AddField(
            model_name='message',
            name='agent_events',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
