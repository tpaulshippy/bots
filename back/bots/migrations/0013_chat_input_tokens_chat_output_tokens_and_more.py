# Generated by Django 5.1.4 on 2024-12-25 05:03

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0012_useraccount'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='chat',
            name='input_tokens',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='chat',
            name='output_tokens',
            field=models.IntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='useraccount',
            name='user',
            field=models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='user_account', to=settings.AUTH_USER_MODEL),
        ),
    ]
