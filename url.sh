#!/bin/sh
# Usage: sh url.sh <slug>
# Prints the live and MCP URLs for a published page.
set -e

. scripts/lib.sh

SLUG="$1"
if [ -z "$SLUG" ]; then
  echo "Usage: sh url.sh <slug>"
  exit 1
fi

if ! valid_slug "$SLUG"; then
  echo "Error: invalid slug '$SLUG' (lowercase alphanumeric + hyphens only)"
  exit 1
fi

load_env || exit 1

echo "Live: ${CONVEX_SITE_URL}/app/${SLUG}"
echo "MCP:  ${CONVEX_SITE_URL}/mcp/${SLUG}"
