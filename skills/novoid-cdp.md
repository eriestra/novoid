# novoid-cdp

CDP (Chrome DevTools Protocol) browser automation for no∅. Drive a real Chrome/Chromium to browse, scrape, fill forms, screenshot, and interact with live pages.

## When to Use

| Tool | When |
|---|---|
| **Qed** (`browser/`) | Verify no∅ app logic before publish — headless QuickJS, no network |
| **CDP** (`cdp/`) | Interact with live web, external sites, published apps — real Chrome |

**Rule:** Qed for no∅ apps. CDP for the live web. Don't use CDP to verify app logic — that's Qed's job.

## CLI

```sh
cd cdp && cargo build    # build once

# Navigate + snapshot
novoid-cdp https://example.com --snap --headless
novoid-cdp https://example.com --snap --headless --peek     # colored box output
novoid-cdp https://example.com --snap --headless -c          # compact JSON

# Screenshot
novoid-cdp https://example.com --screenshot /tmp/out.png --headless

# Extract structured data
novoid-cdp https://example.com --extract text --headless     # visible text
novoid-cdp https://example.com --extract links --headless    # all hrefs
novoid-cdp https://example.com --extract tables --headless   # tables as JSON
novoid-cdp https://example.com --extract inputs --headless   # form inputs
novoid-cdp https://example.com --extract novoid --headless   # no∅ reactive state

# Eval JS in page context
novoid-cdp https://example.com --eval "document.title" --headless

# Interact
novoid-cdp https://example.com --click "#submit" --wait-idle --snap --headless
novoid-cdp https://example.com --type "#search" "query" --headless

# Script mode (JSON command sequence)
novoid-cdp --script scripts/login.json --headless

# Attach to existing Chrome
novoid-cdp --port 9222 https://example.com --snap
```

## Flags

| Flag | Purpose |
|---|---|
| `<URL>` | Page to load (required unless `--script`) |
| `--snap` | Snapshot: title, text, links, inputs, table count |
| `--screenshot <file>` | Full-page PNG |
| `--click <selector>` | Click element (CSS selector) |
| `--type <selector> <text>` | Focus + type into element |
| `--scroll <selector>` | Scroll element into view |
| `--wait <selector>` | Wait until selector resolves |
| `--wait-idle` | Wait for network idle |
| `--eval <js>` | Evaluate JS, return result |
| `--extract <mode>` | `text` &#124; `links` &#124; `tables` &#124; `inputs` &#124; `novoid` |
| `--script <file>` | Run JSON command sequence |
| `--port <n>` | Attach to existing Chrome (default: launch fresh) |
| `--headless` | Headless mode (default: headed) |
| `--timeout <ms>` | Per-command timeout (default: 15000) |
| `--peek` | Human-readable colored box output |
| `-c` | Compact JSON (for piping) |

## Output Modes

**Pretty JSON** (default) — `serde_json::to_string_pretty`
**Compact JSON** (`-c`) — single-line, pipe-friendly
**Peek** (`--peek`) — colored box:
```
┌─ novoid-cdp ──────────────────────────────────────────────┐
│ url:    https://example.com                               │
│ load:   412ms                                             │
│ title:  Example Domain                                    │
│                                                           │
│ text:   Example Domain                                    │
│         This domain is for use in illustrative...         │
│                                                           │
│ links:  1    inputs: 0    tables: 0                       │
├───────────────────────────────────────────────────────────┤
│ ✓ ok                                                      │
└───────────────────────────────────────────────────────────┘
```

## Command Scripts

Multi-step interactions as JSON:

```json
{
  "url": "https://example.com/login",
  "steps": [
    { "type": "wait",       "selector": "#email" },
    { "type": "type",       "selector": "#email",    "text": "$ENV.CDP_EMAIL" },
    { "type": "type",       "selector": "#password", "text": "$ENV.CDP_PASSWORD" },
    { "type": "click",      "selector": "[type=submit]" },
    { "type": "waitIdle" },
    { "type": "extract",    "mode": "tables" },
    { "type": "screenshot", "file": "dashboard.png" }
  ]
}
```

`$ENV.KEY` reads from environment — credentials never hardcoded in scripts.

## Nex Skills

CDP is available as Nex slash commands:

| Command | What it does |
|---|---|
| `/browse <url>` | Real browser snap → Claude summarizes content |
| `/screenshot <url>` | Full-page PNG saved to `/tmp/` |
| `/scrape <url> [mode]` | Extract tables/links/text/inputs → Claude formats |

Falls back to WebFetch if CDP binary unavailable.

## Convex Actions

```typescript
// convex/cdp.ts ("use node" — runs in Node.js runtime)
cdp:browse     — { url, extract?, snap?, secret } → JSON snapshot
cdp:screenshot — { url, secret } → { storageId, url }
cdp:script     — { scriptJson, secret } → JSON results
```

HTTP routes (all require `Authorization: Bearer <PUBLISH_SECRET>`):
```
GET  /cdp/browse?url=<url>&extract=<mode>&snap=true
GET  /cdp/screenshot?url=<url>
POST /cdp/script  (body: JSON command script)
```

## Crate Structure

```
cdp/
├── Cargo.toml        — chromiumoxide, tokio, clap, serde
├── src/
│   ├── main.rs       — CLI: clap args, dispatch, run_commands()
│   ├── lib.rs        — module exports
│   ├── launcher.rs   — Chrome launch (headless) / attach (--port)
│   ├── session.rs    — Page lifecycle (new tab)
│   ├── executor.rs   — Command enum, sequential runner, script loader
│   ├── extractor.rs  — Snapshot struct, DOM extraction helpers
│   └── transport.rs  — Output: pretty JSON, compact, peek box
```

## Not in Publish Pipeline

CDP is **not** part of `publish.sh`. The publish pipeline (Nous + Qed + upload) stays fast (~1.15s). CDP is on-demand only:
- Nex skills (`/browse`, `/screenshot`, `/scrape`)
- Manual CLI usage
- Convex actions via HTTP

Chrome launch is ~2-5s with hangup risk — too slow and fragile for the hot path.

## Extract Novoid

When targeting a published no∅ app, `--extract novoid` evals `__novoid_observed?.getAll()` — same reactive state Qed sees, but from a real browser with real network. Bridges both worlds.
