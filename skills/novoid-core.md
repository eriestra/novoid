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

1. **`store.get()` or `store.state`, not `store.state.x` directly** — `store.state` is an alias for `store.get()` and returns the full state object. Use `store.get().field` or `store.state.field`. Use `store.select('field')` for reactive UI bindings.

2. **Never mutate store objects** — Store state is frozen. Mutations throw `TypeError`. Always return new objects via spread.
   - Wrong: `conv.messages.push(msg)` / `msg.content += delta`
   - Right: `{ ...conv, messages: [...conv.messages, msg] }`

3. **Use `N.list` on pre-created containers** — Don't pass `N.list` as a child of `h()`.
   - Wrong: `h('div', {}, N.list(h('div'), items, ...))`
   - Right: `const c = h('div'); N.list(c, items, ...); parent.appendChild(c);`

4. **Same for `N.when`** — Use direct DOM + `N.effect` with display toggling instead of nesting `N.when` inside `h()` children.

5. **CSP blocks external APIs** — Declare needed domains via meta tag:
   ```html
   <meta name="novoid-connect" content="https://openrouter.ai https://api.stripe.com">
   ```
   The server parses this and adds the domains to `connect-src`. Only `https://` URLs are accepted. For APIs that don't support CORS, use Convex HTTP actions as a proxy.

## 6. Security & Conventions
- **Naming:** Name all raw signals: `Novoid.signal(0, 'name')`.
- **Script Boundary:** Use `'</' + 'script>'` in JS strings.
- **Eval Blocked:** CSP blocks `eval`/`new Function`. Use `Novoid.template` or inline expressions.

