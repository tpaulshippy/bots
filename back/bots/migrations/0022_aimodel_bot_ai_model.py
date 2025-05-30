# Generated by Django 5.1.4 on 2025-01-10 02:30

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0021_usagelimithit'),
    ]

    operations = [
        migrations.CreateModel(
            name='AiModel',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('model_id', models.CharField(max_length=255, unique=True)),
                ('name', models.CharField(max_length=255)),
                ('input_token_cost', models.FloatField(default=1.0)),
                ('output_token_cost', models.FloatField(default=1.0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('modified_at', models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.AddField(
            model_name='bot',
            name='ai_model',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, to='bots.aimodel'),
        ),
    ]
