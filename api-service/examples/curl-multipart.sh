#!/usr/bin/env bash
# Convert a markdown file to PDF using the multipart endpoint with a custom
# template and a remote font URL.
#
# Usage:
#   ./examples/curl-multipart.sh
#   API_BASE=https://my-api ./examples/curl-multipart.sh

set -euo pipefail
API_BASE="${API_BASE:-http://localhost:4000}"
TEMPLATE_PATH="${TEMPLATE_PATH:-../public/preloaded/Default Templates/Modern.mdt}"

curl -fsSL -X POST "${API_BASE}/v1/convert/multipart" \
  -F "markdown=@$(dirname "$0")/sample.md" \
  -F "template=@${TEMPLATE_PATH}" \
  -F "title=Quarterly Report" \
  -F 'variables={"author":"Jane Doe","project":"Modern Markdown Editor"}' \
  -F 'fonts=[{"family":"Inter","url":"https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.ttf"}]' \
  --output report.pdf

echo "Wrote ./report.pdf"
