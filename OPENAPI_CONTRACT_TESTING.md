# OpenAPI Contract Testing

> **Status:** the Django backend (`back/`) was removed in favor of `worker/`
> (Cloudflare Workers + D1). The API contract below is preserved verbatim —
> `front/api/schema.yaml` is now a frozen reference and the executable
> contract is `worker/tests/api.test.ts`. Django-only commands in this doc
> (`manage.py spectacular`, `pytest`, `scripts/generate_openapi_schema.sh`)
> no longer apply.

This document describes the OpenAPI-based contract testing setup to catch frontend/backend API mismatches early.

## Overview

The system uses OpenAPI schema generated from Django REST Framework to:
1. **Backend**: Validate API responses match expected contract
2. **Frontend**: Provide realistic mock responses for testing

## Files Created

### Backend
- `back/requirements.txt` - Added `drf-spectacular`
- `back/server/settings.py` - Configured OpenAPI schema generation
- `back/server/urls.py` - Added `/api/schema` endpoint
- `back/bots/tests/test_flashcard_api.py` - API contract tests (12 tests)

### Frontend
- `front/api/schema.yaml` - OpenAPI schema file
- `front/__mocks__/handlers.ts` - MSW handlers for API mocking
- `front/__tests__/api/flashcards.test.ts` - Frontend API tests (11 tests)

### Scripts
- `scripts/generate_openapi_schema.sh` - Regenerate schema after API changes
- `.git/hooks/pre-commit` - Pre-commit hook to run tests

## Running Tests

### Worker tests (the executable contract)

```bash
cd worker
npm test            # vitest: unit + end-to-end HTTP (see tests/api.test.ts)
npm run typecheck
```

### Frontend Tests
```bash
cd front
npm test -- --testPathPattern="__tests__/api/" --ci
```

## Schema Regeneration

`front/api/schema.yaml` is now a **frozen reference**: the Django generator
(`manage.py spectacular`, `scripts/generate_openapi_schema.sh`) is gone with
`back/`. When an endpoint changes:

1. Update the Worker route + serializer in `worker/src/`.
2. Extend `worker/tests/api.test.ts` to assert the new shape (this is the
   contract test now — it fails on drift).
3. Hand-edit `front/api/schema.yaml` only if frontend mocks depend on it.
4. Update `front/__mocks__/handlers.ts` if needed.
5. Run tests to verify nothing broke (`npm test` in `worker/`, frontend
   suite in `front/`).

## Pre-commit Hook

To enable the pre-commit hook that runs API tests:

```bash
cp .git/hooks/pre-commit .git/hooks/pre-commit.sample
chmod +x .git/hooks/pre-commit
```

## What These Tests Catch

The test suite specifically checks for the issues that occurred in commit 94d2cf5:

1. **Pagination Format**: Backend returns `{ results: [], count }` - frontend must handle this
2. **Field Names**: `card_count` vs other field names
3. **Required Fields**: `profile`, `chat` on deck creation
4. **UUID Lookup**: Support for lookup by `deck_id` and `flashcard_id` (UUID)

## API Schema Endpoint

The Django-hosted schema endpoints are gone with `back/`:
- ~~`/api/schema` - JSON schema~~
- ~~`/api/docs` - Swagger UI~~

`front/api/schema.yaml` remains in the repo as the frozen shape reference;
`worker/tests/api.test.ts` is the executable contract.

## Adding New API Endpoints

When adding new endpoints:
1. Add the Hono route + serializer shape in `worker/src/` as usual
2. Add coverage in `worker/tests/api.test.ts`
3. Add mock handlers in `front/__mocks__/handlers.ts`
4. Add tests in appropriate test file