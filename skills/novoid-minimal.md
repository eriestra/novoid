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

## The runtime — paste these two blocks verbatim

A minimal-tier app inlines the core in a `<script>` and the styles in a `<style>`.
Both blocks below are the exact, tested source — kept in sync with
`minimal/nv-core.js` and `minimal/nv-min.css` by `minimal/sync-skill.mjs` (do not
hand-edit them here; edit the source file and re-run the sync). Copy as-is.

### Core — inline in a `<script>`, in its own tag before the app script

<!-- embed:nv-core.js:begin -->
```js
// ═══════════════════════════════════════════════════════════════════════
// no∅ minimal core — the irreducible testable runtime.
//
// Copy this whole block into a <script> tag at the top of a single-file app.
// No build, no external fetch, no framework CDN. ~2.5 KB minified.
//
// Exposes exactly the surface the test harness observes, so minimal-tier apps
// are testable with test-runner/novoid-test.mjs unchanged:
//   • signal(init, name) -> [get, set]   (get.peek, get.signalName)
//   • createStore(state, actions)        (store.get.peek, store.actions.<name>)
// Store actions become MCP tools AND test verbs — one declaration, three uses.
// ═══════════════════════════════════════════════════════════════════════
const Novoid = (() => {
  let _active = null;

  // ─── reactivity ───
  function signal(init, name) {
    let val = init;
    const subs = new Set();
    const get = () => { if (_active) { subs.add(_active); _active.deps.push(subs); } return val; };
    get.peek = () => val;
    if (name) get.signalName = name;
    const set = (nv) => {
      const r = typeof nv === 'function' ? nv(val) : nv;
      if (Object.is(val, r)) return;
      val = r;
      for (const s of [...subs]) s();
    };
    return [get, set];
  }

  function effect(fn) {
    const run = () => {
      for (const d of run.deps) d.delete(run);   // drop stale deps — no leak
      run.deps = [];
      const prev = _active; _active = run;
      try { fn(); } finally { _active = prev; }
    };
    run.deps = [];
    run();
    return run;
  }

  function computed(fn) {
    const [get, set] = signal();
    effect(() => set(fn()));
    return get;
  }

  function batch(fn) { fn(); }   // minimal: no coalescing

  // ─── store — the testable unit ───
  function createStore(initialState, actions = {}) {
    const [get, set] = signal(initialState);
    const store = {
      get,
      set(updater) {
        const v = typeof updater === 'function' ? updater(get()) : updater;
        const next = (v && typeof v === 'object' && !Array.isArray(v))
          ? Object.assign({}, get(), v) : v;
        set(next);
      },
      subscribe(fn) { return effect(() => fn(get())); },
      select(key) { return computed(() => get()[key]); },
      actions: {},
    };
    Object.defineProperty(store, 'state', { get });
    for (const [name, action] of Object.entries(actions)) {
      store.actions[name] = (...args) => {
        const partial = action(get(), ...args);          // action(state, ...args)
        if (partial && typeof partial === 'object') store.set(partial);
        return partial;
      };
    }
    return store;
  }

  // ─── DOM ───
  function appendChild(parent, child) {
    if (child == null || child === false || child === true) return;
    if (typeof child === 'function') {
      const t = document.createTextNode('');
      parent.appendChild(t);
      effect(() => { const v = child(); t.textContent = v == null ? '' : String(v); });
    } else if (Array.isArray(child)) {
      child.forEach(c => appendChild(parent, c));
    } else if (child && child.nodeType) {
      parent.appendChild(child);
    } else {
      parent.appendChild(document.createTextNode(String(child)));
    }
  }

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'class' || k === 'className') {
        if (typeof v === 'function') effect(() => { el.className = v() || ''; });
        else el.className = v || '';
      } else if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v);
      } else if (typeof v === 'function') {
        effect(() => { const r = v(); (r == null || r === false) ? el.removeAttribute(k) : el.setAttribute(k, r === true ? '' : r); });
      } else if (v != null && v !== false) {
        el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children) appendChild(el, c);
    return el;
  }

  function when(cond, thenFn, elseFn) {
    const anchor = document.createComment('when');
    const holder = document.createDocumentFragment();
    holder.appendChild(anchor);
    let cur = [];
    effect(() => {
      const parent = anchor.parentNode;
      for (const n of cur) if (n.parentNode) n.parentNode.removeChild(n);
      cur = [];
      const branch = cond() ? thenFn : elseFn;
      if (!branch || !parent) return;
      const out = branch();
      for (const n of (Array.isArray(out) ? out : [out])) {
        if (n && n.nodeType) { parent.insertBefore(n, anchor); cur.push(n); }
      }
    });
    return holder;
  }

  function list(parent, itemsFn, keyFn, renderFn) {
    let map = new Map();
    effect(() => {
      const items = itemsFn() || [];
      const next = new Map();
      const frag = document.createDocumentFragment();
      for (const it of items) {
        const k = keyFn(it);
        const node = map.get(k) || renderFn(it);
        next.set(k, node);
        frag.appendChild(node);
      }
      while (parent.firstChild) parent.removeChild(parent.firstChild);
      parent.appendChild(frag);
      map = next;
    });
    return parent;
  }

  function mount(sel, fn) {
    const root = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (root) appendChild(root, fn());
    return root;
  }

  const api = { signal, computed, effect, batch, createStore, h, when, list, mount };
  if (typeof window !== 'undefined') window.Novoid = api;
  return api;
})();
```
<!-- embed:nv-core.js:end -->

