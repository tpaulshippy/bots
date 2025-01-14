# Generated by Django 5.1.4 on 2025-01-10 04:47

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0023_remove_bot_model_aimodel_is_default'),
    ]

    operations = [
        migrations.AlterField(
            model_name='aimodel',
            name='input_token_cost',
            field=models.FloatField(default=1.0, validators=[django.core.validators.MinValueValidator(0.0)]),
        ),
        migrations.AlterField(
            model_name='aimodel',
            name='model_id',
            field=models.CharField(db_index=True, max_length=255, unique=True),
        ),
        migrations.AlterField(
            model_name='aimodel',
            name='output_token_cost',
            field=models.FloatField(default=1.0, validators=[django.core.validators.MinValueValidator(0.0)]),
        ),
        migrations.AddConstraint(
            model_name='aimodel',
            constraint=models.UniqueConstraint(condition=models.Q(('is_default', True)), fields=('is_default',), name='unique_default_model'),
        ),
    ]
