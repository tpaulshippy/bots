# Generated for HtmlPage + Bot.enable_html_pages

from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0050_flashcard_due_at_flashcard_ease_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='bot',
            name='enable_html_pages',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='HtmlPage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('page_id', models.UUIDField(default=uuid.uuid4, unique=True)),
                ('title', models.CharField(max_length=255)),
                ('html', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('bot', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='html_pages', to='bots.bot')),
                ('chat', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='html_pages', to='bots.chat')),
                ('profile', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='html_pages', to='bots.profile')),
            ],
        ),
    ]
