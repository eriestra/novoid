# novoid-minimal — the minimal tier

The smallest no∅: a **single self-contained HTML file**, zero build, zero CDN,
zero framework fetch — still testable with the standard `.test.json` harness.
Prefer this tier for most apps. Reach for the full tier (`render.js` + component
sheet) only when an app needs declarative tables/forms/panels.

## When to use which tier

- **Minimal (this skill):** dashboards, tools, calculators, CRUD, anything you'd
  build with signals + `h()`. One file, ~2.5 KB core. Default.
- **Full (`novoid-core.md` + `novoid-render.md`):** when you want declarative
  `sections: [...]` rendering, the 28-component CSS system, or plugins
  (router/auth/convex). Opt in per app.

## The core (copy verbatim)

Two ways to include it:

1. **Self-contained** (recommended) — paste `nv-core.js` into a `<script>` and
   `nv-min.css` into a `<style>`. The file opens anywhere, no server.
2. **Platform assets** — reference the seeded copies:
   `<link rel="stylesheet" href="../css/nv-min.css">` and
   `<script src="../js/nv-core.js"></script>`. Served from Convex like
   `core.min.js`/`core.min.css`.

Source of truth: `minimal/nv-core.js`, `minimal/nv-min.css`. Templates:
`minimal/counter.html` (self-contained), `minimal/todos.html` (platform assets).

## API — six primitives + a store

```js
const [get, set] = Novoid.signal(0, 'count');  // reactive value; get.peek(); name it
Novoid.computed(() => get() * 2);               // derived signal
Novoid.effect(() => { ... });                   // reaction; auto-drops stale deps
Novoid.h(tag, attrs, ...children);              // element; fn children/attrs are reactive
Novoid.mount('#app', () => h(...));             // attach to a mount node
Novoid.createStore(state, actions);             // the testable unit ↓
// nv-core.js also ships: when(cond, thenFn, elseFn), list(parent, itemsFn, keyFn, renderFn)
```

- Function children/attrs are reactive: `h('p', {}, () => count())` re-renders on change.
- `class`/`className` accept a string or a `() => string`.

## createStore — one declaration, three uses

A store action is simultaneously the app's behavior, its **MCP tool**, and its
**test verb**. Actions take `(state, ...args)` and return a partial state that is
auto-merged (`Object.assign`).

```js
const store = Novoid.createStore({ count: 0 }, {
  increment: (s) => ({ count: s.count + 1 }),
  setTo:     (s, args) => ({ count: args.value }),
});
store.actions.increment();               // in the app
store.state.count;                        // read current state
```

The test harness reads `store.get.peek()` and calls `store.actions.<name>`, so
minimal-tier apps need no special wiring to be testable.

## Authoring checklist

1. `<div id="app"></div>` mount node in `<body>`.
2. Core in its **own `<script>`**, then the app in a **separate `<script>`**
   (the test harness attaches its observer between them).
3. `createStore` for state + actions; `mount` + `h` for UI.
4. Keep CSS to `nv-min.css` tokens/classes, or hand-write in a `<style>`.
5. Generate `<slug>.test.json` — read/call/push over the store (see below).

## Testing

Same rail as every no∅ app — pure JS, zero deps:

```sh
node test-runner/novoid-test.mjs --test <slug>.test.json <slug>.html --peek
```

Spec vocabulary: actions `read`/`call`/`push`; assertions `eq`, `length`,
`contains`, `matches`, `eq_path` (deep-equal at dotted paths, e.g.
`{ "0.done": true }`). `verify.sh` runs it automatically (`sh verify.sh <file>`).

```jsonc
{ "steps": [
  { "action": "read", "resource": "count", "assert": { "eq": 0 } },
  { "action": "call", "tool": "increment", "then": { "read": "count", "assert": { "eq": 1 } } }
] }
```

## Footprint

A self-contained minimal app is ~2.4 KB gzipped vs ~89 KB for a full render app
(~37×), in one file that opens directly in a browser. Publishing is unchanged:
`sh publish.sh <slug> <file>`.

## Not included by design

`render.js` (declarative sections), the 41 KB component sheet, router/auth/toast/
convex plugins. Add them back only when needed — they are the opt-in full tier,
not the entry tax. See `minimal/README.md` and `minimal/shake-css.mjs` (per-app
CSS subset from the full system).
