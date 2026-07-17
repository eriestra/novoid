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

. scripts/lib.sh

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

# 1. Set the publish secret (stored as SHA-256 hash)
echo "1/7 Setting PUBLISH_SECRET (hashed)..."
npx convex run seed:seedSecret "{\"name\":\"PUBLISH_SECRET\",\"value\":\"$SECRET\"}"

# 2. Core CSS
echo "2/7 Uploading core.min.css..."
CORE_CSS=$(json_file dist/core.min.css)
npx convex run seed:seedAsset "{\"name\":\"core.min.css\",\"content\":$CORE_CSS,\"contentType\":\"text/css\"}"

# 3. Components CSS
echo "3/7 Uploading components.min.css..."
COMP_CSS=$(json_file dist/components.min.css)
npx convex run seed:seedAsset "{\"name\":\"components.min.css\",\"content\":$COMP_CSS,\"contentType\":\"text/css\"}"

# 4. JS (core + plugins)
echo "4/7 Uploading JS assets..."
for plugin in core router convex auth toast render; do
  FILE="dist/${plugin}.min.js"
  if [ -f "$FILE" ]; then
    echo "  → ${plugin}.min.js"
    PLUGIN_JSON=$(json_file "$FILE")
    npx convex run seed:seedAsset "{\"name\":\"${plugin}.min.js\",\"content\":$PLUGIN_JSON,\"contentType\":\"application/javascript\"}"
  fi
done

# 4b. Minimal tier assets (nv-core.js + nv-min.css) — zero-build single-file apps.
# Served at /js/nv-core.js and /css/nv-min.css by the existing asset routes.
echo "4b/7 Uploading minimal-tier assets..."
if [ -f minimal/nv-core.js ]; then
  echo "  → nv-core.js"
  NVCORE=$(json_file minimal/nv-core.js)
  npx convex run seed:seedAsset "{\"name\":\"nv-core.js\",\"content\":$NVCORE,\"contentType\":\"application/javascript\"}"
fi
if [ -f minimal/nv-min.css ]; then
  echo "  → nv-min.css"
  NVCSS=$(json_file minimal/nv-min.css)
  npx convex run seed:seedAsset "{\"name\":\"nv-min.css\",\"content\":$NVCSS,\"contentType\":\"text/css\"}"
fi

# 5. Browse polyfills (concatenated from test-runner/shims/)
echo "5/5 Uploading browse-polyfills.js..."
cat test-runner/shims/convex-mock.js test-runner/shims/observer.js > /tmp/browse-polyfills.js
BROWSE_JS=$(json_file /tmp/browse-polyfills.js)
npx convex run seed:seedAsset "{\"name\":\"browse-polyfills.js\",\"content\":$BROWSE_JS,\"contentType\":\"application/javascript\"}"
rm -f /tmp/browse-polyfills.js

# 6. Concatenate + seed skills documentation
echo "6/7 Uploading skills.md..."
SKILLS_TMP=$(mktemp)
for f in skills/*.md; do
  echo "" >> "$SKILLS_TMP"
  cat "$f" >> "$SKILLS_TMP"
  echo "" >> "$SKILLS_TMP"
done
for f in skills/certified/*.md; do
  echo "" >> "$SKILLS_TMP"
  cat "$f" >> "$SKILLS_TMP"
  echo "" >> "$SKILLS_TMP"
done
SKILLS_JSON=$(json_file "$SKILLS_TMP")
npx convex run seed:seedAsset "{\"name\":\"skills.md\",\"content\":$SKILLS_JSON,\"contentType\":\"text/markdown\"}"
rm -f "$SKILLS_TMP"

# 7. Ecosystem apps (nex, vox, novoid) — deploy if missing
echo "7/7 Deploying ecosystem apps (if missing)..."
for eco_slug in novoid nex vox bloox; do
  EXISTS=$(npx convex run pages:get "{\"slug\":\"$eco_slug\"}" 2>/dev/null)
  if [ "$EXISTS" = "null" ] || [ -z "$EXISTS" ]; then
    FILE="src/app/${eco_slug}.html"
    if [ -f "$FILE" ]; then
      echo "  → publishing $eco_slug..."
      sh publish.sh "$eco_slug" "$FILE" --force
    else
      echo "  ⚠ $FILE not found — skipping $eco_slug"
    fi
  else
    echo "  ✓ $eco_slug already deployed"
  fi
done

echo ""
echo "Done! Your platform is live:"
echo ""
echo "  Landing:   $SITE_URL/app/novoid"
echo "  Nex:       $SITE_URL/app/nex"
echo "  Vox:       $SITE_URL/app/vox"
echo "  Bloox:     $SITE_URL/app/bloox"
echo "  Platform:  $SITE_URL/platform"
echo "  Pages:     $SITE_URL/app/<slug>"
echo "  CSS:       $SITE_URL/css/core.min.css"
echo "  JS:        $SITE_URL/js/core.min.js"
