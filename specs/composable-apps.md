# novoid — Unlimited Composable Apps

## Thesis

The single-file constraint is a feature, not a limitation. It enforces the right atom: one purpose, one store, one published URL. Complexity is composed from atoms, not crammed into a monolith.

A React/Svelte component tree is just a way to organize state and communication. novoid replaces that with:

- **Local signals** — ephemeral UI state within one app (free)
- **Convex** — reactive shared state across apps (the signal bus)
- **MCP** — explicit action invocation between apps (the event bus)
- **postMessage** — tight parent-child iframe communication (free, in-process)

The hierarchy is implicit in the data flow, not explicit in a call stack. Any app works standalone, embedded, or composed. This is the architecture to build toward.

---

## Component Tree → Composition Graph

| React/Svelte concept | novoid equivalent | Cost |
|---|---|---|
| Local state | `signal()` / `createStore()` | Zero |
| Props (read) | MCP resource on child, read by parent | Network (~100ms) |
| Events / callbacks | MCP tool on child, called by parent | Network (~100ms) |
| Context / shared state | Convex query — any app subscribes | ~50–150ms reactive |
| Derived / computed | `computed()` locally + Convex query | Zero / network |
| Lifecycle | `effect()` | Zero |
| Component tree | Canvas of apps, wired by MCP + Convex | — |
| Lazy-loaded route | Separate published app, loaded on demand | First load only |

No component tree. No prop drilling. No context providers. The data model is the architecture.

---

## Communication Channels

### 1. Local signals — within one app (zero cost)

The default. Hover, focus, open/closed, form draft, local filter/sort. Never cross the wire.

```js
const [open, setOpen] = signal(false)
const [query, setQuery] = signal('')
```

### 2. postMessage — parent ↔ iframe (zero cost, in-process)

For tight parent-child relationships where apps are co-located in the same browser tab. Already used for iframe auto-sizing. Extend to carry arbitrary signals.

```js
// Parent → child
iframe.contentWindow.postMessage({ type: 'select', id: 123 }, '*')

// Child → parent
window.parent.postMessage({ type: 'selected', id: 123 }, '*')
```

No network. Same latency as local signals. Limited to same browser session — not persistent, not multi-user.

### 3. Convex subscriptions — reactive shared state (cross-app, cross-session)

The reactive signal bus for state that genuinely needs to be shared across apps, users, or sessions. Any app subscribing to the same Convex query re-renders when the data changes.

```js
// App A writes
useMutation('selection:set')({ id: 123 })

// App B reads reactively (separate HTML file, separate JS runtime)
const selected = useQuery('selection:get')
// → re-renders whenever App A mutates. No polling.
```

Use when: multi-user, persistent, or cross-session state.
Don't use for: hover, scroll, keystrokes, or any high-frequency UI events.

### 4. MCP tools — explicit cross-app actions (audited, structured)

Every published app auto-exposes its store actions as MCP tools at `/mcp/:slug`. Apps call each other's tools for explicit, intentional operations.

```js
// App A invokes an action on App B
const res = await fetch('/mcp/inventory', {
  method: 'POST',
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: 'addItem', arguments: { id: 123, qty: 2 } }
  })
})
```

Use when: cross-app mutations that need structure, auditability, or agent orchestration.
Not for reactive state — MCP is pull, not push.

---

## Architecture Patterns

### Shell + Panels (today, no changes needed)

A coordinator app renders navigation and frames child apps. postMessage handles tight coupling. Convex handles shared state.

```
shell-app
  ├── nav (local signals)
  ├── list-view app     ← iframe, postMessage selection → shell
  ├── detail-view app   ← iframe, receives selection from shell
  └── edit-form app     ← iframe, calls Convex mutation on submit
```

All apps work standalone. The shell is just a viewport manager.

### Canvas as App-of-Apps

`nex_canvas` is already a unified inventory of all generated apps. A canvas shell app:
- Reads `nex_canvas` via Convex query
- Renders navigation linking to or embedding apps
- Acts as a portal/dashboard
- Buildable today with no framework changes

### Fragment Composition (multi-agent parallel build)

`collab.ts` already supports this. Multiple agents claim fragments, build in parallel, compose into one HTML.

```sh
npx convex run collab:createPlan '{"slug":"crm","fragments":["nav","list","detail","form"],"template":"..."}'
# Agents work in parallel
npx convex run collab:compose '{"slug":"crm","secret":"..."}'
```

Current limitation: text-based string replacement (`{{name}}`). No store composition — each fragment brings its own store, merge is HTML concatenation.

