#!/usr/bin/env bash
# Convert a markdown document to PDF via the JSON endpoint.
#
# Usage:
#   ./examples/curl-json.sh                 # uses default localhost:4000
#   API_BASE=https://my-api ./curl-json.sh

set -euo pipefail
API_BASE="${API_BASE:-http://localhost:4000}"

curl -fsSL -X POST "${API_BASE}/v1/convert" \
  -H "Content-Type: application/json" \
  -d '{
        "markdown": "# Hello {{var:name}}\n\nThis was generated via the API.\n\n- one\n- two\n- three",
        "title":    "My API report",
        "variables": { "name": "World" }
      }' \
  --output report.pdf

echo "Wrote ./report.pdf"
