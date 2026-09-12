"""Seed deterministic data for the spaced repetition Detox e2e flow.

Creates (idempotently):
    - parent user  e2e-test-user / testpassword123
    - one profile and one bot for that user
    - deck "Cell Bio" with 8 cards: 6 due (3 overdue + 3 brand new) and
      2 not-yet-due

Re-running resets the deck's scheduling state to this exact layout, so the
e2e suite always starts from the same queue.

Usage: python manage.py seed_e2e_spaced_repetition
"""

from datetime import timedelta

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.utils import timezone

from bots.models import AiModel, Bot, Deck, Flashcard, Profile

USERNAME = 'e2e-test-user'
PASSWORD = 'testpassword123'
DECK_NAME = 'Cell Bio'

# front -> scheduling state at seed time
CARDS = [
    # Due now (overdue): the e2e run rates these.
    ('What is anaphase?', 'Sister chromatids separate and move to opposite poles', 'due'),
    ('Define osmosis', 'Diffusion of water across a semipermeable membrane', 'due'),
    ('What organelle makes ATP?', 'The mitochondrion', 'due'),
    # Not due yet: must be skipped by the due queue.
    ('What is mitosis?', 'Cell division producing two identical daughter cells', 'future'),
    ('Function of ribosomes', 'Protein synthesis', 'future'),
    # Never reviewed, due immediately by default.
    ('What is a cell membrane?', 'The phospholipid bilayer enclosing the cell', 'new'),
    ('Define photosynthesis', 'Conversion of light energy into chemical energy (glucose)', 'new'),
    ('What does DNA stand for?', 'Deoxyribonucleic acid', 'new'),
]


class Command(BaseCommand):
    help = 'Seed idempotent e2e data for spaced repetition study flows'

    def handle(self, *args, **options):
        user, user_created = User.objects.get_or_create(
            username=USERNAME,
            defaults={'email': f'{USERNAME}@example.com'},
        )
        if user_created or not user.check_password(PASSWORD):
            user.set_password(PASSWORD)
            user.save()

        profile, _ = Profile.objects.update_or_create(
            user=user,
            name='E2E Test Profile',
            # A previous run may have soft-deleted this profile; the
            # profiles API hides deleted rows, so reactivate it.
            defaults={'deleted_at': None},
        )

        ai_model = AiModel.objects.order_by('pk').first()
        bot_defaults = {'deleted_at': None}
        if ai_model is not None:
            bot_defaults['ai_model'] = ai_model
        bot, _ = Bot.objects.update_or_create(
            user=user,
            name='E2E Test Bot',
            # Same soft-delete reactivation as the profile above.
            defaults=bot_defaults,
        )

        deck, _ = Deck.objects.get_or_create(
            profile=profile,
            name=DECK_NAME,
            defaults={'description': 'Seeded deck for spaced repetition e2e tests'},
        )

        now = timezone.now()
        # Recreate the deck's cards from scratch every run: this removes
        # stale/duplicate cards (front is not unique, so upserting cannot
        # converge) and cascades to the cards' FlashcardReview rows, so
        # repeated seeds converge to exactly these eight cards with no
        # leftover activity.
        Flashcard.objects.filter(deck=deck).delete()
        for order, (front, back, state) in enumerate(CARDS):
            card_kwargs = {
                'deck': deck,
                'front': front,
                'back': back,
                'order': order,
                'ease': 2.5,
                'interval_days': 0,
                'reps': 0,
                'lapses': 0,
                'last_reviewed_at': None,
            }
            if state == 'due':
                card_kwargs['due_at'] = now - timedelta(days=1)
            elif state == 'future':
                card_kwargs['due_at'] = now + timedelta(days=7)
            else:  # new
                card_kwargs['due_at'] = now
            Flashcard.objects.create(**card_kwargs)

        due_count = Flashcard.objects.filter(deck=deck, due_at__lte=now).count()
        self.stdout.write(self.style.SUCCESS(
            f"E2E seed complete: user={user.username} (created={user_created}) "
            f"profile_id={profile.profile_id} bot_id={bot.bot_id} "
            f"deck_id={deck.deck_id} cards={Flashcard.objects.filter(deck=deck).count()} "
            f"due_now={due_count}"
        ))
