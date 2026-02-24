#!/bin/sh
# Shared utilities for no∅ shell scripts

# JSON-encode a file's contents (stdin → JSON string)
json_file() { python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" < "$1"; }

# Load credentials from .env.local
load_env() {
  if [ ! -f .env.local ]; then
    echo "Error: .env.local not found. Run setup first (see README.md)." >&2
    return 1
  fi
  . .env.local
  if [ -z "$PUBLISH_SECRET" ]; then
    echo "Error: PUBLISH_SECRET not set in .env.local" >&2
    return 1
  fi
  if [ -z "$CONVEX_URL" ]; then
    echo "Error: CONVEX_URL not set in .env.local" >&2
    return 1
  fi
  CONVEX_SITE_URL=$(echo "$CONVEX_URL" | sed 's/.convex.cloud/.convex.site/')
  export PUBLISH_SECRET CONVEX_URL CONVEX_SITE_URL
}

# Validate a slug (lowercase alphanumeric + hyphens)
valid_slug() {
  case "$1" in
    [a-z0-9]*) echo "$1" | grep -qE '^[a-z0-9][a-z0-9-]*$' ;;
    *) return 1 ;;
  esac
}
