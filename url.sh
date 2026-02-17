#!/bin/sh
# Usage: sh url.sh <slug>
# Prints the live and MCP URLs for a published page.
set -e

SLUG="$1"
if [ -z "$SLUG" ]; then
  echo "Usage: sh url.sh <slug>"
  exit 1
fi

source .env.local

echo "Live: ${CONVEX_SITE_URL}/app/${SLUG}"
echo "MCP:  ${CONVEX_SITE_URL}/mcp/${SLUG}"