---

## What Needs to Be Built

### 1. MCP push via SSE + `$mcp` source type (ship together)

These two features are a single atomic unit. SSE makes MCP resources reactive. `$mcp` makes them declaratively consumable. Shipping `$mcp` without SSE would establish a polling pattern that conflicts with novoid's reactive model — agents would reach for it, generate polling apps, and that becomes the norm. They ship together or not at all.

#### 1a. MCP push via SSE

Extend `/mcp/:slug` to support `resources/subscribe` over Server-Sent Events. Convex reactive queries are already push-based internally; this exposes that reactivity to external consumers.

**New route: `GET /mcp/:slug/subscribe`**

```
GET /mcp/inventory/subscribe?resource=items
Accept: text/event-stream

→ 200 OK
   Content-Type: text/event-stream
   Cache-Control: no-cache

data: {"resource":"items","data":[...current snapshot...]}

# On every Convex mutation that affects the items query:
data: {"resource":"items","data":[...updated snapshot...]}
```

Server implementation:

```ts
// convex/http.ts — new SSE route
http.route({
  pathPrefix: "/mcp/",
  method: "GET",
  // matches /mcp/:slug/subscribe?resource=...
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    if (!url.pathname.endsWith('/subscribe')) return next(); // fall through to manifest handler
    const slug = url.pathname.replace('/mcp/', '').replace('/subscribe', '');
    const resource = url.searchParams.get('resource');

    // Validate slug + resource against published schema
    const page = await ctx.runQuery(internal.pages.get, { slug });
    if (!page?.schema?.resources?.[resource]) {
      return new Response('Unknown resource', { status: 404 });
    }

    // Open SSE stream — Convex HTTP actions support streaming responses
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (data) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

        // Subscribe to Convex reactive query backing this resource
        // On each change, push updated snapshot
        // ... subscription wiring via ctx.runQuery in a poll loop
        // until client disconnects (request.signal abort)
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }),
});
```

**Convex limitation:** HTTP actions cannot hold open long-lived subscriptions natively — they have a response timeout. The practical approach is a short-poll loop inside the streaming response (every ~1s), reading the Convex query result and pushing only on change (diff-based). This gives near-real-time push without requiring WebSocket infrastructure. True reactive push requires a separate SSE relay service — document this tradeoff explicitly.

**CORS:** SSE responses need `Access-Control-Allow-Origin` — same as the existing MCP POST route.

#### 1b. `$mcp` source type in render sections

Declarative binding to another app's reactive MCP resource. The renderer opens an SSE subscription and maps incoming data into a store signal. No fetch logic in app code.

**Schema — `data.remote` block:**

```js
Novoid.render('#app', store, {
  data: {
    queries: { /* local Convex queries */ },
    remote: {
      // key becomes the $mcp.key expression
      inventory: {
        type: 'mcp',
        slug: 'inventory-app',    // published novoid app slug
        resource: 'items',        // resource name from that app's MCP schema
      },
      prices: {
        type: 'mcp',
        slug: 'pricing-app',
        resource: 'currentPrices',
      },
    },
  },
  sections: [
    { table: { source: '$mcp.inventory', columns: [...] } },
    { metrics: { items: [{ label: 'Price', value: '$mcp.prices.unitPrice' }] } },
  ],
});
```

**Runtime behavior:**

1. On mount, renderer reads `data.remote` entries.
2. For each entry, opens `GET /mcp/:slug/subscribe?resource=:resource` as an `EventSource`.
3. Incoming SSE frames are parsed and written to an internal signal (`mcpSignals[key]`).
4. `$mcp.key` expressions subscribe to that signal — standard reactive re-render on update.
5. On unmount / view change, `EventSource` is closed.

**Null safety:** `$mcp.key` is `null` until first SSE frame arrives. Use `gate: '$mcp.inventory'` to defer rendering until data is present — same pattern as `$q.ref`.

**Expression syntax:**

| Expression | Resolves to |
|---|---|
| `$mcp.inventory` | Full array/object from remote resource |
| `$mcp.prices.unitPrice` | Nested field |
| `$mcp.inventory.length` | Derived from remote array |

**Same-origin note:** When both apps are served from the same Convex deployment (`/mcp/:slug`), there's no CORS issue. Cross-deployment remotes need explicit origin configuration — document at binding time.

**Error states:** SSE connection failure surfaces as `$mcp.key` staying `null`. Render sections already handle null via `gate` and `loading: 'skeleton'`. No new error API needed.

