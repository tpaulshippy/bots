from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0045_device_notify_digest_only'),
    ]

    operations = [
        migrations.AddField(
            model_name='useraccount',
            name='onboarding_completed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
