# novoid-cdp — CDP Browser Control

> Real browser automation for no∅. Drive Chrome/Chromium via Chrome DevTools Protocol to browse, scrape, fill forms, screenshot, and test against live pages — from Nex skills, Vox pipelines, and heartbeat steps.

**Status:** Spec. Complements novoid-browser (Qed) — where Qed executes no∅ apps headlessly in QuickJS for verification, novoid-cdp drives a real browser for interaction with the live web.

---

## Thesis

Qed proves no∅ apps correct from structure. novoid-cdp proves the real world is reachable from them.

Two browser tools, two jobs:

| | novoid-browser (Qed) | novoid-cdp |
|---|---|---|
| **What it drives** | QuickJS headless runtime | Real Chrome/Chromium |
| **Purpose** | Verify no∅ app logic before publish | Interact with live web, external sites, published apps |
| **Speed** | ~200ms | ~2s cold, ~100ms warm |
| **Network** | None (seeded data) | Full network stack |
| **Input** | `--call`, `--seed`, `--push` | Click, type, scroll, navigate |
| **Output** | Reactive state (signals, stores) | DOM snapshots, screenshots, extracted data |
| **Use case** | Pre-publish gate | Nex skills, scraping, E2E against live URLs |

---

## Architecture

```
Nex skill / heartbeat step / manual CLI
        │
        ▼
novoid-cdp (Rust)
        │
        ├─ Launch / attach Chrome  ─── WebSocket → CDP protocol
        │         │
        │    chrome-cdp crate          ┌─────────────────────┐
        │                              │  Chrome/Chromium     │
        ├─ Command executor ──────────→│  Page / DOM / JS     │
        │  (navigate, click,           │  Network / Storage   │
        │   type, scroll,              └─────────────────────┘
        │   screenshot, eval)
        │
        ├─ Extractor
        │  (text, links, tables,
        │   novoid state via eval)
        │
        └─ Output (JSON / peek / screenshot file)
```

### Components

| Component | File | Purpose |
|---|---|---|
| Launcher | `cdp/src/launcher.rs` | Find/launch Chrome with `--remote-debugging-port`, reuse existing if warm |
| Session | `cdp/src/session.rs` | WebSocket CDP session, domain management, event subscriptions |
| Executor | `cdp/src/executor.rs` | High-level command runner: navigate, click, type, scroll, wait, eval, screenshot |
| Extractor | `cdp/src/extractor.rs` | DOM → structured JSON: text, links, tables, inputs, novoid state |
| Transport | `cdp/src/transport.rs` | Output modes: JSON, peek (colored box), screenshot |
| CLI | `cdp/src/main.rs` | Argument parsing, command dispatch |

---

## CLI

```sh
cd cdp && cargo build                                    # build once

# Navigate and snapshot
novoid-cdp https://example.com --snap                    # text + links + structure
novoid-cdp https://example.com --screenshot out.png      # full-page screenshot

# Interact
novoid-cdp https://example.com \
  --click "#submit" \
  --type "#search" "novoid" \
  --wait ".results" \
  --snap

# Extract structured data
novoid-cdp https://example.com --extract table           # all tables as JSON
novoid-cdp https://example.com --extract links           # all hrefs
novoid-cdp https://example.com --extract text            # visible text only

# Eval JS in page context
novoid-cdp https://example.com --eval "document.title"
novoid-cdp https://example.com --eval "__novoid_observed?.getAll()"  # novoid state if app

# Pipe a command sequence (JSON)
novoid-cdp --script cdp/scripts/login-and-scrape.json

# Session reuse (warm browser)
novoid-cdp --port 9222 https://example.com --snap        # attach to existing Chrome
```

### Flags

| Flag | Purpose |
|---|---|
| `<URL>` | Page to load (required unless `--script`) |
| `--snap` | Snapshot: title, text, links, inputs, structure |
| `--screenshot <file>` | Full-page PNG |
| `--click <selector>` | Click element (CSS selector) |
| `--type <selector> <text>` | Focus + type into element |
| `--scroll <selector>` | Scroll element into view |
| `--wait <selector>` | Wait until selector resolves (15s timeout) |
| `--wait-idle` | Wait for network idle |
| `--eval <js>` | Evaluate JS, return JSON-serializable result |
| `--extract <mode>` | `text` \| `links` \| `tables` \| `inputs` \| `novoid` |
| `--script <file>` | Run a JSON command sequence |
| `--screenshot <file>` | Write PNG to path |
| `--port <n>` | Attach to existing Chrome on port (default: launch fresh) |
| `--headless` | Headless mode (default: headed) |
| `--timeout <ms>` | Per-command timeout (default: 15000) |
| `--peek` | Human-readable colored output |
| `-c` | Compact JSON output (for Nex skills) |

