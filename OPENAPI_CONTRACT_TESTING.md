# OpenAPI Contract Testing

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

### Backend Tests
```bash
cd back
venv/bin/python -m pytest bots/tests/test_flashcard_api.py -v
```

### Frontend Tests
```bash
cd front
npm test -- --testPathPattern="__tests__/api/" --ci
```

## Schema Regeneration

After making changes to serializers, viewsets, or models that affect the API:

```bash
./scripts/generate_openapi_schema.sh
```

Then:
1. Review `front/api/schema.yaml` for changes
2. Update `front/__mocks__/handlers.ts` if needed
3. Run tests to verify nothing broke

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

The OpenAPI schema is available at:
- `/api/schema` - JSON schema
- `/api/docs` - Swagger UI

## Adding New API Endpoints

When adding new endpoints:
1. Add serializer and viewset as usual
2. Run `scripts/generate_openapi_schema.sh`
3. Add mock handlers in `front/__mocks__/handlers.ts`
4. Add tests in appropriate test file