**What this replaces:** Any `fetch('/mcp/...')` inside a store action that was being used to read another app's state. That pattern is now an anti-pattern — use `data.remote` instead.

**Priority: High — ship SSE and `$mcp` together.**

### 3. Fragment store namespacing

When multiple fragments compose into one app, their `createStore` calls must not collide. Fragments declare a store namespace; the compose step merges them.

```js
// Fragment A
const store = createStore({ items: [] }, actions, 'inventory')

// Fragment B
const store = createStore({ selected: null }, actions, 'selection')

// Composed app has both: store.inventory, store.selection
// Actions are namespaced: inventory.addItem, selection.select
```

Requires changes to `createStore`, Nous (to understand namespaced stores), and `collab:compose`.

**Priority: Medium.** Needed for true multi-agent parallel composition.

### 4. Conditional fragment slots

Fragment template supports conditional and repeated slots:

```html
<!-- Template -->
<div id="app">
  {{nav}}
  {{#if hasSearch}}{{search}}{{/if}}
  {{#each panels as panel}}{{panel}}{{/each}}
  {{footer}}
</div>
```

Plan declares which slots are conditional, which are repeated. Compose evaluates at assembly time.

**Priority: Medium.** Makes fragment composition flexible enough for real SaaS apps.

### 5. Lazy-loaded views

Currently all render sections load upfront. For large apps (50+ views), only the active view should hydrate.

```json
{
  "views": [
    { "name": "dashboard", "eager": true },
    { "name": "reports", "lazy": true, "loadOn": "navigate" },
    { "name": "settings", "lazy": true, "loadOn": "navigate" }
  ]
}
```

Lazy views are rendered as empty shells until navigated to. Reduces initial JS execution and signal setup cost.

**Priority: Low.** novoid apps are fast enough today. Matters at 50+ views.

### 6. Shared component registry

A central catalog of certified reusable components (nav bars, data tables, auth forms) that fragments can reference by name rather than duplicating HTML.

```json
{
  "sections": [
    { "type": "include", "component": "nv:data-table", "version": "1.2" }
  ]
}
```

Component is fetched from the registry at compose time, inlined into the fragment. Certified via Nous + novoid-browser before listing.

**Priority: Low.** Ties into the marketplace spec (`specs/agent-economy.md`). Build after MCP push.

---

## Implementation Order

```
Phase 1 (reactive federation — ship as one unit)
  → MCP SSE route: GET /mcp/:slug/subscribe
  → $mcp source type: data.remote + EventSource + $mcp.* expressions
  → Canvas shell pattern documented as first-class pattern

Phase 2 (multi-agent composition)
  → Fragment store namespacing (createStore namespace arg + MCP tool namespacing)
  → Conditional fragment slots

Phase 3 (scale ergonomics)
  → Lazy-loaded views (API schema decision first, implementation second)

Phase 4 (network effects)
  → Shared component registry
  → Ties into marketplace (specs/agent-economy.md)
```

**Phase 1 constraint:** Do not ship `$mcp` without SSE. A polling fallback is explicitly ruled out — it would train agents to generate polling apps and conflict with novoid's reactive model. If SSE proves infeasible under Convex HTTP action timeouts, the correct fallback is a documented Convex query binding (use `data.queries` pointing at the same Convex deployment) — not polling.

---

## Cost Implications

The composable architecture does not change the cost model for correctly-structured apps.

State at the right boundary:
- Local signals → zero cost, always
- postMessage → zero cost, always
- Convex → correct cost for state that genuinely needs to cross runtimes
- MCP tools → low-frequency, explicit — cost proportional to intentional operations
- MCP SSE subscriptions → equivalent to a Convex subscription; one open connection per resource per client, not per update

The risk: overusing Convex for ephemeral state (hover, keystrokes) because it's the easiest shared channel. The framework should make local signals and postMessage so ergonomic that developers reach for them first.

`$mcp` SSE subscriptions have the same cost profile as `$q` Convex subscriptions — they're reactive streams, not repeated fetches. The `data.remote` API intentionally mirrors `data.queries` so the mental model is identical.

See `specs/cost-model.md` for full breakdown.

---

## Reference Examples

Five canonical apps that cover every communication channel and composition pattern. Build and test in this order — each one validates a distinct layer of the architecture.

---

### Example 1 — Inventory + Pricing Dashboard

**Pattern:** `$mcp` SSE source type (Phase 1 validation)

Two independent apps, one composing data from both reactively.

