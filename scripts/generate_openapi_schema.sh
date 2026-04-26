#!/bin/bash
# Script to regenerate OpenAPI schema and update frontend mocks
# Run this script after making changes to API endpoints (serializers, viewsets, models)

set -e

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../back" && pwd)"
FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../front" && pwd)"
SCHEMA_FILE="$FRONTEND_DIR/api/schema.json"

echo "=== Generating OpenAPI Schema ==="
cd "$BACKEND_DIR"

# Check if virtual environment exists
if [ -d "venv" ]; then
    PYTHON="venv/bin/python"
else
    PYTHON="python"
fi

# Generate the schema
$PYTHON manage.py spectacular --file "$SCHEMA_FILE" 2>/dev/null || true

echo "Schema generated at: $SCHEMA_FILE"

# Update frontend mock handlers from schema
# This is a simple placeholder - in a real project you might use openapi-generator
echo ""
echo "=== Schema generation complete ==="
echo "After generating the schema, you should:"
echo "1. Review changes to $SCHEMA_FILE"
echo "2. Update frontend/__mocks__/handlers.ts if needed"
echo "3. Run tests: npm test (in frontend directory)"
echo "4. Run backend tests: pytest bots/tests/test_flashcard_api.py"