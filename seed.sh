#!/bin/sh
# ─────────────────────────────────────────────
# no∅ seed — one-time setup
# Pushes framework assets into Convex
#
# Usage:
#   sh seed.sh <CONVEX_URL> <PUBLISH_SECRET>
#
# Prerequisite: npx convex dev running in another terminal
# ─────────────────────────────────────────────
set -e

CONVEX_URL="$1"
SECRET="$2"

if [ -z "$CONVEX_URL" ] || [ -z "$SECRET" ]; then
  echo "Usage: sh seed.sh <CONVEX_URL> <PUBLISH_SECRET>"
  echo ""
  echo "  1. npx convex dev            (in another terminal)"
  echo "  2. sh seed.sh https://your-deployment.convex.cloud my-secret"
  exit 1
fi

SITE_URL=$(echo "$CONVEX_URL" | sed 's/.convex.cloud/.convex.site/')

echo "Seeding $CONVEX_URL → $SITE_URL"
echo ""

# Helper: json-encode a file's contents (uses python3 which ships with macOS/Linux)
json_file() { python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" < "$1"; }

# 1. Set the publish secret (stored as SHA-256 hash)
echo "1/4 Setting PUBLISH_SECRET (hashed)..."
npx convex run seed:seedSecret "{\"name\":\"PUBLISH_SECRET\",\"value\":\"$SECRET\"}"

# 2. Core CSS
echo "2/4 Uploading core.min.css..."
CORE_CSS=$(json_file dist/core.min.css)
npx convex run seed:seedAsset "{\"name\":\"core.min.css\",\"content\":$CORE_CSS,\"contentType\":\"text/css\"}"

# 3. Components CSS
echo "3/4 Uploading components.min.css..."
COMP_CSS=$(json_file dist/components.min.css)
npx convex run seed:seedAsset "{\"name\":\"components.min.css\",\"content\":$COMP_CSS,\"contentType\":\"text/css\"}"

# 4. JS (core + plugins)
echo "4/5 Uploading JS assets..."
for plugin in core router convex auth toast render; do
  FILE="dist/${plugin}.min.js"
  if [ -f "$FILE" ]; then
    echo "  → ${plugin}.min.js"
    PLUGIN_JSON=$(json_file "$FILE")
    npx convex run seed:seedAsset "{\"name\":\"${plugin}.min.js\",\"content\":$PLUGIN_JSON,\"contentType\":\"application/javascript\"}"
  fi
done

# 5. Browse polyfills (concatenated from browser/js/)
echo "5/5 Uploading browse-polyfills.js..."
cat browser/js/convex-mock.js browser/js/observer.js > /tmp/browse-polyfills.js
BROWSE_JS=$(json_file /tmp/browse-polyfills.js)
npx convex run seed:seedAsset "{\"name\":\"browse-polyfills.js\",\"content\":$BROWSE_JS,\"contentType\":\"application/javascript\"}"
rm -f /tmp/browse-polyfills.js

echo ""
echo "Done! Your platform is live:"
echo ""
echo "  Platform:  $SITE_URL/platform"
echo "  Pages:     $SITE_URL/app/<slug>"
echo "  CSS:       $SITE_URL/css/core.min.css"
echo "  JS:        $SITE_URL/js/core.min.js"
