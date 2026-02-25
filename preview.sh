#!/bin/sh
# Usage: sh preview.sh <slug> [--port 3000]
# Serves the app locally for instant preview. No publish, no Convex.
set -e

SLUG="$1"
PORT="${3:-3000}"

if [ -z "$SLUG" ]; then
  echo "Usage: sh preview.sh <slug> [--port PORT]"
  exit 1
fi

FILE="src/app/${SLUG}.html"
if [ ! -f "$FILE" ]; then
  echo "Error: $FILE not found"
  exit 1
fi

# Parse flags
OPEN=""
for arg in "$@"; do
  case "$prev" in
    --port) PORT="$arg" ;;
  esac
  case "$arg" in
    --open) OPEN=1 ;;
  esac
  prev="$arg"
done

# Ensure dist/ exists
if [ ! -d "dist" ]; then
  echo "Building assets first..."
  sh build.sh
fi

echo ""
echo "  ⚡ Preview: http://localhost:${PORT}/app/${SLUG}.html"
echo "  Press Ctrl+C to stop"
echo ""

# Open browser if requested
if [ "$OPEN" = "1" ]; then
  (sleep 0.3 && open "http://localhost:${PORT}/app/${SLUG}.html") &
fi

# Serve from src/ — ../css/ and ../js/ resolve to src/css/ and src/js/ (symlinked to dist/)
cd src
python3 -m http.server "$PORT" -b 127.0.0.1 2>/dev/null