---

## Command Scripts

For multi-step interactions, write a JSON script instead of chaining flags. Scripts run sequentially — each step's result is available as `$prev`.

```json
{
  "url": "https://example.com/login",
  "steps": [
    { "type": "wait",       "selector": "#email" },
    { "type": "type",       "selector": "#email",    "text": "$ENV.CDP_EMAIL" },
    { "type": "type",       "selector": "#password",  "text": "$ENV.CDP_PASSWORD" },
    { "type": "click",      "selector": "[type=submit]" },
    { "type": "waitIdle" },
    { "type": "navigate",   "url": "https://example.com/dashboard" },
    { "type": "extract",    "mode": "tables",         "as": "data" },
    { "type": "screenshot", "file": "dashboard.png" }
  ]
}
```

### Step types

| Type | Fields | Purpose |
|---|---|---|
| `navigate` | `url` | Navigate to URL |
| `click` | `selector` | Click element |
| `type` | `selector`, `text` | Type into element (`$ENV.KEY` reads from env) |
| `scroll` | `selector` | Scroll into view |
| `wait` | `selector`, `timeout?` | Wait for element (default 15s) |
| `waitIdle` | `timeout?` | Wait for network idle |
| `eval` | `js`, `as?` | Evaluate JS, store result |
| `extract` | `mode`, `as?` | Extract structured data, store result |
| `screenshot` | `file` | Write PNG |
| `assert` | `expr` | JS assertion against `$prev` or stored results — fails step on falsy |

### Environment substitution

`$ENV.KEY` in `text` and `url` fields reads from `.env.local`. Credentials never hardcoded in scripts.

---

## Output Format

### `--snap` (peek mode)

```
┌─ novoid-cdp ─────────────────────────────────────────────┐
│ url:    https://example.com                               │
│ title:  Example Domain                                    │
│ status: 200  load: 412ms                                  │
│                                                           │
│ text:   Example Domain                                    │
│         This domain is for use in illustrative...         │
│                                                           │
│ links:  1   inputs: 0   tables: 0                         │
└───────────────────────────────────────────────────────────┘
```

### `--extract tables` (compact JSON)

```json
{
  "url": "https://example.com/data",
  "tables": [
    {
      "headers": ["Name", "Value", "Status"],
      "rows": [
        ["Alpha", "123", "active"],
        ["Beta",  "456", "inactive"]
      ]
    }
  ]
}
```

### `--extract novoid`

When the target page is a published no∅ app, eval `__novoid_observed?.getAll()` to extract reactive state — same format as Qed's `--peek`. Useful for E2E checking live published apps.

```json
{
  "url": "https://site.convex.site/app/dashboard",
  "novoid": {
    "signals": [{ "name": "count", "value": 42 }],
    "stores": [{ "state": { "items": [...] }, "actions": ["add", "remove"] }],
    "errors": []
  }
}
```

---

## Convex Integration

novoid-cdp is a Convex **action** — the Nex worker spawns it server-side, results flow back into the job system.

### `convex/cdp.ts`

```typescript
// convex/cdp.ts
import { action } from "./_generated/server";
import { v } from "convex/values";
import { verifySecret } from "./lib";

// Browse a URL and return a snapshot
export const browse = action({
  args: {
    url: v.string(),
    extract: v.optional(v.string()),   // "text" | "links" | "tables" | "novoid"
    script: v.optional(v.string()),    // JSON command script
    secret: v.string(),
  },
  handler: async (_ctx, { url, extract, script, secret }) => {
    await verifySecret(_ctx, secret);
    // Spawn novoid-cdp subprocess, return compact JSON result
    // ...
  },
});

// Screenshot a URL, store in Convex files table
export const screenshot = action({
  args: {
    url: v.string(),
    slug: v.optional(v.string()),      // store as files:<slug>-screenshot
    secret: v.string(),
  },
  handler: async (ctx, { url, slug, secret }) => {
    await verifySecret(ctx, secret);
    // Spawn novoid-cdp --screenshot, upload to ctx.storage
    // Returns { storageId, url }
    // ...
  },
});
```

### HTTP routes

```
GET  /cdp/browse?url=<url>&extract=<mode>   → JSON snapshot (auth: PUBLISH_SECRET header)
GET  /cdp/screenshot?url=<url>              → PNG image (auth: PUBLISH_SECRET header)
POST /cdp/script                            → run JSON command script, return results
```

---

## Nex Integration

### As a skill

Add to `nex_skills` with slash command `/browse`:

