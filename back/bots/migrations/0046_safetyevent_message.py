# Generated for roadmap 04 follow-up: anchor safety events to transcript turns.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0045_device_notify_digest_only'),
    ]

    operations = [
        migrations.AddField(
            model_name='safetyevent',
            name='message',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to='bots.message'),
        ),
    ]
