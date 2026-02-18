# novoid-verification

Codified knowledge for the no∅ verification pipeline. This file replaces reading verify.sh source and novoid-browser docs.

## Pipeline Overview

`verify.sh` runs two layers sequentially. `publish.sh` adds a third (post-publish E2E).

```
Phase 1: Nous (static)        → SOUND or UNSOUND
Phase 2: novoid-browser (runtime) → clean or errors
Phase 3: MCP test specs (on publish) → pass or fail
```

---

## Nous Static Analysis

Three pillars, each a formal verification layer:

### Morphe (Structure)
- Tree automata over DOM — validates element nesting, required children
- Accessibility: unlabeled inputs, missing ARIA attributes, empty buttons
- Component composition rules

### Thesis (Presentation)
- CSS cascade conflict detection via specificity lattice
- Constraint solving for layout overflow
- Breakpoint analysis — ensures responsive rules don't conflict

### Kinesis (Behavior)
- Reactive DAG analysis: cycle detection, dead signals (created but never read), unnamed signals
- State machine model checking: deadlock detection
- Taint analysis: user input flows to dangerous sinks (innerHTML, eval patterns)

### Verdicts
- **SOUND** — no issues found. Safe to publish.
- **UNSOUND** — problems found. Fix flagged issues before publishing.

---

## novoid-browser

Headless execution engine: Rust + QuickJS + minimal DOM polyfill. Executes apps without a real browser.

### Commands

```sh
# Introspect after execution
novoid-browser src/app/counter.html --peek

# Call a store action
novoid-browser src/app/counter.html --call inc

# Assert state
novoid-browser src/app/counter.html --assert 'store_0.count === 0'

# Call + assert
novoid-browser src/app/counter.html --call addTask '"Buy milk"' --assert 'store_0.tasks.length > 0'

# Seed Convex query data (for apps that depend on backend)
novoid-browser src/app/dashboard.html --seed 'tasks:list' '[{"id":"1","text":"Test"}]' --peek

# Simulate live Convex update after init
novoid-browser src/app/dashboard.html --push 'tasks:list' '[{"id":"2","text":"New"}]'

# Run MCP test spec
novoid-browser --test counter.test.json src/app/counter.html --peek

# Execute remote app
novoid-browser https://site.convex.site/raw/counter --peek
```

### Convex App Detection
- Auto-detects `convex.min.js` or `createClient` in source
- Auto-seeds empty defaults for detected `useQuery()` calls
- Full data flow: seed → useQuery → signals → DOM

### URL Fetching
- `/raw/:slug` endpoint serves clean HTML (no sentinel injection, no cache-busting)
- Script `src` attributes resolved relative to base URL

---

## MCP Test Specs

**Always generate `<slug>.test.json` alongside every app.** Runs automatically on publish (~8ms for 20 tests).

### Format

```json
{
  "seed": { "tasks:list": [{"id": "1", "text": "Buy milk"}] },
  "steps": [
    { "action": "read", "resource": "count", "assert": { "eq": 0 } },
    { "action": "call", "tool": "inc", "then": { "read": "count", "assert": { "eq": 1 } } },
    { "action": "call", "tool": "reset", "then": { "read": "count", "assert": { "eq": 0 } } },
    { "action": "push", "query": "tasks:list", "data": [{"id": "2", "text": "New"}],
      "then": { "read": "tasks", "assert": { "length": 2 } } }
  ]
}
```

### Steps

| Step | Fields | Purpose |
|---|---|---|
| `read` | `resource`, `assert` | Check store state |
| `call` | `tool`, `args?`, `then?` | Invoke store action |
| `push` | `query`, `data`, `then?` | Simulate Convex update |

### Assertions

| Key | Check |
|---|---|
| `eq` | Deep equality |
| `length` | Array length |
| `contains` | Array includes value or string contains substring |
| `matches` | String pattern match |

### Rules

1. **Resource names are store state keys directly.** Use `count`, `display`, `tasks` — not `store_0.count`. The resolver walks into store state automatically.
2. **Apps must use `createStore` for testability.** Store actions become MCP-callable tools. Raw signals with DOM `onclick` handlers are not testable.
3. **`seed` pre-populates Convex queries.** Required for apps that depend on backend data in headless mode.
4. **`then` clauses verify state after an action.** `read` + `assert` inside `then`.
5. **Specs are portable.** Same semantics locally and against remote `/raw/:slug` URLs.

---

## Post-Publish E2E (Phase 3 in publish.sh)

Runs automatically after every publish:

1. **Live URL check** — HTTP 200 from published page
2. **MCP schema validation** — tools/resources registered correctly
3. **MCP test specs** — if `<slug>.test.json` exists, runs behavioral tests
4. **Sentinel error check** — queries `errors:recent` for runtime errors from real browsers

---

## Interpreting Results

| Output | Meaning | Action |
|---|---|---|
| `SOUND` + `clean` | All clear | Publish proceeds |
| `UNSOUND` | Static issue found | Read the report, fix the flagged issue |
| Runtime errors | JS exception in headless | Fix the error, re-verify |
| Test spec failure | Assertion didn't match | Fix logic or update spec |
| Sentinel errors (post-publish) | Real browser runtime error | Query `errors:recent`, fix, republish |

---

## Conventions

1. Nous and novoid-browser catch different bug classes — both always run.
2. Static analysis is synchronous (same tick) — assertions verify state, not timing.
3. Seed Convex data for apps that depend on queries — headless has no backend.
4. `--skip-check` bypasses verification — only for confirmed false positives.
5. Shell scripts use `printf '%s\n'` (not `echo`) to pipe JSON — zsh's `echo` interprets `\n` escape sequences in strings, corrupting JSON with literal newlines.
