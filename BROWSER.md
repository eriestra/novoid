# BROWSER.md — Qed (novoid-browser)

> Headless verifier for no∅. Executes apps in QuickJS, introspects reactive state, catches errors — no Chrome, no screenshots.

Where Nous proves properties statically, Qed demonstrates them empirically.

```
$ novoid-browser src/app/kanban.html --peek

┌─ novoid-browser ─────────────────────────────────────┐
│ signals: 4   stores: 1   components: 3   routes: 0   │
│ errors: 0   console: 0                                │
│                                                        │
│ store_0.tasks: [{id: "1", title: "...", done: false}]  │
│ signal_0: 0                                            │
│ actions: addTask, removeTask, toggleTask               │
└────────────────────────────────────────────────────────┘
```

~200ms execution. ~5MB memory. Local files or remote URLs.

---

## What it does

| Capability | Status |
|---|---|
| Execute no∅ apps headlessly | Working |
| Catch uncaught JS errors | Working |
| Introspect signals, stores, components | Working |
| Call store actions programmatically | Working |
| Run JS assertions against app state | Working |
| Three output formats (JSON, compact, peek) | Working |
| Fetch apps from URLs (remote execution) | Working |
| MCP test harness (`--test spec.json`) | Working |

---

## Architecture

```
HTML file or URL ──→ Parser (scraper crate) ──→ Script extraction
                                              │
                                              ▼
              DOM Polyfill (JS) + Observer (JS) loaded into QuickJS
                                              │
                                              ▼
                                    App scripts execute
                                              │
                                              ▼
              Observer captures: signals, stores, components, routes, forms, errors
                                              │
                                              ▼
              Synthesizer builds BrowseSchema from observed state
                                              │
                                              ▼
                                    Output (JSON / peek)
```

### Components

| Component | File | Purpose |
|---|---|---|
| Parser | `parser.rs` | HTML parsing via `scraper` crate, script/style extraction |
| Runtime | `runtime.rs` | QuickJS wrapper via `rquickjs`, DOM polyfill + observer loading |
| DOM Polyfill | `js/dom-polyfill.js` | Minimal browser env (~590 lines): EventTarget, Element, Document, querySelector, localStorage, setTimeout/rAF (immediate) |
| Observer | `js/observer.js` | Monkey-patches Novoid APIs (~159 lines): tracks signals, stores, components, routes, errors. Exposes `__novoid_observed.getAll()` |
| Synthesizer | `synthesizer.rs` | Observed JSON → BrowseSchema (state, actions, entities, routes, forms, errors) |
| Transport | `transport.rs` | Output modes: pretty JSON, compact (`-c`), peek (colored box) |

---

## CLI

```sh
cd browser && cargo build                                      # build once

novoid-browser src/app/foo.html --peek                         # introspect
novoid-browser src/app/foo.html -c                             # compact JSON (verify.sh)
novoid-browser src/app/foo.html --call addTask '"Buy milk"'    # call action
novoid-browser src/app/foo.html --assert 'store_0.tasks.length > 0'  # assertions
novoid-browser --test counter.test.json src/app/counter.html   # MCP test spec
novoid-browser https://example.convex.site/raw/counter --peek  # remote URL
```

| Flag | Purpose |
|---|---|
| `<file>` | Path to HTML file or URL (required) |
| `--peek` | Human-readable colored output |
| `-c` / `--compact` | Compact JSON output |
| `--call <ACTION> [ARGS]` | Call a store action by name |
| `--observe <path>` | Observe a specific state path |
| `--assert <expr>...` | Run JS assertions against app state |
| `--test <spec.json>` | Run MCP test spec (behavioral assertions) |
| `--seed <REF> <DATA>` | Pre-populate Convex query results |
| `--push <REF> <DATA>` | Simulate live Convex update after init |

---

## MCP Test Harness

The `--test` flag runs behavioral assertions using MCP semantics.

### Test spec format

```json
{
  "seed": { "pages:list": [{"slug": "foo"}] },
  "steps": [
    { "action": "read", "resource": "count", "assert": { "eq": 0 } },
    { "action": "call", "tool": "increment", "then": { "read": "count", "assert": { "eq": 1 } } },
    { "action": "push", "query": "jobs:stream", "data": [{"status": "done"}], "then": { "read": "jobs", "assert": { "length": 1 } } }
  ]
}
```

### Step types

| Step | MCP equivalent | novoid-browser equivalent |
|---|---|---|
| `read` | `resources/read` → `novoid://<slug>/state/<name>` | Read from `__novoid_observed` |
| `call` | `tools/call` → store action | `__novoid_observed.callAction(name, args)` |
| `push` | Convex live update | `__convex_headless.push(ref, data)` |

### Assertions

| Field | Check |
|---|---|
| `eq` | Deep equality |
| `length` | Array length |
| `contains` | Array includes value or string contains substring |
| `matches` | String pattern match |

### Resource names

Use store state keys directly: `count`, `display`, `tasks`. Do **not** prefix with `store_0.` — the resolver walks into store state automatically.

### Testability requirement

Apps must use `createStore` for logic that needs testing. Store actions become callable tools. Raw signals with DOM `onclick` handlers are not testable — novoid-browser cannot simulate DOM clicks, only call named store actions.

### Playwright comparison

| Playwright/Puppeteer | novoid-browser --test |
|---|---|
| Launch Chrome (~2s) | QuickJS in-process (~5ms) |
| `page.click('.btn')` | `call increment {}` |
| `page.waitForSelector('.count')` | `read count` |
| Screenshot comparison | State comparison |
| Flaky selectors | Named signals |
| ~5s per test | ~20ms per test |

If a `.test.json` file exists alongside the app, verify.sh runs it automatically as Phase 3.

---

## Limitations

- **no∅ apps only** — relies on Novoid global for state introspection
- **Basic selectors** — no descendant combinators, `:nth-child`, etc.
- **innerHTML stub** — setter creates a text node, doesn't parse HTML
- **fetch stub** — returns empty response (Convex-dependent code won't execute)
- **No layout** — no CSS computation, no getBoundingClientRect

---

## Tech stack

| Component | Choice | Rationale |
|---|---|---|
| Language | Rust | Performance, safety, WASM target |
| JS engine | QuickJS (`rquickjs`) | 210KB, ~300μs startup, ES2023, embeddable |
| HTML parser | `scraper` (html5ever) | Spec-compliant, Rust-native |
| HTTP client | `reqwest` (blocking) | URL fetching for remote apps |
| DOM | Custom JS polyfill | Only what agents need — no layout/paint |
| CLI | clap | Standard Rust CLI |
