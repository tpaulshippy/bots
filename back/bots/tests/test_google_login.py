from django.conf import settings


def describe_google_account_switching():
    def it_forces_google_account_chooser_on_every_login():
        # Shared devices: without prompt=select_account Google silently
        # reuses its session cookie, so logout -> "Login with Google"
        # logs straight back in as the previous user with no way to
        # switch to a different (e.g. kid's) account.
        auth_params = settings.SOCIALACCOUNT_PROVIDERS['google']['AUTH_PARAMS']
        assert auth_params.get('prompt') == 'select_account'

    def it_keeps_online_access_type():
        auth_params = settings.SOCIALACCOUNT_PROVIDERS['google']['AUTH_PARAMS']
        assert auth_params.get('access_type') == 'online'
