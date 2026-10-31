# syft-site (Cloudflare Pages)

Single Pages site hosting BOTH the marketing pages and the Expo web app.
Built by `site/build.mjs` (node, no deps) into `site/dist/` from vendored
sources under `site/source/` (no git dependency, so CI works with a shallow
checkout and with `back/` deleted on main):

- `site/source/templates/{marketing,tutorial,support}.html` → de-Django'd
  (`{% load static %}` stripped, `{% static 'X' %}` → `/static/X`)
- `site/source/static/**` → `site/dist/static/`
- `front/dist/**` (after `npx expo export --platform web`) → `site/dist/app/`

Vendored from tag `pre-cloudflare-rollback` (last good `back/bots/templates`
and `back/bots/static` before the Django backend was removed) — edit the
vendored copies directly going forward.

## Routing

| Path | Serves | Source |
|---|---|---|
| `/` | Marketing page | `marketing.html` → `dist/index.html` |
| `/tutorial/` | Getting-started tutorial | `tutorial.html` → `dist/tutorial/index.html` |
| `/support/` | Support form (static + fetch) | `support.html` → `dist/support/index.html` |
| `/static/*` | Images, CSS, favicon, screenshots | `site/source/static/` |
| `/app/*` | Expo web app | `front/dist/` (baseUrl `/app`) |
| `/api/*` | **Not served by Pages** — Worker route `syftlearning.app/api/*` owns it | `worker/` |

Support form: the Django POST + SMTP view is gone. The static form keeps the
`name`/`email`/`subject`/`message` fields and POSTs JSON via `fetch` to
`/api/support` (Worker: Resend when configured, else logs), showing a
thank-you inline. No CSRF token needed (cross-site JSON API, no cookies).

`/app/*` fallback mirrors the old Django `web_app` view: per-page
`_redirects` rules (`/app/foo` → `/app/foo.html`, generated from the expo
export at build time) plus a catch-all `/app/*` → `/app/index.html`.

## Build

```sh
cd front && npx expo export --platform web --output-dir dist --clear --no-bytecode && cd .. && node site/build.mjs   # or: npm run --prefix site build
```

`--from-main` / `--local` are accepted as no-ops (legacy CI-compat flags);
sources always come from `site/source/` on disk.

## Local preview

```sh
npx wrangler pages dev site/dist
```

(`/api/*` 404s under preview — the Worker route only exists on the custom domain.)

## Deploy

CI (`.github/workflows/deploy.yml`): expo export → `node site/build.mjs` →
`wrangler pages deploy site/dist --project-name syft-site`. Provision D1+R2 +
Deploy Worker API steps are unchanged.

## Intentionally gone

Admin (`/admin/`) and schema docs (`/api/schema`, `/api/docs`) have no
equivalent on Pages/the Worker — no replacement is planned.
