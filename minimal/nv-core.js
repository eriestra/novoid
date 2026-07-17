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
