# Generated by Django 5.1.4 on 2024-12-17 17:50

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0002_message_role_alter_message_chat'),
    ]

    operations = [
        migrations.AddField(
            model_name='message',
            name='order',
            field=models.IntegerField(default=0),
        ),
    ]
