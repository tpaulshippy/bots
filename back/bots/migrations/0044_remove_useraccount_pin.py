from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0043_hash_legacy_integer_pins'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='useraccount',
            name='pin',
        ),
    ]
