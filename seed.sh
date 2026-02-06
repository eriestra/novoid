#!/bin/sh
# ─────────────────────────────────────────────
# no∅ seed — one-time setup
# Pushes framework assets + platform UI into Convex
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

# 1. Set the publish secret
echo "1/4 Setting PUBLISH_SECRET..."
npx convex run seed:seedSecret "{\"name\":\"PUBLISH_SECRET\",\"value\":\"$SECRET\"}"

# 2. Upload CSS
echo "2/4 Uploading novoid.min.css..."
CSS_JSON=$(json_file dist/novoid.min.css)
npx convex run seed:seedAsset "{\"name\":\"novoid.min.css\",\"content\":$CSS_JSON,\"contentType\":\"text/css\"}"

# 3. Upload JS
echo "3/4 Uploading novoid.min.js..."
JS_JSON=$(json_file dist/novoid.min.js)
npx convex run seed:seedAsset "{\"name\":\"novoid.min.js\",\"content\":$JS_JSON,\"contentType\":\"application/javascript\"}"

# 4. Upload platform page (inject real Convex URL)
echo "4/4 Uploading platform page..."
PLATFORM_JSON=$(sed "s|__CONVEX_URL__|$CONVEX_URL|g" src/app/platform.html | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
npx convex run seed:seedPage "{\"slug\":\"platform\",\"html\":$PLATFORM_JSON}"

echo ""
echo "Done! Your platform is live:"
echo ""
echo "  Platform:  $SITE_URL/platform"
echo "  Pages:     $SITE_URL/app/<slug>"
echo "  CSS:       $SITE_URL/css/novoid.min.css"
echo "  JS:        $SITE_URL/js/novoid.min.js"
