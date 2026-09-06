from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0041_profile_profile_oauth_email_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='useraccount',
            name='pin_hash',
            field=models.CharField(blank=True, max_length=128, null=True),
        ),
        migrations.AddField(
            model_name='useraccount',
            name='pin_failed_attempts',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='useraccount',
            name='pin_locked_until',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
