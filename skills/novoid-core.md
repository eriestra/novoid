# novoid-core

Codified knowledge for the no∅ reactive core. This file replaces reading `src/core.js` and the Core.js section of `spec.md`.

## Loading

```html
<link rel="stylesheet" href="../css/core.min.css">
<script src="../js/core.min.js"></script>
```

CSS prefix: `nv-` classes, `--nv-` variables. JS global: `Novoid`.

---

# novoid-core

Codified knowledge for the no∅ reactive core. Replaces reading `src/core.js`.
**Focus on building testable apps using `createStore`.**

## 1. Creating a Store (The Agentic Layer)
All app logic should live in a store. Actions return partial state which auto-merges.
**Critical:** Store actions become MCP-callable tools and are testable by novoid-browser. Raw DOM `onclick` handlers are not testable.

```js
const store = Novoid.createStore(
  { count: 0, name: 'App' },
  {
    inc(state) { return { count: state.count + 1 }; }, // returns partial state
    reset() { return { count: 0 }; },
    setName(_, name) { return { name }; }
  }
);

// Reading state
store.get();              // Returns full state object. Do NOT use directly inside effects/renders.
const count = store.select('count'); // Reactive getter tracking only 'count'. Use this in UI.

// Writing state
store.actions.inc();
```

## 2. Rendering the UI (Classic h() apps)
Use `Novoid.mount` and `Novoid.h` for classic apps without the render plugin.

```js
// 1. Get reactive signals for specific keys
const count = store.select('count');

// 2. Define reactive UI
const App = () => Novoid.h('div', { class: 'nv-card nv-p-4' },
  Novoid.h('h2', {}, 'Counter'),
  Novoid.h('p', {}, () => count()), // Must be a function to be reactive!

  // 3. Bind events to store actions
  Novoid.h('button', { 
    class: 'nv-btn nv-btn-primary', 
    onClick: () => store.actions.inc() 
  }, '+1')
);

// 4. Mount
Novoid.mount('#app', App);
```

### Important Reactivity Rules
- **Signal getters are functions:** `count()` not `count`.
- **Targeted selection:** `store.select('key')` is preferred over `store.get()` inside UI to prevent over-rendering.
- **Two-way binding:** `{ bind: [getter, setter] }` works on inputs, but place them in the render tree, not inside `effect()`.

## 3. Dynamic Lists
Use `Novoid.list` for keyed reconciliation of arrays. Do not manually map elements.

```js
const ul = Novoid.h('ul', { class: 'nv-list' });
const items = store.select('todos');

Novoid.list(ul, items,
  (t) => t.id,           // key function
  (item) => Novoid.h('li', {}, () => item().text) // item is a getter — use () => item().field for reactivity
);
```

`renderFn` receives a **getter function**, not a plain object. Each row is created once; field updates flow through the signal. Wrap field access in `() =>` for reactive text/attributes. Legacy code passing `(t) => h('li', {}, t.text)` still works — the row renders once with the initial value and is never destroyed/recreated.

## 4. Test Spec Format
Every app gets a `.test.json` testing the store APIs (not the DOM).

```json
{
  "steps": [
    { "action": "read", "resource": "count", "assert": { "eq": 0 } },
    { "action": "call", "tool": "inc", "then": { "read": "count", "assert": { "eq": 1 } } }
  ]
}
```
* `read` resource matches store state keys.
* `call` tool matches store actions.

## 5. Common Mistakes

1. **`store.get()` inside effects/renders causes over-subscription** — `store.get()` tracks the entire state object. Every signal update re-runs every effect/render that called `store.get()`, causing O(n) re-evaluations. **Always use `store.select('key')` in reactive contexts** (effects, computed, `h()` children, render sections). Reserve `store.get()` for one-shot reads inside event handlers and action bodies only.
   - Wrong: `effect(() => { const b = store.get().blocks; ... })` — subscribes to ALL state changes
   - Wrong: `h('span', {}, () => store.get().count)` — re-renders on ANY state change
   - Right: `const blocks = store.select('blocks'); effect(() => { blocks(); ... })` — only fires on `blocks` changes
   - Right: `const count = store.select('count'); h('span', {}, () => count())` — only re-renders on `count` changes
   - OK: `button.onclick = () => { const s = store.get(); ... }` — event handlers are not reactive contexts

2. **Never mutate store objects** — Store state is frozen. Mutations throw `TypeError`. Always return new objects via spread.
   - Wrong: `conv.messages.push(msg)` / `msg.content += delta`
   - Right: `{ ...conv, messages: [...conv.messages, msg] }`

