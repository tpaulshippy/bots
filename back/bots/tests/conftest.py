import socket

import pytest
from django.conf import settings
from django.core.management import call_command
from django.db import connection

# --- Hermetic test environment -------------------------------------------------
#
# Three settings below are production-shaped but ruin the test run when they
# pick up a developer's ambient environment. Pin them here so the suite behaves
# identically on every machine, with or without a populated .env.

# 1. PBKDF2 runs ~1.2M iterations (~455ms per hash here) and dominated the
#    suite: it is used for both account passwords and parent PINs. Tests only
#    ever round-trip a secret through check_password, never assert on the
#    encoded format or cost factor, so the production hasher buys nothing.
#    MD5PasswordHasher is Django's supported insecure hasher, meant for
#    exactly this case. Production keeps the PBKDF2 default.
settings.PASSWORD_HASHERS = [
    # First entry is the default used for *encoding*, so this is the fast one.
    'django.contrib.auth.hashers.MD5PasswordHasher',
    # Kept so tests can still verify a hash produced under the production
    # hasher: check_password dispatches on the algorithm stored in the string,
    # and resolves it from this list, so dropping it entirely makes every
    # PBKDF2 hash unreadable with a ValueError. Costs nothing to keep.
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
]

# 2. Both of these switch on real network calls when a key is exported:
#    safety.guardrail_check posts every evaluated prompt to the OpenAI
#    moderation API, and web search opens a Tavily client. With a key in the
#    environment the suite silently made ~240 live HTTPS requests (~29s) and
#    billed real quota, and its outcome depended on whether the key happened
#    to be exported. Tests that exercise these paths set the key themselves
#    and patch the transport; see test_safety.py and test_chat.py.
settings.OPENAI_API_KEY = ''
settings.TAVILY_API_KEY = ''


class NetworkAccessAttempted(AssertionError):
    """Raised when a test opens an outbound socket."""


@pytest.fixture(autouse=True, scope='session')
def _no_outbound_network():
    """Fail loudly and fast if any test opens an outbound socket.

    A missing mock is a slow, billable, non-deterministic failure: the suite
    still passes, just later and with the network in the loop. Blocking at the
    socket layer turns that into an immediate, obvious failure and keeps the
    run hermetic. Loopback stays open so anything binding a local port works.

    sendto() is covered alongside connect()/connect_ex() because a datagram
    socket sends straight to its destination without ever connecting.
    """
    real = {
        'connect': socket.socket.connect,
        'connect_ex': socket.socket.connect_ex,
        'sendto': socket.socket.sendto,
        'create_connection': socket.create_connection,
    }

    def _is_loopback(address):
        if isinstance(address, tuple) and address:
            host = str(address[0])
            return host in {'127.0.0.1', '::1', 'localhost', ''}
        # A connected socket may be handed an empty address, which just means
        # "send on the existing connection" rather than a new destination.
        return True

    def _guard(address):
        if not _is_loopback(address):
            raise NetworkAccessAttempted(
                f'Test sent data to {address}. Mock the network call '
                f'instead of reaching the internet.'
            )

    def connect(self, address):
        _guard(address)
        return real['connect'](self, address)

    def connect_ex(self, address):
        _guard(address)
        return real['connect_ex'](self, address)

    def sendto(self, data, *args):
        if args:
            _guard(args[-1])
        return real['sendto'](self, data, *args)

    def create_connection(address, *args, **kwargs):
        _guard(address)
        return real['create_connection'](address, *args, **kwargs)

    socket.socket.connect = connect
    socket.socket.connect_ex = connect_ex
    socket.socket.sendto = sendto
    socket.create_connection = create_connection
    try:
        yield
    finally:
        socket.socket.connect = real['connect']
        socket.socket.connect_ex = real['connect_ex']
        socket.socket.sendto = real['sendto']
        socket.create_connection = real['create_connection']


@pytest.fixture
def load_fixture():
    call_command('loaddata', 'ai_models.json')


@pytest.fixture
def backdate_modified_at():
    """Backdate a Chat's auto_now modified_at field via raw SQL (ORM save would overwrite it)."""
    def _backdate(chat, when):
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE bots_chat SET modified_at = %s WHERE id = %s",
                [when, chat.id]
            )
    return _backdate


@pytest.fixture
def backdate_message_created_at():
    """Backdate a Message's auto_now_add created_at field via raw SQL (ORM save would overwrite it)."""
    def _backdate(message, when):
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE bots_message SET created_at = %s WHERE id = %s",
                [when, message.id]
            )
    return _backdate
