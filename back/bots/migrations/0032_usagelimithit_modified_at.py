# Generated by Django 5.1.4 on 2025-03-14 18:24

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0031_remove_message_image_url_message_image_filename'),
    ]

    operations = [
        migrations.AddField(
            model_name='usagelimithit',
            name='modified_at',
            field=models.DateTimeField(auto_now=True),
        ),
    ]
