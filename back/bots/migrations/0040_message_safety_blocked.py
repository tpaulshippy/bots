from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0039_safetyevent'),
    ]

    operations = [
        migrations.AddField(
            model_name='message',
            name='safety_blocked',
            field=models.BooleanField(default=False),
        ),
    ]
