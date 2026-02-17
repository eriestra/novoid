# no∅ Verification & Agent API

> How novoid apps are tested without humans, and how AI agents read them.

---

## Verification Pipeline

Every no∅ app goes through multi-layer verification before publishing. No human involvement.

```
generate app → verify.sh → publish → Lux (post-publish)
                  │
                  ├─ Nous (static proof)         → see NOUS.md
                  ├─ Qed (empirical execution)   → see BROWSER.md
                  └─ Qed --test (MCP assertions) → if .test.json exists
```

### Layer summary

| Layer | Tool | What it catches | Details |
|---|---|---|---|
| 1 — Static proof | Nous | Reactive cycles, dead signals, taint paths, cascade conflicts, layout overflow, accessibility gaps | [NOUS.md](../NOUS.md) |
| 2 — Empirical execution | Qed | JS runtime errors, render bugs, state shape mismatches | [BROWSER.md](../BROWSER.md) |
| 2.5 — MCP assertions | Qed --test | Action behavior, state transitions, Convex data flow | [BROWSER.md](../BROWSER.md) |
| 3 — Post-publish sentinel | Lux | Browser-specific bugs, network failures, race conditions | Injected server-side |

### How they work together

```
┌─ verify ───────────────────────────────────────────┐
│ nous    ✓ SOUND   47 nodes, 6 signals              │  ← static proof
│ browser ✓ clean   2 signals, 1 stores, 3 actions   │  ← empirical run
│ test    ✓ 3/3 passed (23ms)                        │  ← behavioral assertions
├─────────────────────────────────────────────────────┤
│ ✓ verified                                          │
└─────────────────────────────────────────────────────┘
```

If any layer fails, publishing is blocked. The agent reads the error, fixes the code, and retries.

### Lux (Sentinel) — Post-Publish

Error capture snippet injected server-side into every page. Runtime errors flow from browsers to Convex automatically:

```
User's browser → window.onerror / console.error → POST /errors/:slug → Convex errors table → agent reads → fixes → republishes
```

### Coverage Summary

| Problem | Nous | Qed | Qed --test | Lux |
|---|---|---|---|---|
| Reactive cycles | static proof | | | |
| Dead signals | static proof | | | |
| State machine deadlocks | static proof | | | |
| Taint (input → dangerous sink) | static proof | | | |
| CSS cascade conflicts | static proof | | | |
| Layout overflow | static proof | | | |
| Unlabeled inputs | static proof | | | |
| JS runtime errors | | headless execution | | live browsers |
| Render errors / typos | | headless execution | | live browsers |
| Store state shape | | introspection | assertions | |
| Action behavior | | | call + assert | |
| State transitions | | | push + assert | |
| Convex data flow | | mock client | seed + assert | real client |
| Browser-specific bugs | | | | live browsers |

---

## Markdown for Agents

### Content Negotiation

Agents request markdown instead of HTML using the standard `Accept` header:

```
curl -H "Accept: text/markdown" https://example.convex.site/app/todo
```

Regular browsers still get HTML. No URL changes, no separate endpoints.

### What the Agent Gets

A structured API document including verification data captured at publish time:

```markdown
---
title: Todo App
slug: todo
url: https://example.convex.site/app/todo
---

[... page text content ...]

## Signals
| ID | Value |
| --- | --- |
| signal_0 | `""` |

## Stores
### store_0
**Actions:** `increment`, `decrement`, `addItem`
**State:** `{"count":0,"items":["Alpha","Bravo","Charlie"]}`

## Convex
**Queries:** `tasks:list`, `users:me`
**Mutations:** `tasks:add`, `tasks:toggle`

## Proof (Nous)
**Verdict:** PARTIAL
**Structure:** 11 nodes, 0/0 contracts
**Accessibility:** inputs labeled: yes, tab order: complete
**Behavior:** 1 signals, dead: name
```

### How It Works

```
generate app → verify.sh
  ├─ nous proof JSON ──────────┐
  └─ novoid-browser schema JSON ┤
→ publish.sh                    │
  ├─ HTML                       │
  ├─ browserSchema ◄────────────┤  stored in Convex pages table
  └─ nousReport ◄──────────────┘
→ agent requests markdown
  → HTML text + browserSchema + nousReport → structured markdown
```

### Response Headers

```
Content-Type: text/markdown; charset=utf-8
Vary: Accept
x-markdown-tokens: 3051
```

`x-markdown-tokens` gives a rough token estimate (`content.length / 4`) for context window budgeting. `Vary: Accept` tells caches the same URL serves different content based on Accept header.

### Impact

| Format | Size | Est. Tokens | Reduction |
|---|---|---|---|
| HTML | 54KB | ~13,500 | — |
| Markdown | 12KB | ~3,000 | 77% |

---

## MCP: Model Context Protocol

Every no∅ app gets an auto-generated MCP interface from its BrowseSchema — no developer annotation needed.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/mcp/:slug` | Human/agent-readable manifest (JSON) |
| `POST` | `/mcp/:slug` | MCP JSON-RPC (Streamable HTTP transport) |

### What Gets Exposed

- **Tools** — every `createStore` action becomes an MCP tool
- **Resources** — every signal/store becomes a `novoid://` resource
- **Entities** — array collections get inferred schemas at `novoid://<slug>/entity/<path>`
- **State snapshot** — current values from last verified publish

### Named Signals

Signal names are critical for MCP readability:

```js
Novoid.signal(0)          // → novoid://app/state/signal_0
Novoid.signal(0, 'count') // → novoid://app/state/count
```

### JSON-RPC Methods

| Method | Returns |
|---|---|
| `initialize` | Server info + capabilities |
| `tools/list` | All store actions as MCP tools |
| `tools/call` | Action schema + current state |
| `resources/list` | All state/entity resources |
| `resources/read` | Specific resource value |

### How This Differs from WebMCP

| | WebMCP | no∅ MCP |
|---|---|---|
| Developer effort | Manual `registerTool()` | Zero — auto-generated from BrowseSchema |
| Runtime | Live browser with widget | Server-side from stored schema |
| Discovery | Per-page, runtime only | Per-slug, available at publish |
| Verification | None | Schema verified by Qed + Nous |
| Transport | Widget + relay server | Standard MCP JSON-RPC over HTTP |

### The Full Stack

| Interface | URL | Best for |
|---|---|---|
| Markdown | `GET /app/:slug` with `Accept: text/markdown` | Context-efficient reading (77% smaller) |
| MCP | `GET/POST /mcp/:slug` | Structured tool/resource interaction |
| Sentinel | `POST /errors/:slug` | Runtime error feedback loop |
