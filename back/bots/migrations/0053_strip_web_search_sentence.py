import re

from django.db import migrations

# Baked in by front/api/botTemplates.ts before web_search guidance moved
# server-side (Chat.get_system_message). The backend now appends its own
# copy when the flag is on, so rows keeping this sentence would send it
# twice. Removal is exact-substring; parent-edited prompts are untouched
# apart from losing this sentence.
LEGACY_SENTENCE = (
    "You may use the web_search tool to look up current information. "
    "Use it when you need to find up-to-date facts, recent events, "
    "or information beyond your training data."
)


def strip_web_search_sentence(apps, schema_editor):
    Bot = apps.get_model('bots', 'Bot')
    for bot in Bot.objects.exclude(system_prompt__isnull=True).exclude(system_prompt=""):
        if LEGACY_SENTENCE not in (bot.system_prompt or ""):
            continue
        cleaned = bot.system_prompt.replace(LEGACY_SENTENCE, "")
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
        bot.system_prompt = cleaned
        bot.save(update_fields=["system_prompt"])


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0052_message_agent_events'),
    ]

    operations = [
        migrations.RunPython(
            strip_web_search_sentence, migrations.RunPython.noop),
    ]
