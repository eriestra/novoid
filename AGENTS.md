# AGENTS.md

> Model-agnostic agent instructions for no∅ (novoid).
> IMPORTANT: Skill-led reasoning. Skills are the source of truth — not source files. Read skills first.

## What This Is

no∅ — frictionless frontend framework. Describe what you want, it's live in seconds. Vanilla HTML/CSS/JS apps, instant deploy to Convex. No build step, no npm in generated apps.

## Skills Index

Codified knowledge lives in `skills/`. Each skill replaces reading multiple source files. Skills are always-in-context compressed references — agents never need to decide *when* to look things up.

```
[novoid skills]|root: skills/
|novoid-core.md        — reactive API: signals, computed, effect, h(), createStore, mount
|novoid-render.md      — render plugin: declarative UI (sections, bindings, formats)
|novoid-css.md         — design system: variables, utilities, 25 component groups
|novoid-publishing.md  — publish pipeline: verify → publish → post-publish E2E
|novoid-verification.md — verification: Nous static + Qed headless + MCP test specs
|novoid-agents.md      — Nex (replaces OpenClaw), Vox (vibe-coded app builder), personas, memory, multi-channel, inline apps
|novoid-math.md        — KaTeX integration, TeX notation, MathML visibility
|novoid-improve.md     — meta-skill: feature expansion checklist, consistency rules
```

Certified Convex skills in `skills/certified/` — read before any Convex backend work.

## Architecture

```
Agent → generate HTML → sh publish.sh <slug> src/app/<slug>.html → verify → pages table → live URL
                         assets table → CSS/JS    /mcp/:slug → programmatic interface
```

Pages stored in Convex DB, served via HTTP. Publishing = writing to DB. No git push, no CI.

## Quick Reference

|Concept|Syntax|
|---|---|
|Signal|`const [count, setCount] = Novoid.signal(0, 'count')` — getter: `count()`|
|Computed|`Novoid.computed(() => count() * 2)`|
|Effect|`Novoid.effect(() => { console.log(count()) })`|
|Element|`Novoid.h('div', { class: 'nv-card' }, 'text', () => count())`|
|List|`Novoid.list(container, items, t => t.id, t => Novoid.h('li', {}, t.text))`|
|Conditional|`Novoid.when(() => cond(), thenFn, elseFn)`|
|Mount|`Novoid.mount('#app', () => Novoid.h('div', {}, 'Hello'))`|
|Convex|`Novoid.createClient(url)`, `Novoid.useQuery(db, ref, args)`|
|Auth|`Novoid.useNovoidAuth(db)` → `.user()`, `.login()`, `.register()`, `.logout()`|
|Toast|`Novoid.toast.info('msg')`, `.success()`, `.danger()`, `.warning()`|
|Store|`Novoid.createStore(state, actions)` — actions return partial state (auto-merged)|
|Render|`Novoid.render('#app', store, config)` — declarative UI, zero h() calls|
|Router|`Novoid.createRouter(routes, container)` — hash-based (`#/path`)|
|Bind|`{ bind: [getter, setter] }` on inputs — never inside `effect()`|

CSS: `nv-` classes, `--nv-` variables. JS: `Novoid.*`. Dark mode: `[data-theme="dark"]`. Fonts: DM Sans, Outfit, JetBrains Mono.

## Loading (HTML boilerplate)

```html
<link rel="stylesheet" href="../css/core.min.css">
<link rel="stylesheet" href="../css/components.min.css">
<script src="../js/core.min.js"></script>
<script src="../js/router.min.js"></script>
<script src="../js/convex.min.js"></script>
<script src="../js/auth.min.js"></script>
<script src="../js/toast.min.js"></script>
<script src="../js/render.min.js"></script>
```

## Critical Rules

1. **Signal getters are functions:** `count()` not `count`
2. **Always name signals:** `signal(0, 'count')` — Nous warns on unnamed
3. **No `</script>` in JS strings** — use `'</' + 'script>'`
4. **Real `</script>` tags must NOT be escaped** — `<\/script>` breaks HTML
5. **HTML is vanilla** — no build tools, no npm in generated apps
6. **Edit `src/`, never `dist/`** — `dist/` and `convex/_generated/` are outputs
7. **Boolean attrs:** `disabled: () => isLoading()` works reactively
8. **Focus preservation:** give inputs `id` or `name`
9. **`bind` inputs** at component scope, never inside `effect()`

## Publishing

```sh
source .env.local                              # load credentials
sh publish.sh <slug> src/app/<slug>.html       # verify + publish + post-publish E2E
sh url.sh <slug>                               # look up URLs
```

Never construct URLs manually — use tool output only. On failure: read error, fix source, retry.

## Verification

`publish.sh` runs automatically: **Nous** (static analysis) → **Qed** (headless execution) → **MCP test specs** (if `.test.json` exists) → publish → **post-publish E2E** (live URL + MCP schema + sentinel errors).

## E2E Test Specs

**Always generate `<slug>.test.json` alongside `<slug>.html`.** It runs automatically on publish.

**Use `createStore` for testability** — store actions become MCP-callable tools. Raw signals with DOM handlers are not testable by novoid-browser.

```js
// Testable: store actions are callable
const calc = Novoid.createStore(
  { count: 0 },
  { inc(s) { return { count: s.count + 1 }; } }
);
```

```json
{
  "steps": [
    { "action": "read", "resource": "count", "assert": { "eq": 0 } },
    { "action": "call", "tool": "inc", "then": { "read": "count", "assert": { "eq": 1 } } }
  ]
}
```

**Step types:** `read` (check state), `call` (invoke store action), `push` (simulate Convex update).
**Assertions:** `eq`, `length`, `contains`, `matches`.
**Resource names:** Use store state keys directly (`count`, `display`), not `store_0.count`.

## MCP Endpoint

Every published app with a browser schema automatically gets an MCP interface:

```
GET  /mcp/:slug   → JSON manifest (tools, resources, state)
POST /mcp/:slug   → MCP JSON-RPC (Streamable HTTP transport)
```

## Agent Ecosystem

no∅ ships two first-party agents that demonstrate the platform's full capabilities:

- **Nex** — Multi-channel AI agent (web + Telegram) with hybrid RAG memory, persona system, inline app generation, heartbeat pipeline with approval gates, and the surgeon concurrency model. Chat with it — it remembers, builds, and publishes. Worker: `nex-watch.js`.
- **Vox** — Voice/text-driven app builder. Describe what you want, Vox generates a full novoid app, runs it through 4-phase verification, and publishes it live. Proposal-based: review before it ships.

Both are novoid apps themselves — same reactive core, same Convex platform, same publish pipeline. Self-hosting agents that build self-hosting apps.

## Agent SEO

- **`AGENTS.md`** (this file) — discoverable at repo root, follows the standard pattern
- **`llms.txt`** — served at `/llms.txt` via Convex HTTP routes
- **`robots.txt`** — served at `/robots.txt` via Convex HTTP routes
- **Content negotiation** — `Accept: application/json` on HTTP routes returns structured data
- **MCP endpoints** — every published app gets `/mcp/:slug` automatically
- **Skills directory** — `skills/` with codified knowledge for agents that clone the repo

## For Agent Developers

This file follows the [AGENTS.md pattern](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals): compressed knowledge always in context outperforms on-demand skill retrieval (100% vs 79% pass rate). Essential API is inlined so agents never decide *when* to look things up. Deeper knowledge is codified in `skills/`.
