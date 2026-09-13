# Generated for usage attribution fix: stamp the producing model on each
# assistant message so later bot model changes cannot reprice history.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0054_useraccount_usage_reset_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='message',
            name='model_id',
            field=models.CharField(blank=True, db_index=True, default=None, max_length=255, null=True),
        ),
    ]