- **`inventory-app`** — manages stock items, exposes `items` as an MCP resource
- **`pricing-app`** — manages prices per SKU, exposes `currentPrices` as an MCP resource
- **`ops-dashboard`** — reads both via `data.remote`, joins client-side, renders a live table with unit cost

```js
Novoid.render('#app', store, {
  data: {
    remote: {
      inventory: { type: 'mcp', slug: 'inventory-app', resource: 'items' },
      prices: { type: 'mcp', slug: 'pricing-app', resource: 'currentPrices' },
    },
  },
  sections: [
    { gate: '$mcp.inventory', loading: 'skeleton' },
    { table: {
      source: '$mcp.inventory',
      columns: [
        { key: 'sku', label: 'SKU' },
        { key: 'name', label: 'Item' },
        { key: 'qty', label: 'Stock' },
        { label: 'Unit Cost', value: '$mcp.prices.unitPrice', format: 'currency' },
      ]
    }},
  ],
});
```

**What it validates:** Two concurrent SSE streams into one table. `gate:` null-safety while streams initialize. `$mcp.prices.unitPrice` nested field expression. `$mcp.inventory.length` derived from remote array.

**Channels:** `$mcp` SSE (cross-app reads), local signals (filter/sort), MCP `tools/call` (stock mutations)

---

### Example 2 — Contacts Shell (Master-Detail)

**Pattern:** postMessage + Shell + Panels (works today, no framework changes)

A coordinator app with two iframes communicating selection state via postMessage.

- **`contacts-list`** — searchable contacts table; `postMessage`s selected contact ID to parent on row click; works standalone
- **`contact-detail`** — receives contact ID via `postMessage`, fetches and renders full record; works standalone at its own URL
- **`contacts-shell`** — renders nav + both iframes side by side; routes postMessage between them

```js
// contacts-list: emit selection
window.parent.postMessage({ type: 'contact:selected', id: row.id }, '*')

// contacts-shell: route to detail
window.addEventListener('message', (e) => {
  if (e.data.type === 'contact:selected') {
    detailFrame.contentWindow.postMessage({ type: 'load', id: e.data.id }, '*')
  }
})

// contact-detail: receive and load
window.addEventListener('message', (e) => {
  if (e.data.type === 'load') store.dispatch('load', { id: e.data.id })
})
```

**What it validates:** Shell + Panels pattern with zero framework changes. postMessage as a zero-cost selection bus. Child apps that work standalone and embedded. Iframe auto-sizing.

**Channels:** postMessage (selection), Convex query (contact data per child), local signals (search input)

---

### Example 3 — Multi-Agent CRM

**Pattern:** Fragment composition via `collab.ts` (Phase 2 validation)

A single published CRM built by four agents in parallel, each owning a named fragment with a store namespace.

| Fragment | Store namespace | Responsibility |
|---|---|---|
| `nav` | — | Top nav, auth state, logo |
| `list` | `contacts` | Paginated contacts table |
| `detail` | `detail` | Contact detail panel |
| `form` | `form` | Add/edit contact form |

```sh
npx convex run collab:createPlan '{
  "slug": "crm",
  "fragments": ["nav", "list", "detail", "form"],
  "template": "<div id=\"app\">{{nav}}{{list}}{{detail}}{{form}}</div>"
}'
# Four agents build in parallel, each with their namespace
npx convex run collab:compose '{"slug":"crm","secret":"..."}'
```

```js
// Fragment: list
const store = createStore({ items: [], page: 1 }, actions, 'contacts')

// Fragment: form
const store = createStore({ draft: {}, errors: {} }, actions, 'form')

// Composed MCP manifest exposes: contacts.fetch, contacts.filter, form.submit, detail.select
// No collision — namespaces are enforced at createStore and surfaced in tools/list
```

**What it validates:** Store namespace non-collision in composed app. MCP manifest reflects namespaced tool names (`contacts.fetch`, not `fetch`). `collab:compose` produces a working single-file app. Agents can build in parallel without coordination.

**Channels:** Fragment composition, namespaced stores, Convex mutations (form submit)

---

### Example 4 — Live Collaboration Presence

**Pattern:** Convex as shared signal bus (correct channel boundary)

