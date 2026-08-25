# 01 — Teen Delegated Login

## Problem

Syft is a **family** product that still logs everyone in as the parent.

Today a teen uses the parent’s Google/Apple account on their own phone. `Profile.oauth_email` and `get_delegated_tokens()` already exist (`back/bots/views/get_jwt.py`) but:

- `oauth_email` is **not** on `ProfileSerializer` or the frontend `Profile` type
- Deep-link and web redirect **drop** `active_profile_id` and `is_teen_delegated`
- Two profiles with the same email raise `MultipleObjectsReturned`
- No unique constraint, no tests, no UI to invite a teen
- Tutorial still says “login with the parent’s account on the teen’s device”

A teen JWT is the **parent** JWT. Settings, bots, billing, delete-account are all reachable if they guess or skip the PIN.

## Success criteria

- Parent attaches one Google/Apple email per kid profile from the PIN-gated profile editor.
- Teen signs in with **their** account. App locks to that profile. Drawer has Chats + Flashcards only. Settings, subscription, bots, other profiles are unreachable.
- Parent login is unchanged. Parent can still switch profiles.
- Same email cannot be bound to two profiles. Unbinding works. Soft-deleted profiles do not grant login.
- Deep link **and** web `/app/login` both receive `active_profile_id` + `is_teen_delegated`.
- Backend rejects teen-delegated tokens on parent-only endpoints even if the client is malicious.

## Current code to extend (do not rewrite)

| Piece | Path | What exists |
|-------|------|-------------|
| Field | `back/bots/models/profile.py` | `oauth_email` nullable EmailField |
| Login branch | `back/bots/views/get_jwt.py` | `get_delegated_tokens()`, `Profile.objects.get(oauth_email=user.email)` |
| Web redirect | same file | drops extra fields |
| Template | `back/bots/templates/jwt_template.html` | access + refresh only |
| Serializer | `back/bots/serializers/profile_serializer.py` | name, ids, timestamps |
| Front type | `front/api/profiles.ts` | no `oauth_email` |
| Front editor | `front/app/parent/profileEditor.tsx` | name only |
| Front login | `front/app/login.tsx`, `front/hooks/useAuthBootstrap.ts` | stores access/refresh |
| PIN gate | `front/components/PinWrapper.tsx` | client-only |
| Drawer | `front/components/NavigationDrawer.tsx` | Chats, Flashcards, Settings |

---

## Backend

### 1. Constrain and index `oauth_email`

**File:** new migration on `Profile`

```python
class Meta:
    constraints = [
        models.UniqueConstraint(
            fields=["oauth_email"],
            condition=models.Q(oauth_email__isnull=False) & models.Q(deleted_at__isnull=True),
            name="unique_active_profile_oauth_email",
        )
    ]
```

Lookup in `get_jwt` must exclude `deleted_at__isnull=False`. Prefer `filter(...).first()` over `get()` so a legacy duplicate cannot 500 the login page.

### 2. JWT claims

Do **not** keep issuing a raw parent token and hope the client behaves.

Add a custom SimpleJWT claim set:

```python
# back/bots/tokens.py
class SyftRefreshToken(RefreshToken):
    @classmethod
    def for_delegated_profile(cls, parent_user, profile):
        token = cls.for_user(parent_user)
        token["is_teen_delegated"] = True
        token["active_profile_id"] = str(profile.profile_id)
        return token
```

Parent tokens omit those claims (or set `is_teen_delegated=False`). Access token inherits custom claims from refresh.

`get_delegated_tokens` uses `SyftRefreshToken.for_delegated_profile`.

### 3. Permission class

**File:** `back/bots/permissions.py` (new or extend existing `IsOwner`)

```python
class IsParentSession(BasePermission):
    """Deny if the JWT is a teen-delegated session."""
    def has_permission(self, request, view):
        return not request.auth or not request.auth.get("is_teen_delegated")
```

Apply `IsParentSession` to:

- `BotViewSet` write methods (and list if you want teens to only see assigned bots later — for this feature, **read** bots they need for chat; **write** denied)
- `ProfileViewSet` **all methods** except a read-self endpoint
- `DeviceViewSet` create/update is allowed (teen’s phone still needs push) but must not change another device
- `GET/POST /api/user` — GET may return a **redacted** payload (no `pin`); POST pin denied
- `DELETE /api/user/delete` denied
- RevenueCat is webhook-only; no change

Teen **may**:

- `POST /api/chats/new` and `POST /api/chats/<id>` only if `profile` matches `active_profile_id`
- Read chats/decks/flashcards scoped to that profile
- Write decks/flashcards for that profile

Enforce profile lock in `get_chat_response.py` and viewset `get_queryset()`: if claim present, ignore client `profileId` and force the claim.

### 4. Serializer + invite endpoint

Expose `oauth_email` on profile **write** (parent only). Do not expose it to teen reads if you add a teen profile serializer — or return it only on parent list.

Optional but recommended: `POST /api/profiles/{id}/invite` that only sets email after a format check, rather than a raw PUT. Either is fine; keep one path.

Unbind: `oauth_email = null`.

### 5. Forward claims through login HTML and web

