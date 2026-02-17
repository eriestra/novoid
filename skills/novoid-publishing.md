# novoid-publishing

Codified knowledge for the no∅ publish pipeline. This file replaces reading publish.sh, verify.sh, url.sh, build.sh, and seed.sh.

## Architecture

Pages stored in Convex `pages` table, served via HTTP routes (`/app/:slug`). Assets (CSS/JS) in `assets` table at `/css/:name`, `/js/:name`. Platform UI is itself a page — recursive self-hosting.

---

## Commands

```sh
# Load credentials first
PUBLISH_SECRET=$(grep '^PUBLISH_SECRET=' .env.local | cut -d= -f2)
CONVEX_URL=$(grep '^CONVEX_URL=' .env.local | cut -d= -f2)

# Publish an app (verify + publish + post-publish E2E)
sh publish.sh <slug> src/app/<slug>.html

# Look up URLs
sh url.sh <slug>

# Verify without publishing
sh verify.sh src/app/<slug>.html

# After editing framework source (src/)
sh build.sh                                    # minify src/ → dist/
sh seed.sh "$CONVEX_URL" "$PUBLISH_SECRET"     # upload assets to Convex
sh publish.sh <slug> src/app/<slug>.html       # republish affected apps
```

---

## Publish Pipeline

`publish.sh <slug> <file>` runs three phases:

### Phase 1: Verification (pre-flight)
- **Nous (static)** — tree automata, cascade conflicts, reactive cycle detection, state machine deadlocks, taint analysis, accessibility, unnamed signal detection
- **novoid-browser (empirical)** — QuickJS headless execution, signal introspection, store validation, secret leak detection
- Verdicts: `SOUND` = safe, `UNSOUND` = fix flagged issues

### Phase 2: Publish
- Uploads HTML to Convex `pages` table via `pages:publish` mutation
- Requires `PUBLISH_SECRET` for auth

### Phase 3: Post-publish E2E
- **MCP test specs** — if `<slug>.test.json` exists next to `<slug>.html`, runs behavioral tests automatically
- **Live URL check** — HTTP 200 from published page
- **MCP schema validation** — tools/resources registered correctly
- **Sentinel error check** — queries `errors:recent` for runtime errors

On success: prints live URL and MCP URL.

---

## Verification Details

### Nous Static Analysis
| Layer | What it checks |
|---|---|
| **Morphe** (structure) | Tree automata over DOM, accessibility (unlabeled inputs, missing ARIA) |
| **Thesis** (presentation) | CSS cascade conflicts (specificity lattice), layout overflow, breakpoints |
| **Kinesis** (behavior) | Reactive DAG (cycles, dead signals, unnamed signals), state machine deadlocks, taint analysis (user input → dangerous sinks) |

### novoid-browser Empirical Execution
| Flag | Purpose |
|---|---|
| `--peek` | Introspect signals, stores, DOM state |
| `--call <action> <args>` | Invoke store actions |
| `--assert <expr>` | Verify state (exit 0=pass, 1=fail) |
| `--seed <query> <data>` | Pre-populate Convex query results |
| `--push <query> <data>` | Simulate live Convex updates |
| `--test <spec.json>` | Run MCP behavioral test specs |

URL testing: `novoid-browser https://site.convex.site/raw/<slug> --peek`

### `--skip-check`
Bypasses verification. **Only for confirmed false positives** (e.g., Convex-dependent code that can't run headlessly).

---

## Test Specs

**Always generate `<slug>.test.json` alongside every `<slug>.html`.** Runs automatically as Phase 3.

### Format
```json
{
  "seed": { "tasks:list": [{"id": "1", "text": "Buy milk"}] },
  "steps": [
    { "action": "read", "resource": "count", "assert": { "eq": 0 } },
    { "action": "call", "tool": "inc", "then": { "read": "count", "assert": { "eq": 1 } } },
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
- Resource names are store state keys directly: `count`, `display`, `tasks`. No `store_0.` prefix.
- Apps must use `createStore` for testability — store actions become MCP tools.
- `seed` pre-populates Convex queries for apps that depend on backend data.

---

## Sentinel Error Feedback

Every published page is auto-instrumented with error capture. Runtime errors (`window.onerror`, `console.error`, unhandled rejections) POST to `/errors/:slug`.

```sh
# Check for errors
npx convex run errors:recent '{"slug":"<slug>"}'

# Clear errors after fixing
npx convex run errors:clear '{"slug":"<slug>","secret":"'$PUBLISH_SECRET'"}'
```

Integrated into publish.sh — errors checked automatically in Phase 3.

---

## Framework Asset Management

When editing framework source (`src/core.js`, `src/plugins/*.js`, `src/*.css`):

```sh
# 1. Edit source in src/
# 2. Build minified output
sh build.sh

# 3. Upload to Convex
sh seed.sh "$CONVEX_URL" "$PUBLISH_SECRET"

# 4. Republish affected apps
sh publish.sh <slug> src/app/<slug>.html
```

Source lives in `src/`, minified output in `dist/`. Never hand-edit `dist/`.

---

## URL Lookup

```sh
sh url.sh <slug>
```

Prints live URL and MCP URL. These and `publish.sh` output are the only canonical URL sources.

---

## MCP Endpoint

Every published app with a browser schema gets MCP automatically:

```
GET  /mcp/:slug   → JSON manifest (tools, resources, state)
POST /mcp/:slug   → MCP JSON-RPC (Streamable HTTP transport)
```

- **Tools**: store actions, Convex mutations/actions
- **Resources**: signal/store state, entity collections, Convex queries
- **Auth**: mutations/actions require `Authorization: Bearer <PUBLISH_SECRET>`
- **Schema**: extracted by novoid-browser at publish time. Named signals produce semantic names.

---

## Auth-Gated Mutations

All write mutations (`pages:publish`, `pages:remove`, `assets:set`) require `secret` arg checked against `PUBLISH_SECRET`. Read operations are public.

---

## Multi-Agent Collaboration

```sh
AGENT_ID="claude-$(date +%s | tail -c 5)"
npx convex run collab:status '{"slug":"<slug>"}'
npx convex run collab:claim '{"slug":"<slug>","name":"<fragment>","agentId":"'$AGENT_ID'","secret":"'$PUBLISH_SECRET'"}'
npx convex run collab:compose '{"slug":"<slug>","secret":"'$PUBLISH_SECRET'"}'
```

## Conventions

1. **Every app gets a test spec.** `<slug>.test.json` next to `<slug>.html`.
2. **Every fix ends with publish.** URLs come from `publish.sh` output or `sh url.sh <slug>`.
3. **Credentials from `.env.local`.** Load before auth-gated operations.
4. **`--skip-check` is for false positives only.** Not for skipping verification because it's slow.
5. **Source → build → seed → publish.** When editing framework source, follow the full pipeline.
