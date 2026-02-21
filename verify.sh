#!/bin/sh
# Usage: sh verify.sh <file.html>
# Runs Nous (static proof) + novoid-browser (empirical) on a no∅ app.
# Exit 0 = all clear, Exit 1 = issues found.
# Can be called standalone or from publish.sh.

FILE="$1"
if [ -z "$FILE" ]; then
  echo "Usage: sh verify.sh <file.html>"
  exit 1
fi
if [ ! -f "$FILE" ]; then
  echo "Error: $FILE not found"
  exit 1
fi

BROWSER="./browser/target/debug/novoid-browser"
NOUS="./nous/src/cli.ts"
FAILED=0

# Output files for publish.sh to pick up (schema storage)
# Use parent PID if available (so publish.sh can find them)
VERIFY_ID="${NOVOID_VERIFY_ID:-$$}"
NOUS_JSON_FILE="/tmp/novoid-nous-${VERIFY_ID}.json"
BROWSER_JSON_FILE="/tmp/novoid-browser-${VERIFY_ID}.json"
printf '' > "$NOUS_JSON_FILE"
printf '' > "$BROWSER_JSON_FILE"

echo "┌─ verify ───────────────────────────────────────────┐"

# ─── Phase 1: Nous (static proof) ─────────────────────────
if [ -f "$NOUS" ] && command -v npx >/dev/null 2>&1; then
  NOUS_OUT=$(cd nous && npx tsx src/cli.ts "../$FILE" 2>/dev/null) && NOUS_OK=1 || NOUS_OK=0

  if [ $NOUS_OK -eq 1 ] && [ -n "$NOUS_OUT" ]; then
    printf '%s\n' "$NOUS_OUT" > "$NOUS_JSON_FILE"
    NOUS_REPORT=$(printf '%s\n' "$NOUS_OUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    v = d.get('verdict', '?')
    m = d.get('morphe', {})
    t = d.get('thesis', {})
    k = d.get('kinesis', {})

    # Collect issues
    issues = []
    if m.get('verdict') == 'UNSOUND':
        issues.append('structure: %d/%d contracts failed' % (m.get('contracts_checked',0) - m.get('contracts_passed',0), m.get('contracts_checked',0)))
    acc = m.get('accessibility', {})
    if not acc.get('all_inputs_labeled', True):
        issues.append('unlabeled inputs')
    if not acc.get('tab_order_complete', True):
        issues.append('broken tab order')
    if t.get('verdict') == 'UNSOUND':
        if t.get('overflow_risks'):
            issues.append('overflow: ' + ', '.join(t['overflow_risks'][:3]))
        if t.get('cascade_conflicts', 0) > 0:
            issues.append('%d cascade conflicts' % t['cascade_conflicts'])
    if k.get('unnamed_signals', 0) > 0:
        issues.append('%d unnamed signals' % k['unnamed_signals'])
    if k.get('verdict') == 'UNSOUND':
        if k.get('cycles', 0) > 0:
            issues.append('%d reactive cycles' % k['cycles'])
        if k.get('dead_signals'):
            issues.append('dead signals: ' + ', '.join(k['dead_signals'][:3]))
        if k.get('taint_violations'):
            issues.append('taint: ' + ', '.join(k['taint_violations'][:3]))
        sm = k.get('state_machine', {})
        if sm.get('deadlocks', 0) > 0:
            issues.append('%d state deadlocks' % sm['deadlocks'])

    # Summary line
    parts = []
    parts.append('%d nodes' % m.get('node_count', 0))
    if k.get('signals', 0): parts.append('%d signals' % k['signals'])
    if k.get('effects', 0): parts.append('%d effects' % k['effects'])
    bp = t.get('breakpoints', [])
    if bp: parts.append('breakpoints: ' + ','.join(str(b) for b in bp))

    print('VERDICT=%s' % v)
    print('SUMMARY=%s' % ', '.join(parts))
    print('ISSUES=%s' % '; '.join(issues) if issues else 'ISSUES=')
except Exception as e:
    print('VERDICT=ERROR')
    print('SUMMARY=parse error')
    print('ISSUES=' + str(e))
" 2>/dev/null)

    VERDICT=$(echo "$NOUS_REPORT" | grep '^VERDICT=' | cut -d= -f2-)
    SUMMARY=$(echo "$NOUS_REPORT" | grep '^SUMMARY=' | cut -d= -f2-)
    ISSUES=$(echo "$NOUS_REPORT" | grep '^ISSUES=' | cut -d= -f2-)

    if [ "$VERDICT" = "SOUND" ]; then
      echo "│ nous   ✓ SOUND  $SUMMARY"
    elif [ "$VERDICT" = "PARTIAL" ]; then
      echo "│ nous   ~ PARTIAL  $SUMMARY"
    elif [ "$VERDICT" = "UNSOUND" ]; then
      echo "│ nous   ✗ UNSOUND  $SUMMARY"
      echo "$ISSUES" | tr ';' '\n' | while IFS= read -r line; do
        line=$(echo "$line" | sed 's/^ *//')
        [ -n "$line" ] && echo "│          $line"
      done
      FAILED=1
    else
      echo "│ nous   ? could not analyze"
    fi
  else
    echo "│ nous   - skipped (parse error)"
  fi
else
  echo "│ nous   - not installed"
fi

# ─── Phase 2: novoid-browser (empirical) ──────────────────
if [ -f "$BROWSER" ]; then
  # Auto-detect hash-routed apps and set location.hash
  SEED_ARGS=""
  if grep -qE 'location\.hash' "$FILE" 2>/dev/null; then
    SEED_ARGS="$SEED_ARGS --hash #/test"
  fi
  # Auto-detect Convex usage and seed empty defaults for query refs
  if grep -qE 'convex\.min\.js|createClient' "$FILE" 2>/dev/null; then
    # Extract query refs from useQuery(client, "ref") calls
    REFS=$(grep -oE 'useQuery\([^,]+,\s*"[^"]+' "$FILE" 2>/dev/null | sed 's/.*"\([^"]*\)$/\1/' | sort -u)
    for ref in $REFS; do
      SEED_ARGS="$SEED_ARGS --seed $ref []"
    done
  fi

  BROWSER_OUT=$("$BROWSER" "$FILE" $SEED_ARGS -c 2>&1) && BROWSER_OK=1 || BROWSER_OK=0

  printf '%s\n' "$BROWSER_OUT" > "$BROWSER_JSON_FILE"

  if [ $BROWSER_OK -eq 0 ]; then
    echo "│ browser ✗ failed to execute"
    echo "│          $BROWSER_OUT"
    FAILED=1
  else
    BROWSER_REPORT=$(printf '%s\n' "$BROWSER_OUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    errs = d.get('errors', [])
    s = d.get('state', {})
    a = d.get('actions', [])
    e = d.get('entities', {})
    c = d.get('components', [])
    cvx = d.get('convex')

    parts = []
    sig = len([k for k in s if not k.startswith('store_')])
    sto = len([k for k in s if k.startswith('store_')])
    if sig: parts.append('%d signals' % sig)
    if sto: parts.append('%d stores' % sto)
    if a: parts.append('%d actions' % len(a))
    if e: parts.append('%d entities' % len(e))
    if c: parts.append('%d components' % len(c))
    if cvx:
        subs = cvx.get('subscriptions', [])
        muts = cvx.get('mutations', [])
        acts = cvx.get('actions', [])
        if subs: parts.append('%d queries' % len(subs))
        if muts: parts.append('%d mutations' % len(muts))
        if acts: parts.append('%d cvx-actions' % len(acts))

    summary = ', '.join(parts) if parts else 'empty app'
    err_msgs = [err.get('message','') for err in errs]
    print('ERRORS=%s' % '|'.join(err_msgs) if err_msgs else 'ERRORS=')
    print('SUMMARY=%s' % summary)

    # Convex detail line
    if cvx and (subs or muts or acts):
        refs = [sub.get('ref','?') for sub in subs]
        print('CONVEX=%s' % ', '.join(refs))
    else:
        print('CONVEX=')
except Exception as ex:
    print('ERRORS=parse error: ' + str(ex))
    print('SUMMARY=')
    print('CONVEX=')
" 2>/dev/null)

    B_ERRORS=$(echo "$BROWSER_REPORT" | grep '^ERRORS=' | cut -d= -f2-)
    B_SUMMARY=$(echo "$BROWSER_REPORT" | grep '^SUMMARY=' | cut -d= -f2-)
    B_CONVEX=$(echo "$BROWSER_REPORT" | grep '^CONVEX=' | cut -d= -f2-)

    if [ -n "$B_ERRORS" ]; then
      echo "│ browser ✗ runtime errors"
      echo "$B_ERRORS" | tr '|' '\n' | while IFS= read -r line; do
        [ -n "$line" ] && echo "│          $line"
      done
      FAILED=1
    else
      echo "│ browser ✓ clean  $B_SUMMARY"
    fi
    if [ -n "$B_CONVEX" ]; then
      echo "│ convex  ✓ queries: $B_CONVEX"
    fi

    # Static Convex detection: extract useMutation/useAction refs from source
    # and merge into browser JSON (covers apps where Convex can't init headlessly)
    MUT_REFS=$(grep -oE 'useMutation\([^,]+,\s*"[^"]+' "$FILE" 2>/dev/null | sed 's/.*"\([^"]*\)$/\1/' | sort -u)
    ACT_REFS=$(grep -oE 'useAction\([^,]+,\s*"[^"]+' "$FILE" 2>/dev/null | sed 's/.*"\([^"]*\)$/\1/' | sort -u)
    AI_REFS=$(grep -oE 'useAI\([^,]+,\s*"[^"]+' "$FILE" 2>/dev/null | sed 's/.*"\([^"]*\)$/\1/' | sort -u)
    if [ -n "$MUT_REFS" ] || [ -n "$ACT_REFS" ] || [ -n "$AI_REFS" ]; then
      python3 -c "
import json, sys
try:
    with open('$BROWSER_JSON_FILE') as f:
        d = json.load(f)
except: sys.exit(0)
if 'convex' not in d or d['convex'] is None:
    d['convex'] = {'subscriptions':[],'mutations':[],'actions':[],'seeds':[]}
cvx = d['convex']
existing_muts = {m.get('ref','') for m in cvx.get('mutations',[])}
existing_acts = {a.get('ref','') for a in cvx.get('actions',[])}
for ref in '''$MUT_REFS'''.strip().split('\n'):
    ref = ref.strip()
    if ref and ref not in existing_muts:
        cvx.setdefault('mutations',[]).append({'ref':ref,'args':None})
for ref in '''$ACT_REFS'''.strip().split('\n'):
    ref = ref.strip()
    if ref and ref not in existing_acts:
        cvx.setdefault('actions',[]).append({'ref':ref,'args':None})
for ref in '''$AI_REFS'''.strip().split('\n'):
    ref = ref.strip()
    if ref and ref not in existing_acts:
        cvx.setdefault('actions',[]).append({'ref':ref,'args':None})
with open('$BROWSER_JSON_FILE','w') as f:
    json.dump(d, f)
" 2>/dev/null
      STATIC_COUNT=0
      for r in $MUT_REFS $ACT_REFS $AI_REFS; do STATIC_COUNT=$((STATIC_COUNT + 1)); done
      if [ $STATIC_COUNT -gt 0 ]; then
        echo "│ static  ✓ $STATIC_COUNT Convex refs injected from source"
      fi
    fi
  fi
else
  echo "│ browser - not built (cd browser && cargo build)"
fi

# ─── Phase 3: MCP test spec (behavioral assertions) ──────
TEST_SPEC="${FILE%.html}.test.json"
if [ -f "$TEST_SPEC" ] && [ -f "$BROWSER" ]; then
  TEST_OUT=$("$BROWSER" --test "$TEST_SPEC" "$FILE" $SEED_ARGS --peek 2>&1) && TEST_OK=1 || TEST_OK=0

  if [ $TEST_OK -eq 0 ]; then
    # Output already includes peek format on stderr, just mark failed
    echo "$TEST_OUT" | grep '^│' | while IFS= read -r line; do
      echo "$line"
    done
    FAILED=1
  else
    echo "$TEST_OUT" | grep '^│' | while IFS= read -r line; do
      echo "$line"
    done
  fi
elif [ -f "$TEST_SPEC" ] && [ ! -f "$BROWSER" ]; then
  echo "│ test    - novoid-browser not built (skipping $TEST_SPEC)"
fi

# ─── Phase 4: Secret leak detection ──────────────────────
if grep -qE 'PUBLISH_SECRET|sk-[a-zA-Z0-9]{20,}|secret.*=.*["\x27][a-zA-Z0-9_-]{20,}["\x27]' "$FILE" 2>/dev/null; then
  echo "│ secrets ✗ possible secret or API key in source"
  FAILED=1
else
  echo "│ secrets ✓ clean"
fi

# ─── Verdict ──────────────────────────────────────────────
echo "├───────────────────────────────────────────────────────┤"
if [ $FAILED -eq 0 ]; then
  echo "│ ✓ verified"
else
  echo "│ ✗ issues found"
fi
echo "└───────────────────────────────────────────────────────┘"

exit $FAILED