**`jwt_template.html`** — add query params `active_profile_id`, `is_teen_delegated`.

**`start_web_login` redirect** — include the same params in `/app/login?...`.

**`get_jwt` lookup** — `Profile.objects.filter(oauth_email__iexact=user.email, deleted_at__isnull=True).first()`.

If the OAuth user is **both** a parent account **and** listed as a teen email (parent invited themselves), prefer **parent** login. Document this. Do not silently delegate.

### 6. Do not create a second User for the teen

The teen’s allauth User is used only as an identity proof. After match, issue tokens **for the parent User** plus claims. If you later want a real teen User, that is a different feature. Do not invent it here.

If the teen OAuth user has no matching profile, they get a **normal new parent account** (signup signal: UserAccount + default profile + Penelope). That is correct — they are a new customer, not a stray kid.

---

## Frontend

### 1. Persist session mode

**Files:** `front/api/tokens.ts`, `front/hooks/useAuthBootstrap.ts`, `front/app/login.tsx`

Store next to JWTs:

```ts
type Session = {
  access: string;
  refresh: string;
  isTeenDelegated: boolean;
  activeProfileId: string | null;
};
```

Read from deep-link / web query. If `is_teen_delegated=true`, immediately `setSelectedProfile(activeProfileId)` and never show profile picker.

### 2. Profile editor — bind email

**File:** `front/app/parent/profileEditor.tsx`

Add field “Teen sign-in email” under name.

Copy:

> Your child can sign in with this Google or Apple email on their own device. They will only see their chats and flashcards.

Validate email format. Empty = unbound. Show current binding and a “Remove teen sign-in” action.

### 3. Hide parent surfaces

**Files:** `front/components/NavigationDrawer.tsx`, `front/app/_layout.tsx`, `front/app/index.tsx`

If `isTeenDelegated`:

- Drawer: Chats, Flashcards. No Settings.
- Deep links to `/parent/*` redirect to `/chat`.
- Login PIN gate is skipped (there is no parent on this device).
- `useSelectedProfile` refuses to change profile.

### 4. Redact account API usage

Teen settings do not exist. If something still calls `GET /api/user`, ignore `pin`. Do not cache a parent PIN on a teen device.

### 5. Tutorial / marketing

**Files:** `back/bots/templates/` tutorial + any in-app copy that says “log in with the parent account on the teen’s phone.”

Replace with: parent invites email → teen taps Google/Apple → locked to their profile.

---

## UI

### Profile editor (parent)

```text
┌─────────────────────────────────────────┐
│ ←  Edit profile                     [✓] │
├─────────────────────────────────────────┤
│ Name                                    │
│ [ Maya                              ]   │
│                                         │
│ Teen sign-in email                      │
│ [ maya@school.edu                   ]   │
│ Maya can sign in with Google or Apple   │
│ using this email. They will not see     │
│ Settings, bots, or billing.             │
│                                         │
│ [ Remove teen sign-in ]                 │
└─────────────────────────────────────────┘
```

### Teen first launch

```text
┌─────────────────────────────────────────┐
│         Welcome, Maya                   │
│     Signed in · Maya's profile          │
│                                         │
│     [ Choose a tutor ]                  │
└─────────────────────────────────────────┘
```

No profile list. No PIN. No “parent login” affordance on this device.

---

## Tests

**Backend** (`back/bots/tests/test_delegated_login.py` — new)

- Matching `oauth_email` → tokens include claims; parent user id is in JWT `user_id`
- Soft-deleted profile → treated as new parent signup path (or 403 — pick one and test it; prefer **do not delegate**)
- Duplicate emails cannot be saved (constraint)
- Teen token: 403 on `POST /api/profiles/`, `POST /api/bots/`, `POST /api/user` (pin), `DELETE /api/user/delete`
- Teen token: 404/403 when posting a chat with a **different** `profile` UUID
- Teen token: can create chat + deck for claimed profile
- Parent token: unchanged access
- Web redirect query string contains both extra params
- Case-insensitive email match
- Parent who is also listed as teen email logs in as parent

**Frontend**

- Login with query flags sets session and selected profile
- Drawer snapshot: no Settings when delegated
- Navigating to `/parent/settings` redirects

---

## Implementation order

1. Migration + unique constraint + case-insensitive lookup
2. Custom JWT claims + `IsParentSession` + queryset lock
3. Serializer field / invite
4. `jwt_template.html` + web redirect params
5. Frontend session storage + login parse
6. Profile editor email field
7. Hide parent navigation
8. Tests + tutorial copy

## Non-goals

- Teen as a first-class Django User with their own bots
- Multiple parents / co-parent invite
- Magic-link email (OAuth only, same as today)
- Changing Apple/Google provider setup
- Per-profile bot allowlists (feature 09)

## Risks

- Issuing parent JWTs without claims is the current half-build — **do not ship UI until claims + permission class land**.
- allauth may create a User row for the teen on first OAuth. That user will have a UserAccount + Penelope from `signals.py`. Harmless leftover; do not log them into it. Optionally skip provisioning when `oauth_email` matches — nice-to-have, not required.
