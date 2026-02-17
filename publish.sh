#!/bin/sh
# Usage: sh publish.sh <slug> <file> [--skip-check]
# Runs verify.sh (Nous + novoid-browser), then publishes to Convex.
set -e

SLUG="$1"
FILE="$2"
SKIP_CHECK="$3"

if [ -z "$SLUG" ] || [ -z "$FILE" ]; then
  echo "Usage: sh publish.sh <slug> <file> [--skip-check]"
  exit 1
fi

if [ ! -f "$FILE" ]; then
  echo "Error: $FILE not found"
  exit 1
fi

# ─── Locked slugs ─────────────────────────────────────────
LOCKED_SLUGS="vox platform"
for locked in $LOCKED_SLUGS; do
  if [ "$SLUG" = "$locked" ] && [ "$SKIP_CHECK" != "--force" ]; then
    echo "Error: slug '$SLUG' is locked. Use --force to overwrite."
    exit 1
  fi
done

# ─── Pre-flight: verify (Nous + novoid-browser) ───────────
VERIFY_ID=$$
export NOVOID_VERIFY_ID="$VERIFY_ID"
NOUS_JSON="/tmp/novoid-nous-${VERIFY_ID}.json"
BROWSER_JSON="/tmp/novoid-browser-${VERIFY_ID}.json"

if [ "$SKIP_CHECK" != "--skip-check" ]; then
  sh verify.sh "$FILE" || {
    echo ""
    echo "Publish aborted. Fix issues or use --skip-check to bypass."
    rm -f "$NOUS_JSON" "$BROWSER_JSON"
    exit 1
  }
fi

# ─── Load credentials ─────────────────────────────────────
source .env.local

# ─── Build publish args with schemas ─────────────────────
HTML_JSON=$(python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" < "$FILE")

SCHEMA_ARGS=""
if [ -s "$NOUS_JSON" ]; then
  NOUS_ESC=$(python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" < "$NOUS_JSON")
  SCHEMA_ARGS="$SCHEMA_ARGS,\"nousReport\":$NOUS_ESC"
fi
if [ -s "$BROWSER_JSON" ]; then
  BROWSER_ESC=$(python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" < "$BROWSER_JSON")
  SCHEMA_ARGS="$SCHEMA_ARGS,\"browserSchema\":$BROWSER_ESC"
fi

# Clean up temp files
rm -f "$NOUS_JSON" "$BROWSER_JSON"

# ─── Publish ───────────────────────────────────────────────
npx convex run pages:publish "{\"slug\":\"$SLUG\",\"html\":$HTML_JSON,\"secret\":\"$PUBLISH_SECRET\"$SCHEMA_ARGS}"

LIVE_URL="${CONVEX_SITE_URL}/app/${SLUG}"
MCP_URL="${CONVEX_SITE_URL}/mcp/${SLUG}"

echo ""
echo "Live: ${LIVE_URL}"
echo "MCP:  ${MCP_URL}"

# ─── Post-publish E2E verification ────────────────────────
echo ""
echo "┌─ post-publish ─────────────────────────────────────────┐"
E2E_FAILED=0

# Phase 1: Live URL responds 200
LIVE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$LIVE_URL" 2>/dev/null) || LIVE_STATUS="000"
if [ "$LIVE_STATUS" = "200" ]; then
  echo "│ live    ✓ ${LIVE_URL} (200)"
else
  echo "│ live    ✗ ${LIVE_URL} (HTTP ${LIVE_STATUS})"
  E2E_FAILED=1
fi

# Phase 2: MCP schema has expected signals/tools
MCP_OUT=$(curl -s "$MCP_URL" 2>/dev/null)
if [ -n "$MCP_OUT" ]; then
  MCP_REPORT=$(echo "$MCP_OUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    t = len(d.get('tools', []))
    r = len(d.get('resources', []))
    e = len(d.get('entities', []))
    parts = []
    if t: parts.append('%d tools' % t)
    if r: parts.append('%d resources' % r)
    if e: parts.append('%d entities' % e)
    print(', '.join(parts) if parts else 'empty schema')
except:
    print('parse error')
" 2>/dev/null)
  echo "│ mcp     ✓ ${MCP_REPORT}"
else
  echo "│ mcp     - unreachable"
fi

# Phase 3: Sentinel (runtime errors from real browsers)
sleep 2
SENTINEL_OUT=$(npx convex run errors:recent "{\"slug\":\"${SLUG}\",\"limit\":5}" 2>/dev/null)
SENTINEL_COUNT=$(echo "$SENTINEL_OUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(len(d))
except:
    print(0)
" 2>/dev/null)
if [ "$SENTINEL_COUNT" = "0" ]; then
  echo "│ sentinel ✓ no runtime errors"
else
  echo "│ sentinel ✗ ${SENTINEL_COUNT} runtime errors"
  echo "$SENTINEL_OUT" | python3 -c "
import sys, json
try:
    for e in json.load(sys.stdin)[:3]:
        print('│           ' + e.get('message','')[:80])
except: pass
" 2>/dev/null
  E2E_FAILED=1
fi

echo "├───────────────────────────────────────────────────────┤"
if [ $E2E_FAILED -eq 0 ]; then
  echo "│ ✓ e2e passed"
else
  echo "│ ✗ e2e issues — check above"
fi
echo "└───────────────────────────────────────────────────────┘"