### Styles — inline in a `<style>` (or link the served `../css/nv-min.css`)

<!-- embed:nv-min.css:begin -->
```css
/* ═══════════════════════════════════════════════════════════════════════
   no∅ minimal CSS — design tokens + the essentials, light & dark.
   ~2 KB. Inline into a single-file app, or link locally. No CDN, no build.
   For a per-app subset of the FULL system instead, run shake-css.mjs.
   ═══════════════════════════════════════════════════════════════════════ */
:root {
  --nv-bg: #ffffff; --nv-surface: #f7f7f8; --nv-border: #e4e4e7;
  --nv-text: #18181b; --nv-muted: #71717a;
  --nv-primary: #4f46e5; --nv-primary-ink: #ffffff;
  --nv-radius: 10px; --nv-gap: 16px;
  --nv-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --nv-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
}
[data-theme="dark"], .nv-dark {
  --nv-bg: #0d0d10; --nv-surface: #17171b; --nv-border: #27272a;
  --nv-text: #e7e7ea; --nv-muted: #a1a1aa;
  --nv-primary: #818cf8; --nv-primary-ink: #0d0d10;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --nv-bg: #0d0d10; --nv-surface: #17171b; --nv-border: #27272a;
    --nv-text: #e7e7ea; --nv-muted: #a1a1aa;
    --nv-primary: #818cf8; --nv-primary-ink: #0d0d10;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--nv-bg); color: var(--nv-text);
  font-family: var(--nv-sans); line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  display: flex; justify-content: center; padding: 32px 20px;
}
/* layout */
.nv-container { width: 100%; max-width: 640px; }
.nv-row { display: flex; gap: var(--nv-gap); align-items: center; }
.nv-col { display: flex; flex-direction: column; gap: var(--nv-gap); }
.nv-between { justify-content: space-between; }
.nv-wrap { flex-wrap: wrap; }
/* type */
.nv-h1 { font-size: 1.9rem; font-weight: 700; letter-spacing: -.02em; margin: 0 0 4px; }
.nv-h2 { font-size: 1.3rem; font-weight: 650; letter-spacing: -.01em; margin: 0; }
.nv-muted { color: var(--nv-muted); }
.nv-mono { font-family: var(--nv-mono); }
.nv-count { font-family: var(--nv-mono); font-size: 3rem; font-weight: 700; font-variant-numeric: tabular-nums; margin: 8px 0; }
/* surfaces */
.nv-card {
  background: var(--nv-surface); border: 1px solid var(--nv-border);
  border-radius: var(--nv-radius); padding: 24px;
  display: flex; flex-direction: column; gap: var(--nv-gap);
}
/* controls */
.nv-btn {
  font: inherit; font-weight: 600; cursor: pointer;
  padding: 9px 16px; border-radius: 8px;
  border: 1px solid var(--nv-border); background: var(--nv-bg); color: var(--nv-text);
  transition: filter .12s ease, transform .06s ease;
}
.nv-btn:hover { filter: brightness(1.05); }
.nv-btn:active { transform: translateY(1px); }
.nv-btn:focus-visible { outline: 2px solid var(--nv-primary); outline-offset: 2px; }
.nv-btn-primary { background: var(--nv-primary); color: var(--nv-primary-ink); border-color: transparent; }
.nv-btn-ghost { background: transparent; }
.nv-input {
  font: inherit; width: 100%; padding: 9px 12px;
  border: 1px solid var(--nv-border); border-radius: 8px;
  background: var(--nv-bg); color: var(--nv-text);
}
.nv-input:focus-visible { outline: 2px solid var(--nv-primary); outline-offset: 1px; }
/* list items */
.nv-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; border: 1px solid var(--nv-border);
  border-radius: 8px; background: var(--nv-bg);
}
.nv-item.done .nv-item-text { text-decoration: line-through; color: var(--nv-muted); }
.nv-item-text { flex: 1; }
.nv-grow { flex: 1; }
```
<!-- embed:nv-min.css:end -->

Alternative to inlining — reference the seeded platform copies:
`<script src="../js/nv-core.js"></script>` +
`<link rel="stylesheet" href="../css/nv-min.css">`. Templates:
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

Two gotchas:
- **Derived values must live in state to be testable.** `computed()`/`select()`
  make standalone signals, not state fields, and the harness reads *state*. Compute
  derived values inside the action and merge them into the returned partial.
- **`h()` sets attributes, not properties.** A reactive `value:` on an `<input>`
  won't follow user typing — for a controlled field, drive it from a store action on
  `oninput` (`e.target.value`).

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