Demonstrates when Convex is the right channel — not postMessage (single session), not MCP SSE (not state that lives in an app's store).

- **`doc-editor`** — text note editor; writes `{ userId, docId, active }` to a `presence` Convex table on focus/blur
- **`presence-bar`** — subscribes to `presence` for a given `docId`; renders avatar bubbles for active users; embeddable as an iframe in any editor

```js
// doc-editor: write presence on focus/blur
document.addEventListener('focusin',  () => useMutation('presence:set')({ docId, active: true }))
document.addEventListener('focusout', () => useMutation('presence:set')({ docId, active: false }))

// presence-bar: reactive read
const active = useQuery('presence:list', { docId })
// → re-renders whenever any user's presence changes. No polling.
```

**What it validates:** Multi-user, persistent, cross-session state belongs in Convex — not postMessage. High-frequency events (keystrokes, hover, scroll) are explicitly excluded; only lifecycle events (focus/blur) write to Convex. A reference for any collaborative feature.

**Channels:** Convex reactive query (presence), local signals (editor draft), postMessage (iframe height from presence-bar to parent)

---

### Example 5 — Agent Task Monitor

**Pattern:** Full Phase 1 integration — `$mcp` reactive reads + MCP `tools/call` mutations in one app

An ops interface that reads two apps reactively and mutates one via MCP tool calls — the agentic composition pattern. Can double as a real Nex job monitor.

- **`job-queue`** — manages async jobs (`pending → claimed → building → completed`); exposes MCP tools: `enqueue`, `cancel`, `retry`; exposes MCP resource: `jobs`
- **`worker-status`** — per-worker health metrics; exposes MCP resource: `workers`
- **`task-monitor`** — reads both reactively, renders live ops dashboard; action buttons call `job-queue` tools directly

```js
Novoid.render('#app', store, {
  data: {
    remote: {
      jobs: { type: 'mcp', slug: 'job-queue', resource: 'jobs' },
      workers: { type: 'mcp', slug: 'worker-status', resource: 'workers' },
    },
  },
  sections: [
    { metrics: { columns: 3, items: [
      { label: 'Pending', value: '$mcp.jobs.length', color: 'yellow' },
      { label: 'Active Workers', value: '$mcp.workers.length', color: 'green' },
    ]}},
    { table: {
      source: '$mcp.jobs',
      columns: [
        { key: 'id', label: 'Job' },
        { key: 'status', label: 'Status' },
        { key: 'worker', label: 'Worker' },
      ],
      actions: [
        { label: 'Cancel', action: 'cancelJob' },
        { label: 'Retry', action: 'retryJob' },
      ],
    }},
  ],
});

// Store actions call job-queue MCP tools
const actions = {
  cancelJob: async (state, { id }) => {
    await fetch('/mcp/job-queue', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call',
        params: { name: 'cancel', arguments: { id } } })
    })
  },
  retryJob: async (state, { id }) => {
    await fetch('/mcp/job-queue', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call',
        params: { name: 'retry', arguments: { id } } })
    })
  },
}
```

**What it validates:** Full Phase 1 surface — `$mcp` SSE for reactive reads, MCP `tools/call` for mutations, both in the same app. Two concurrent SSE streams. Row actions that trigger cross-app mutations. The complete round-trip: read state reactively → mutate via tool → SSE pushes updated state back.

**Channels:** `$mcp` SSE (reactive reads), MCP `tools/call` (mutations), local signals (status filter)

---

### Coverage Matrix

| Example | Local signals | postMessage | Convex | `$mcp` SSE | MCP tools/call | Fragment compose |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| 1. Inventory + Pricing | ✓ | | | ✓ | ✓ | |
| 2. Contacts Shell | ✓ | ✓ | ✓ | | | |
| 3. Multi-Agent CRM | ✓ | | ✓ | | | ✓ |
| 4. Collaboration Presence | ✓ | ✓ | ✓ | | | |
| 5. Task Monitor | ✓ | | | ✓ | ✓ | |

Examples 2 and 4 are buildable today. Examples 1 and 5 require Phase 1. Example 3 requires Phase 2.

---

## Relationship to Other Specs

| Spec | Relationship |
|---|---|
| `specs/cost-model.md` | Cost implications of each communication channel; SSE subscription cost model |
| `specs/agent-economy.md` | Shared component registry → marketplace |
| `specs/novoid-commercial-ecosystem.md` | Per-org metering applies to MCP tool calls and SSE subscriptions between apps |
| `specs/nex-vox-ecosystem.md` | Nex canvas + fragment composition are the agent-facing surface |
| `skills/novoid-agents.md` | Inline apps are the first form of composition (embed in chat) |
| `skills/novoid-render.md` | `data.remote` block and `$mcp.*` expression spec lives here once implemented |