```json
{
  "name": "cdp-browse",
  "description": "Browse a URL and extract content using a real browser",
  "command": "/browse",
  "type": "builtin",
  "handler": "{\"type\":\"cdp\",\"action\":\"browse\",\"url\":\"$1\",\"extract\":\"text\"}"
}
```

### In Nex system prompt

```
Tools available:
- /browse <url>         — browse URL, extract visible text
- /screenshot <url>     — screenshot URL, attach to response
- /scrape <url> tables  — extract all tables as JSON
```

### In heartbeat checklist

```json
[
  {
    "id": "a1b2",
    "text": "Browse https://status.example.com and check for incidents",
    "enabled": true,
    "order": 0
  },
  {
    "id": "c3d4",
    "text": "If incidents found, send approval via Telegram before alerting team",
    "enabled": true,
    "order": 1
  }
]
```

The heartbeat pipeline's approval gate fires before any external notification — same pattern as existing steps.

---

## Verification Integration

novoid-cdp adds a **Phase 4** to the publish pipeline — optional live browser E2E after post-publish.

```
sh publish.sh <slug> src/app/<slug>.html

┌─ verify ───────────────────────────────────────────┐
│ nous    ✓ SOUND  47 nodes, 6 signals               │
│ browser ✓ clean  1 stores, 5 actions               │
│ ✓ 104/104 passed (8ms)                             │
├────────────────────────────────────────────────────┤
│ ✓ verified                                         │
└────────────────────────────────────────────────────┘

┌─ post-publish ──────────────────────────────────────────┐
│ live     ✓ https://...convex.site/app/<slug> (200)      │
│ mcp      ✓ 3 tools, 5 resources                        │
│ sentinel ✓ no runtime errors                            │
│ cdp      ✓ real browser: 3 interactions passed          │  ← Phase 4 (if .cdp.json exists)
├─────────────────────────────────────────────────────────┤
│ ✓ e2e passed                                            │
└─────────────────────────────────────────────────────────┘
```

### CDP test specs

Generate `<slug>.cdp.json` alongside `<slug>.html` for live browser assertions:

```json
{
  "url": "$CONVEX_SITE_URL/app/kanban",
  "steps": [
    { "type": "wait",   "selector": ".nv-card" },
    { "type": "eval",   "js": "document.querySelectorAll('.nv-card').length", "as": "cards" },
    { "type": "assert", "expr": "$cards >= 1" },
    { "type": "click",  "selector": "[data-action='add']" },
    { "type": "wait",   "selector": ".nv-modal" },
    { "type": "assert", "expr": "document.querySelector('.nv-modal') !== null" },
    { "type": "extract","mode": "novoid", "as": "state" },
    { "type": "assert", "expr": "$state.stores[0].state.items.length >= 1" }
  ]
}
```

`$CONVEX_SITE_URL` is substituted from `.env.local` at runtime. The spec uses the same assertion style as `<slug>.test.json` (Qed) — `assert` with a JS expression.

---

## Schema additions

```typescript
// convex/schema.ts additions

nex_cdp_sessions: defineTable({
  orgId: v.string(),
  url: v.string(),
  port: v.number(),           // Chrome remote debugging port
  status: v.string(),         // "idle" | "busy" | "closed"
  lastUsedAt: v.number(),
  createdAt: v.number(),
}).index("by_org_status", ["orgId", "status"]),

nex_cdp_results: defineTable({
  orgId: v.string(),
  jobId: v.optional(v.id("nex_jobs")),
  url: v.string(),
  extract: v.optional(v.string()),
  result: v.string(),         // compact JSON
  screenshotId: v.optional(v.id("_storage")),
  durationMs: v.number(),
  createdAt: v.number(),
}).index("by_org", ["orgId"])
  .index("by_job", ["jobId"]),
```

---

## Session management

Cold Chrome launch takes ~2s. novoid-cdp keeps one warm Chrome per org.

```
First call  → launch Chrome → attach CDP → navigate (2.1s total)
Subsequent  → reuse session → navigate   (~120ms total)
Idle 5min   → close Chrome  → cleanup port
```

Sessions tracked in `nex_cdp_sessions`. The Nex worker checks for an idle session before launching. If `status: "idle"` and `lastUsedAt` < 5min ago → reuse. Otherwise → launch fresh.

Multiple concurrent jobs claim separate sessions (different ports, 9222–9231 range).

---

## Security

| Concern | Mitigation |
|---|---|
| Credential leakage in scripts | `$ENV.KEY` substitution — secrets never in script files |
| SSRF via `url` arg | Allowlist check before navigation (configurable per org) |
| JS eval surface | `--eval` output is JSON-serialized — no DOM references escape |
| Screenshot storage | Written to `_storage`, served via signed URLs — never public |
| Auth on HTTP routes | `Authorization: Bearer <PUBLISH_SECRET>` required for all CDP routes |
| Port range | CDP ports 9222–9231 bound to loopback only — never exposed |

