"""Seed a polished, self-contained demo dataset for marketing capture.

Distinct from the ``seed_e2e_*`` commands, which exist to make the automated
suite deterministic with obviously-fake data ("E2E Test Bot", "Seeded deck for
spaced repetition e2e tests"). Those strings are fine in a test fixture and
unusable in a screenshot.

What this creates for the ``promo-demo`` account:

    - 2 student profiles, 4 named bots with kid-friendly colours and icons
    - 3 conversations with a real Socratic tutoring exchange (the tutor asks
      back and waits for the student's reasoning rather than answering)
    - 2 flashcard decks, one wired to a 9-day review streak
    - 2 Study Materials pages
    - no parent PIN, onboarding complete, subscription level set

No AWS credentials and no AI cost: every message is written by hand, so this is
safe to run against a throwaway database.

Usage: python manage.py seed_promo_demo
"""

from datetime import timedelta

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.utils import timezone

from bots.models import (
    AiModel,
    Bot,
    Chat,
    Deck,
    Flashcard,
    FlashcardReview,
    HtmlPage,
    Message,
    Profile,
    UserAccount,
)

USERNAME = 'promo-demo'
PASSWORD = 'promo-pass-123'

# Colour/icon values must come from front/constants/botAppearance.ts.
BOTS = [
    ('Math Bot', '#3A86FF', 'cpu', 'You are a patient maths tutor for a student in '
     'year 7. You never give the final answer straight away. You ask a question '
     'that builds on what the student just said, and you confirm their reasoning '
     'before moving on.'),
    ('Penelope', '#F3722C', 'text.bubble', 'You are a warm writing tutor. You coach '
     'structure and voice, and you never write the essay for the student.'),
    ('Science Bot', '#43AA8B', 'mountain.2', 'You are a science tutor who uses '
     'everyday analogies and checks understanding with a quick question.'),
    ('Story Buddy', '#8338EC', 'wand.and.sparkles', 'You are a creative writing '
     'buddy who helps a student find ideas and drafts with them.'),
]

# (profile, bot, title, [(role, text), ...])
FRACTIONS = [
    ('user', 'I have to work out why 2/4 is the same as 1/2 and I don\'t get it'),
    ('assistant',
     "Let's use a pizza. If I cut a pizza in half, how many pieces do I have?"),
    ('user', '2'),
    ('assistant', "Right — two pieces. Now what if I cut each of those pieces in "
                  "half again? How many pieces now?"),
    ('user', '4, but they\'re smaller'),
    ('assistant', "Exactly, and each piece is now a quarter of the whole pizza. "
                  "So 2/4 means two of those quarters. What is 2/4 worth, in "
                  "halves?"),
    ('user', 'a half'),
    ('assistant',
     "That's it — 2/4 and 1/2 are the same amount, you just wrote it a longer way. "
     "We call that *simplifying a fraction*. Want to try one together?"),
]

PRIME = [
    ('user', 'what actually makes a number a prime number?'),
    ('assistant',
     "Good question. A prime number has exactly two factors: 1, and itself. "
     "Let's test one. Take 7. What can you multiply it by to get 7?"),
    ('user', '1 and 7'),
    ('assistant',
     "Right, and 1 and 7 are different numbers, so 7 is prime. Now try 9 — what "
     "multiplies to make it?"),
    ('user', '3 and 3'),
    ('assistant',
     "3 and 3 are the same number, so 9 only has one *distinct* factor besides "
     "itself. That means 9 is not prime. Spot the rule?"),
    ('user', 'the two factors have to be different?'),
]

CELLS = [
    ('user', 'why do we say mitochondria are the powerhouse of the cell?'),
    ('assistant',
     "Think of a cell like a house. Food comes in through the door, but something "
     "has to turn it into energy you can use. Which room would you put that in?"),
    ('user', 'the kitchen?'),
    ('assistant',
     "Close — the kitchen is where food is *stored*. The mitochondria break that "
     "food down and release the energy as ATP, which the cell spends like currency. "
     "So the powerhouse, not the pantry."),
]

