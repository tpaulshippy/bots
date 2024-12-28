# Generated by Django 5.1.4 on 2024-12-28 20:47

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0014_bot_deleted_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='useraccount',
            name='subscription_level',
            field=models.IntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='bot',
            name='deleted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
