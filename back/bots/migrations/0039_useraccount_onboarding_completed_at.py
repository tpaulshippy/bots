from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0038_alter_aimodel_options_alter_device_options'),
    ]

    operations = [
        migrations.AddField(
            model_name='useraccount',
            name='onboarding_completed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