### URL allowlist (per org)

```json
{
  "cdp": {
    "allowlist": ["https://example.com", "https://*.convex.site"],
    "blockPrivate": true
  }
}
```

Stored in org settings. `blockPrivate: true` rejects `localhost`, `10.*`, `192.168.*`, `169.254.*` — prevents SSRF against internal services.

---

## Comparison to OpenClaw CDP

| Dimension | OpenClaw (CDP) | novoid-cdp |
|---|---|---|
| Protocol | CDP direct | CDP via `chrome-cdp` Rust crate |
| Scope | General web agent tool | Nex skill + verification layer |
| Session model | Single dedicated Chrome | Pool (one per org, warm reuse) |
| Output | Agent-interpreted | Structured JSON → Convex job result |
| Verification tie-in | None | Phase 4 of publish pipeline |
| Auth surface | Gateway auth | PUBLISH_SECRET + org allowlist |
| Storage | Workspace files | Convex `_storage` (signed URLs) |
| Multi-agent | Sessions per agent | Sessions per org, claimed by job |

The core CDP wire protocol is identical. The difference is integration depth — novoid-cdp is designed to flow into the Convex job system, appear as Nex skills, and run as a publish verification phase. OpenClaw's CDP is a general-purpose agent tool for browsing and interaction.

---

## Implementation plan

### Phase 1 — CLI (Rust, `cdp/`)
- `cargo new cdp` alongside `browser/` (Qed)
- `chrome-cdp` crate for CDP session management
- Commands: `navigate`, `wait`, `click`, `type`, `snap`, `screenshot`, `eval`, `extract`
- Output modes: peek, compact JSON (`-c`)
- Warm session reuse via `--port`

### Phase 2 — Convex actions (`convex/cdp.ts`)
- `browse` and `screenshot` actions
- Subprocess spawn → result stored in `nex_cdp_results`
- Screenshot upload to `ctx.storage`

### Phase 3 — Nex integration
- Built-in `/browse` and `/screenshot` skills
- `nex_cdp_sessions` table + session pool manager in `nex-watch.js`
- Heartbeat pipeline: CDP steps classified by step text (`browse|scrape|screenshot|navigate`)

### Phase 4 — Verification integration
- `publish.sh` checks for `<slug>.cdp.json` and runs Phase 4 if present
- `sh verify-cdp.sh <slug>` standalone command
- Results printed in publish output block (same format as existing phases)

---

## Skill file

Add `skills/novoid-cdp.md` and register in `CLAUDE.md` skills index and `AGENTS.md`.

```
[novoid skills]|root: skills/
...
|novoid-cdp.md         — CDP browser control: browse, scrape, screenshot, live E2E
```

### `novoid-improve.md` checklist additions

```
### Source Code
- [ ] `cdp/src/` — CDP browser control (Rust)
- [ ] `convex/cdp.ts` — browse/screenshot Convex actions
- [ ] `convex/schema.ts` — nex_cdp_sessions, nex_cdp_results tables

### Skills
- [ ] `skills/novoid-cdp.md` — CDP skill reference

### Agent Configuration
- [ ] Update CLAUDE.md skills index
- [ ] Update AGENTS.md agent ecosystem section

### Build & Deploy
- [ ] `cd cdp && cargo build` — build CDP binary
- [ ] `seed.sh` — no changes (CDP binary runs locally, not in Convex)
```

---

## Conventions

1. **novoid-browser for no∅ apps. novoid-cdp for the live web.** Don't use CDP to verify no∅ app logic — that's Qed's job. Use CDP when you need network, real DOM, or third-party sites.
2. **Warm sessions are the default.** Cold launches only when no idle session exists. The 2s cold-start is a one-time cost per org.
3. **`--extract novoid` bridges both worlds.** When a published no∅ app is the target, use `--extract novoid` to read `__novoid_observed` — reactive state from a real browser, not a QuickJS polyfill.
4. **CDP test specs are optional.** `<slug>.cdp.json` only for apps that depend on real network or third-party auth. Most apps are fully covered by `<slug>.test.json` (Qed).
5. **Credentials via `$ENV.KEY`.** Never hardcode secrets in `.cdp.json` scripts.
6. **Loopback only.** CDP port binding must stay on loopback. Tailscale or SSH tunnel if the agent worker is remote.
7. **Results into Convex.** CDP output always flows back as a Convex job result — never written to local files except screenshots (which are then uploaded to `_storage`).
