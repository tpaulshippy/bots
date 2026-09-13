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
        migrations.AddField(
            model_name='useraccount',
            name='usage_reset_timezone',
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
        migrations.AddField(
            model_name='useraccount',
            name='usage_reset_cost',
            field=models.FloatField(default=0.0),
        ),
        migrations.AddField(
            model_name='useraccount',
            name='usage_reset_input_tokens',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='useraccount',
            name='usage_reset_output_tokens',
            field=models.IntegerField(default=0),
        ),
    ]
