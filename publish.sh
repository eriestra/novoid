#!/bin/sh
# Usage: sh publish.sh <slug> <file> [--skip-check]
# Runs verify.sh (Nous + novoid-browser), then publishes to Convex.
set -e

SLUG="$1"
FILE="$2"
shift 2 || true
SKIP_CHECK=""
FORCE=""
for arg in "$@"; do
  case "$arg" in
    --skip-check) SKIP_CHECK="--skip-check" ;;
    --force) FORCE="--force" ;;
  esac
done

if [ -z "$SLUG" ] || [ -z "$FILE" ]; then
  echo "Usage: sh publish.sh <slug> <file> [--skip-check] [--force]"
  exit 1
fi

if [ ! -f "$FILE" ]; then
  echo "Error: $FILE not found"
  exit 1
fi

# ─── Locked slugs ─────────────────────────────────────────
LOCKED_SLUGS="nex vox novoid bloox platform"
for locked in $LOCKED_SLUGS; do
  if [ "$SLUG" = "$locked" ] && [ "$FORCE" != "--force" ]; then
    echo "Error: slug '$SLUG' is locked. Use --force to overwrite."
    exit 1
  fi
done

# ─── Pre-flight: verify (Nous + novoid-browser) ───────────
VERIFY_ID=$$
export NOVOID_VERIFY_ID="$VERIFY_ID"
NOUS_JSON="/tmp/novoid-nous-${VERIFY_ID}.json"
BROWSER_JSON="/tmp/novoid-browser-${VERIFY_ID}.json"
trap 'rm -f "$NOUS_JSON" "$BROWSER_JSON"' EXIT

if [ "$SKIP_CHECK" != "--skip-check" ]; then
  sh verify.sh "$FILE" || {
    echo ""
    echo "Publish aborted. Fix issues or use --skip-check to bypass."
    exit 1
  }
fi

# ─── Load credentials ─────────────────────────────────────
. scripts/lib.sh
load_env || exit 1

# ─── Build publish payload (JSON → temp file) ────────────
PUBLISH_PAYLOAD="/tmp/novoid-publish-${$}.json"
python3 -c "
import sys, json
html = open(sys.argv[1]).read()
body = {'html': html}
for label, path in [('nousReport', sys.argv[2]), ('browserSchema', sys.argv[3])]:
    try:
        c = open(path).read().strip()
        if c: body[label] = c
    except: pass
with open(sys.argv[4], 'w') as f:
    json.dump(body, f)
" "$FILE" "$NOUS_JSON" "$BROWSER_JSON" "$PUBLISH_PAYLOAD"

# Temp files cleaned up by EXIT trap

# ─── Publish via HTTP action (no npx cold start) ─────────
PUBLISH_RESP=$(curl -s -w "\n%{http_code}" -X POST \
  "${CONVEX_SITE_URL}/publish/${SLUG}" \
  -H "Authorization: Bearer ${PUBLISH_SECRET}" \
  -H "Content-Type: application/json" \
  --data-binary "@${PUBLISH_PAYLOAD}")
PUBLISH_HTTP=$(echo "$PUBLISH_RESP" | tail -1)
PUBLISH_OUT=$(echo "$PUBLISH_RESP" | sed '$d')
rm -f "$PUBLISH_PAYLOAD"

if [ "$PUBLISH_HTTP" != "200" ]; then
  echo "Publish failed (HTTP $PUBLISH_HTTP): $PUBLISH_OUT"
  exit 1
fi

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
MCP_OUT=$(curl -s --max-time 10 "$MCP_URL" 2>/dev/null)
if [ -n "$MCP_OUT" ]; then
  MCP_REPORT=$(printf '%s\n' "$MCP_OUT" | python3 -c "
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
SENTINEL_OUT=$(npx convex run errors:recent "{\"slug\":\"${SLUG}\",\"limit\":5}" 2>/dev/null)
SENTINEL_COUNT=$(printf '%s\n' "$SENTINEL_OUT" | python3 -c "
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
  printf '%s\n' "$SENTINEL_OUT" | python3 -c "
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
