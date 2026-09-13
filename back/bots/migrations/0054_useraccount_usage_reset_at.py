# Generated for admin daily token reset (non-destructive).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0053_strip_web_search_sentence'),
    ]

    operations = [
        migrations.AddField(
            model_name='useraccount',
            name='usage_reset_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
