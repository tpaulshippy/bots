from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0048_backfill_onboarding_completed_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='profile',
            name='photo_filename',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
