from django.db import migrations
from django.utils import timezone


def backfill_onboarding_completed(apps, schema_editor):
    """Every UserAccount row with a NULL flag predates the onboarding wizard
    (the column is new in 0047), so none of them ran it — mark them complete
    so established accounts are never forced into the first-run flow.
    Rows created after this migration keep NULL until the wizard runs."""
    UserAccount = apps.get_model('bots', 'UserAccount')
    UserAccount.objects.filter(
        onboarding_completed_at__isnull=True
    ).update(onboarding_completed_at=timezone.now())


class Migration(migrations.Migration):

    dependencies = [
        ('bots', '0047_useraccount_onboarding_completed_at'),
    ]

    operations = [
        migrations.RunPython(
            backfill_onboarding_completed, migrations.RunPython.noop),
    ]
