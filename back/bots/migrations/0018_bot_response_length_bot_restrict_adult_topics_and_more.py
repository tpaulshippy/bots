# Generated by Django 5.1.4 on 2024-12-29 04:44

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0017_bot_simple_editor'),
    ]

    operations = [
        migrations.AddField(
            model_name='bot',
            name='response_length',
            field=models.IntegerField(default=200),
        ),
        migrations.AddField(
            model_name='bot',
            name='restrict_adult_topics',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='bot',
            name='restrict_language',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='bot',
            name='template_name',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
