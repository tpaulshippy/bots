from django.contrib.auth.hashers import make_password
from django.db import migrations


def hash_legacy_pins(apps, schema_editor):
    """Convert legacy plaintext integer PINs to hashed pin_hash values.

    Historical UserAccount still has the integer `pin` column at this point;
    it is removed by the following migration.
    """
    UserAccount = apps.get_model('bots', 'UserAccount')
    for account in UserAccount.objects.exclude(pin__isnull=True).iterator():
        account.pin_hash = make_password(str(account.pin))
        account.pin_failed_attempts = 0
        account.save(update_fields=['pin_hash', 'pin_failed_attempts'])


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0039_useraccount_pin_hash_pin_failed_attempts_pin_locked_until'),
    ]

    operations = [
        migrations.RunPython(hash_legacy_pins, migrations.RunPython.noop),
    ]
