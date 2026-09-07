# Activity digest — cron wiring (roadmap 04)

`send_activity_digests` is Celery-less by design; schedule it from the
host cron or a GitHub Action. It is idempotent-safe to run more often
than needed but sends at most one push per digest-only device per run,
so once daily is the intended cadence.

## Host cron (matches the current single-server deploy)

```cron
# Daily parent activity digest, 18:00 server time
0 18 * * * cd /home/bots/repo/back && ../venv/bin/python manage.py send_activity_digests >> /var/log/bots/digest.log 2>&1
```

## GitHub Action alternative

```yaml
name: activity-digest
on:
  schedule:
    - cron: "0 18 * * *"
jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - setup-python / pip install -r back/requirements.txt  # per repo setup
      - run: cd back && python manage.py send_activity_digests
        env:
          # push delivery needs Expo reachability only; no secrets today
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## Behaviour

- Only devices with `notify_digest_only = true` receive pushes; their
  per-chat/per-message flags are ignored at send time.
- Push title: `Syft daily summary`; body: `Maya: 3 chats · Sam: 1 chat`.
- Users with **no chats in the trailing 24h are skipped** so digests
  never become spam.
- Email digests are intentionally deferred until `EMAIL_BACKEND` is real
  (non-goal in roadmap 04).
