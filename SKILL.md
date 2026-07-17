---
name: novoid
description: Build a live web app from a plain description using no∅'s minimal tier — one self-contained HTML file with a ~2.5 KB inline reactive core, zero build/npm/CDN. Use when asked to build a UI, app, tool, dashboard, form, calculator, or interactive page and a single portable file that just runs in a browser fits. Triggers: "build an app", "make a tool/dashboard/page", novoid, no∅.
---

# novoid — minimal tier

no∅ (novoid) is an agent-first web framework. Its **minimal tier** is a ~120-line
reactive core you paste into one HTML file — no bundler, no npm, no CDN, no server.
The output is a single file that opens in any browser and is testable headlessly.

This skill is self-contained: the exact runtime is embedded at the bottom.

## When to use

- Most apps: dashboards, tools, calculators, CRUD, forms, interactive pages.
- One self-contained HTML file, zero build.
- For declarative `sections: [...]` rendering or the 28-component CSS system, use the
  **full tier** instead (repo skills `novoid-render.md` / `novoid-css.md`).

## Build one app

1. Put `<div id="app"></div>` in `<body>`.
2. Paste the **Core** block (bottom) into its own `<script>`, then write the app in a
   **separate** `<script>` — state via `createStore`, UI via `mount` + `h`. Keep them
   separate: the core must finish defining `window.Novoid` before the app runs (and,
   in the repo, so the test harness can attach between the two).
3. Paste the **Styles** block into a `<style>` (or link `../css/nv-min.css`).
4. Save as one `.html` file. Done.

## API — six primitives + a store

```js
const [get, set] = Novoid.signal(0, 'count');   // reactive value; get.peek()
Novoid.computed(() => get() * 2);
Novoid.effect(() => { /* reaction */ });
Novoid.h(tag, attrs, ...children);                // fn children/attrs are reactive
Novoid.mount('#app', () => h(...));
Novoid.createStore(state, actions);               // action(state, ...args) → partial (merged)
```

Prefer `createStore`: each action is simultaneously the app's behavior, an MCP tool,
and a test verb. `store.state.x` reads; `store.actions.name(args)` mutates.

Two gotchas worth knowing:
- **Derived values must live in state to be testable.** The test harness reads store
  *state*; `computed()`/`select()` make standalone signals, not state fields. So
  compute derived values inside the action and merge them into the returned partial
  (e.g. `setBill: (s, v) => derive({ ...s, bill: v })` where `derive` fills in totals).
- **`h()` sets attributes, not DOM properties.** A reactive `value:` on an `<input>`
  won't follow user typing. For a controlled field, drive it from a store action on
  `oninput` (read `e.target.value`).

## Test (zero deps)

Write `<slug>.test.json`, then (in the repo):

```sh
node test-runner/novoid-test.mjs --test <slug>.test.json <slug>.html --peek
```

Each step is an object with an `action`:
- `read` → `{ "action": "read", "resource": "<name>", "assert": { … } }`
- `call` → `{ "action": "call", "tool": "<actionName>", "args": <value>, "then": { "read": "<name>", "assert": { … } } }`

`args` is passed to the action after state (a bare value, or an array for multiple
positional args). `resource`/`read` names resolve to a named signal, a `store_N`, or
a key inside any store's state. Assertions: `eq` (deep-equal the whole value),
`length`, `contains`, `matches` (substring), `eq_path` (deep-equal at dotted paths).

```json
{
  "steps": [
    { "action": "read", "resource": "count", "assert": { "eq": 0 } },
    { "action": "call", "tool": "increment", "args": 5,
      "then": { "read": "count", "assert": { "eq": 5 } } }
  ]
}
```

---

## Core — inline in a `<script>` (its own tag, before the app script)

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

## Styles — inline in a `<style>`

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

---

The runtime above is the exact, tested source, synced from `minimal/nv-core.js` and
`minimal/nv-min.css` by `minimal/sync-skill.mjs`. To install as a Claude Code skill,
copy this file to `~/.claude/skills/novoid/SKILL.md`. Full reference:
`skills/novoid-minimal.md`.