# Deck: (name, description, [(front, back, due_state)])
DECKS = [
    ('Fractions', 'Core fraction skills: simplifying, comparing, and converting.', [
        ('What is 2/4 simplified?', '1/2 — divide both by 2', 'due'),
        ('What is 3/6 simplified?', '1/2 — divide both by 3', 'due'),
        ('Is 9 a prime number?', 'No — its only factors are 3 and 3', 'due'),
        ('What makes a number prime?', 'Exactly two factors: 1 and itself', 'future'),
        ('What is 1/2 + 1/2?', '1 — the two halves make a whole', 'future'),
    ]),
    ('Cell Biology', ' organelles, osmosis, and ATP.', [
        ('What organelle makes ATP?', 'The mitochondrion', 'due'),
        ('Define osmosis', 'Diffusion of water across a semipermeable membrane', 'due'),
        ('What is mitosis?', 'Cell division producing two identical daughter cells', 'due'),
        ('Function of ribosomes', 'Protein synthesis', 'new'),
    ]),
]

# A study page is a real HTML document served to the student's browser or WebView,
# with no app chrome around it. Seeding bare <h1>/<li> markup renders as default
# serif text, which reads as unfinished in a promo shot, so the demo pages carry a
# small stylesheet in the same palette as the video and the app's teal accent.
PAGE_CSS = """
:root { --brand:#0a7ea4; --accent:#00a4c9; --ink:#0b1720; --muted:#5a6b76; }
* { box-sizing:border-box; }
body { margin:0; padding:0 0 48px; background:#f4f8fa; color:var(--ink);
  font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
header { background:linear-gradient(135deg,var(--brand),var(--accent));
  color:#fff; padding:22px 20px 24px; }
header h1 { margin:0 0 4px; font-size:24px; line-height:1.2; letter-spacing:-.2px; }
header p { margin:0; opacity:.92; font-size:14px; }
main { max-width:620px; margin:0 auto; padding:0 16px; }
.card { background:#fff; border:1px solid #dce8ee; border-radius:14px;
  margin-top:14px; padding:14px 16px; box-shadow:0 1px 2px rgba(10,126,164,.06); }
.q { display:flex; gap:12px; align-items:baseline; }
.q b { flex:0 0 26px; height:26px; border-radius:50%; background:var(--accent);
  color:#fff; font-size:13px; display:grid; place-items:center; }
.q span { font-size:17px; font-weight:600; }
.note { background:#e6f5fa; border-left:4px solid var(--accent);
  border-radius:0 12px 12px 0; padding:13px 16px; margin-top:20px; }
.note h2 { margin:0 0 4px; font-size:13px; text-transform:uppercase;
  letter-spacing:.6px; color:var(--brand); }
.note p { margin:0; font-size:15px; }
"""


def page(body):
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<style>{PAGE_CSS}</style></head><body>{body}</body></html>')


def _header(title, sub):
    return f'<header><h1>{title}</h1><p>{sub}</p></header><main>'


PAGES = [
    ('Fractions Practice Lab', page(
        _header('Fractions Practice Lab',
                'Work through these in any order. Say your answer out loud before you check it.')
        + ''.join(
            f'<div class="card"><div class="q"><b>{i}</b><span>{q}</span></div></div>'
            for i, q in enumerate(
                ['Simplify 4/8', 'Simplify 6/9', 'Which is bigger: 2/3 or 3/5?',
                 'Write 0.5 as a fraction', 'Simplify 15/20',
                 'Which is bigger: 1/2 or 2/5?'], 1))
        + '<div class="note"><h2>Remember</h2><p>To compare fractions, '
          'get them over the same denominator first.</p></div></main>')),
    ('Cell Structure Tour', page(
        _header('Cell Structure Tour', 'Four checkpoints. Read them in order.')
        + ''.join(
            f'<div class="card"><div class="q"><b>{i}</b><span>{n}</span></div>'
            f'<div style="color:var(--muted);font-size:15px;margin-top:4px">{d}</div></div>'
            for i, (n, d) in enumerate(
                [('Nucleus', 'Stores the DNA'),
                 ('Mitochondrion', 'Makes ATP — the cell’s energy'),
                 ('Ribosome', 'Builds proteins'),
                 ('Cell membrane', 'Controls what gets in and out')], 1))
        + '<div class="note"><h2>Common mix-up</h2><p>Plants have '
          'mitochondria too — they are not only in muscle cells.</p></div>'
          '</main>')),
]