3. **Use a generation counter to trigger effects on mutable nested data** — When actions mutate objects in-place (e.g. finding an item in an array and changing a property), the top-level reference doesn't change, so effects won't fire. Add a `_gen` counter to your initial state and increment it in any action that mutates nested data:
   ```js
   const store = Novoid.createStore(
     { items: [], _gen: 0 },
     {
       updateItem(state, id, text) {
         const item = state.items.find(i => i.id === id);
         if (!item) return {};
         item.text = text;
         return { _gen: state._gen + 1 };  // forces effects to re-evaluate
       }
     }
   );
   // Effect watches _gen to detect nested mutations
   const gen = store.select('_gen');
   effect(() => { gen(); saveToServer(store.get()); });
   ```

4. **`store.set()` merges like actions** — `store.set({ key: val })` merges into existing state (same as returning partial state from an action). You do not need to spread the full state. `store.set(fn)` also merges the returned object.

5. **Use `N.list` on pre-created containers** — Don't pass `N.list` as a child of `h()`.
   - Wrong: `h('div', {}, N.list(h('div'), items, ...))`
   - Right: `const c = h('div'); N.list(c, items, ...); parent.appendChild(c);`

6. **Same for `N.when`** — Use direct DOM + `N.effect` with display toggling instead of nesting `N.when` inside `h()` children.

7. **CSP blocks external APIs** — Declare needed domains via meta tag:
   ```html
   <meta name="novoid-connect" content="https://openrouter.ai https://api.stripe.com">
   ```
   The server parses this and adds the domains to `connect-src`. Only `https://` URLs are accepted. For APIs that don't support CORS, use Convex HTTP actions as a proxy.

## 6. Battle-Tested Patterns (from Blox)

These patterns emerged from building a 7,000-line block editor on novoid. They are the canonical solutions to problems every complex app hits.

### 6.1 In-place mutation to preserve DOM focus
When an action updates content inside an existing array item (e.g. editing text in a block), **mutate in-place and do NOT return the array key**. Returning a cloned array triggers `list()` to re-render the contenteditable, destroying cursor position mid-keystroke.
```js
updateContent(state, { id, content }) {
  const b = state.items.find(x => x.id === id);
  if (!b) return {};
  b.content = content;
  // No `items` key — list() sees no change, skips re-render, focus preserved
  return { _contentGen: state._contentGen + 1 };
}
```
Combine with a generation counter (`_contentGen`) so effects that care about content changes can still react.

### 6.2 Focus restoration with generation counters + double rAF
Structural actions (split, merge, add, move, undo) bump `_focusGen`. A single effect watches it and restores cursor position **after** `list()` reconciles the DOM:
```js
const focusGen = store.select('_focusGen');
let lastGen = 0;
effect(() => {
  const gen = focusGen();
  if (gen === lastGen) return;
  lastGen = gen;
  // Double rAF: first frame lets list() reconcile, second places cursor
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const s = store.get(); // Safe — inside rAF callback, outside reactive scope
    restoreCursor(s.focusId, s.focusOffset);
  }));
});
```
Key insight: `store.get()` inside a `requestAnimationFrame` callback is **outside** the effect's reactive scope — it won't cause over-subscription.

### 6.3 Menus/tooltips: `display:none` style, not `when()` or `show`
For popover UI (slash menus, dropdowns, tooltips):
- `when()` creates/destroys DOM on toggle — breaks click handler timing
- `show` attribute uses `effect()` — may flash at (0,0) before first paint
- **Use reactive `style` with `display:none`** — DOM stays mounted, position updates atomically:
```js
h('div', {
  class: 'menu',
  style: () => {
    const m = menuSignal();
    if (!m.active) return 'display:none';
    return `left:${m.x}px;top:${m.y}px`;
  },
  onMousedown: e => e.preventDefault() // Stops contenteditable blur
});
```

### 6.4 Batch multi-action updates
When a single user gesture triggers multiple store updates, wrap them in `batch()` to coalesce into one subscriber notification:
```js
batch(() => {
  store.actions.openSlash({ blockId, x, y });
  store.actions.filterSlash({ query: content.slice(1) });
  store.actions.updateContent({ id: blockId, content });
});
```

## 7. Security & Conventions
- **Naming:** Name all raw signals: `Novoid.signal(0, 'name')`.
- **Script Boundary:** Use `'</' + 'script>'` in JS strings.
- **Eval Blocked:** CSP blocks `eval`/`new Function`. Use `Novoid.template` or inline expressions.