class Command(BaseCommand):
    help = 'Seed polished demo data for marketing screenshots and video capture'

    def handle(self, *args, **options):
        now = timezone.now()

        user, created = User.objects.get_or_create(
            username=USERNAME,
            defaults={'email': 'promo@example.com'},
        )
        user.set_password(PASSWORD)
        user.save()

        account, _ = UserAccount.objects.get_or_create(user=user)
        account.pin_hash = ''            # no PIN prompt, so Activity renders
        account.pin_failed_attempts = 0
        account.pin_locked_until = None
        account.subscription_level = 2   # Pro
        account.onboarding_completed_at = now
        account.save()

        model = AiModel.objects.order_by('pk').first()

        maya, _ = Profile.objects.update_or_create(
            user=user, name='Maya', defaults={'deleted_at': None})
        sam, _ = Profile.objects.update_or_create(
            user=user, name='Sam', defaults={'deleted_at': None})
        # Creating the user fires post_save -> provision_default_content, which
        # makes a profile named user.first_name -- empty here, so it arrives
        # nameless. Left in place it is a third selectable profile that shows no
        # seeded content. The promo wants exactly Maya and Sam.
        Profile.objects.filter(user=user).exclude(
            name__in=['Maya', 'Sam']).delete()

        bots = {}
        for name, color, icon, prompt in BOTS:
            defaults = {
                'color': color,
                'icon': icon,
                'system_prompt': prompt,
                # Open straight into the advanced editor, which is where the
                # parent-editable system prompt lives. A brand-new bot defaults
                # to the simple generator, and the only way out of that is a
                # checkmark icon in the header with no testID — too fragile to
                # drive from a capture script. simple_editor=False is a normal
                # persisted state once a parent has used it.
                'simple_editor': False,
                'deleted_at': None,
            }
            if model is not None:
                defaults['ai_model'] = model
            bot, _ = Bot.objects.update_or_create(
                user=user, name=name, defaults=defaults)
            bots[name] = bot

        # --- conversations -------------------------------------------------
        # Wipe this account's prior promo content so re-runs converge.
        Chat.objects.filter(user=user).delete()
        HtmlPage.objects.filter(profile__user=user).delete()
        Deck.objects.filter(profile__user=user).delete()

        convos = [
            (maya, bots['Penelope'], 'Can you help with fractions?', FRACTIONS),
            (maya, bots['Math Bot'], 'What is a prime number?', PRIME),
            (sam, bots['Science Bot'], 'Why mitochondria?', CELLS),
        ]
        chats = []
        for profile, bot, title, script in convos:
            chat = Chat.objects.create(user=user, profile=profile, bot=bot, title=title)
            for order, (role, text) in enumerate(script):
                Message.objects.create(
                    chat=chat,
                    role=role,
                    order=order,
                    text=text,
                    input_tokens=40,
                    output_tokens=60,
                )
            chats.append(chat)

        # --- decks, cards, and a review streak ------------------------------
        streak_deck = None
        for name, description, cards in DECKS:
            deck = Deck.objects.create(
                profile=maya, name=name, description=description)
            for order, (front, back, state) in enumerate(cards):
                due = {
                    'due': now - timedelta(days=1),
                    'future': now + timedelta(days=6),
                    'new': now,
                }[state]
                card = Flashcard.objects.create(
                    deck=deck, front=front, back=back, order=order,
                    due_at=due, ease=2.5, interval_days=0, reps=0, lapses=0,
                )
                if state == 'future':
                    card.interval_days = 6
                    card.reps = 2
                    card.last_reviewed_at = now - timedelta(days=6)
                    card.save()
                if deck.name == 'Fractions':
                    streak_deck = deck

        # Nine consecutive days of reviews so the Stats screen has a real
        # streak instead of the single-day default the e2e seed produces.
        #
        # FlashcardReview.reviewed_at is auto_now_add, so passing it to
        # create() is silently ignored — every row lands on "now" and the
        # streak comes out as 1. Write the timestamps back with a queryset
        # .update(), which bypasses auto_now_add.
        if streak_deck:
            cards = list(streak_deck.flashcards.order_by('order')[:3])
            for day in range(9):
                when = now - timedelta(days=8 - day)
                for n, card in enumerate(cards[: (day % 3) + 1]):
                    review = FlashcardReview.objects.create(
                        flashcard=card,
                        profile=maya,
                        rating=('good', 'easy', 'hard')[(day + n) % 3],
                    )
                    FlashcardReview.objects.filter(pk=review.pk).update(reviewed_at=when)

        # --- study materials ------------------------------------------------
        for i, (title, html) in enumerate(PAGES):
            HtmlPage.objects.create(
                profile=maya,
                bot=chats[i % len(chats)].bot,
                chat=chats[i % len(chats)],
                title=title,
                html=html,
            )

        self.stdout.write(self.style.SUCCESS(
            f"Promo seed: user={USERNAME} password={PASSWORD} "
            f"profiles=2 bots={len(BOTS)} chats={len(convos)} "
            f"decks={len(DECKS)} pages={len(PAGES)} pin=none"
        ))
