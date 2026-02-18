# novoid-core

Codified knowledge for the no∅ reactive core. This file replaces reading `src/core.js` and the Core.js section of `spec.md`.

## Loading

```html
<link rel="stylesheet" href="../css/core.min.css">
<script src="../js/core.min.js"></script>
```

CSS prefix: `nv-` classes, `--nv-` variables. JS global: `Novoid`.

---

## signal(initial, name?) → [getter, setter]

```js
const [count, setCount] = Novoid.signal(0, 'count');
count();              // read — ALWAYS call as function
setCount(5);          // set directly
setCount(n => n + 1); // updater function
count.peek();         // read without tracking (no dependency)
count.subscribe(fn);  // manual subscribe → returns unsubscribe fn
count.signalName;     // 'count'
```

**Rules:**
- Getter is a function. `count()` not `count`. This is the core API contract.
- Always pass a name. Named signals produce semantic MCP resource names (`count` vs `signal_0`).
- Setter skips update if `Object.is(old, new)` — no wasted re-renders on same value.
- Updater functions receive current value: `setCount(n => n + 1)`.

## computed(fn) → getter

```js
const double = Novoid.computed(() => count() * 2);
double(); // reactive derived value, auto-tracks dependencies
```

Internally creates a signal + effect. Getter is callable like a signal.

## effect(fn, deps?) → dispose

```js
const dispose = Novoid.effect(() => {
  console.log(count()); // auto-tracks count
  return () => cleanup(); // optional cleanup returned
});
dispose(); // manual teardown
```

- Auto-tracks any signal read inside `fn`.
- Optional `deps` parameter: `effect(fn, () => [dep1(), dep2()])` — only re-runs when deps change (shallow `Object.is` comparison).
- Cleanup function runs before each re-execution and on dispose.

## batch(fn)

```js
Novoid.batch(() => { setA(1); setB(2); }); // subscribers notified once
```

Defers all signal notifications until `fn` completes. Deduplicated — each subscriber fires at most once.

---

## h(tag, attrs?, ...children) → HTMLElement

```js
Novoid.h('div', { class: 'nv-card' },
  Novoid.h('h2', {}, 'Title'),
  Novoid.h('p', {}, () => count()), // reactive text node
);
```

### Attribute reference

| Attr | Type | Behavior |
|---|---|---|
| `class` / `className` | string or `() → string` | Static or reactive class |
| `style` | object or `() → object/string` | Static or reactive style |
| `on*` (onClick, onInput...) | function | Event listener (lowercased) |
| `ref` | `{current}` | Sets `ref.current = el` |
| `html` | string or `() → string` | innerHTML (auto-sanitized: strips script/iframe/on* attrs) |
| `show` | `() → bool` | Toggles `display: none` |
| `bind` | `[getter, setter]` | Two-way binding for inputs |
| `disabled`, `checked`, `hidden`, `readonly`, `required`, `selected`, `multiple`, `open` | bool or `() → bool` | Boolean properties (reactive) |
| any other | string or `() → string` | `setAttribute` (reactive if function) |

### Children

- Strings/numbers → text nodes
- `() → value` → reactive text (auto-updates via effect)
- `() → Node` → reactive element (replaces on change, preserves focus)
- `null`/`false` → skipped
- Nested arrays → flattened

### bind rules

- `bind: [getter, setter]` creates two-way binding.
- Place bound inputs in the render tree, **not inside `effect()` blocks**.
- Listens on `input` event, syncs `el.value` with getter.

---

## list(container, items, keyFn, renderFn)

```js
const ul = Novoid.h('ul', {});
Novoid.list(ul, todos, t => t.id, (t, i) =>
  Novoid.h('li', {}, t.text)
);
```

- Keyed reconciliation: creates, removes, reorders by key.
- Re-renders item node when item data changes (JSON deep compare).
- `items` can be a signal getter: `() => todos()`.

## when(cond, thenFn, elseFn?) → reactive fn

```js
Novoid.when(() => isLoggedIn(), () => h('p', {}, 'Hi'), () => h('p', {}, 'Login'));
```

Returns a function (use as reactive child in `h()`).

## match(value, cases) → reactive fn

```js
Novoid.match(tab, { home: () => Home(), settings: () => Settings(), default: () => NotFound() });
```

`value` can be a signal getter. Falls back to `default` case.

---

## createStore(initialState, actions?) → store

```js
const store = Novoid.createStore(
  { count: 0, name: 'App' },
  {
    inc(state) { return { count: state.count + 1 }; },
    reset() { return { count: 0 }; },
    setName(state, name) { return { name }; },
  }
);

store.get();              // read full state (signal getter)
store.set({ count: 5 });  // replace entire state
store.select('count');     // → computed getter tracking only this key
store.actions.inc();       // call action
store.actions.setName('New');
store.subscribe(fn);       // listen to changes → unsubscribe fn
```

**Critical: actions return partial state.** The framework auto-merges with `Object.assign({}, currentState, partial)`. No need to spread the full state.

**Critical: use createStore for app logic.** Store actions become MCP-callable tools and are testable by novoid-browser. Raw `onclick` handlers are not testable.

---

## mount(selector, appFn) → root

```js
Novoid.mount('#app', () => Novoid.h('div', {}, 'Hello'));
```

- Clears container, appends result of `appFn()`.
- Triggers `onMount` callbacks via `requestAnimationFrame` after layout.

## onMount(fn)

```js
Novoid.onMount(() => { /* runs after mount, after layout */ });
```

If called after mount has already happened, runs via `queueMicrotask`.

---

## Other APIs

| API | Signature | Purpose |
|---|---|---|
| `ref(init?)` | `→ {current}` | Mutable ref for DOM elements |
| `createContext(default)` | `→ {Provider, use}` | Scoped state via stack. `Provider(value, childrenFn)`, `use()` reads |
| `component(name, renderFn)` | `→ factory fn` | Named component. Adds `data-nv-component` and `data-nv-id` attrs |
| `portal(target, content)` | `→ dispose` | Render content into a different DOM target |
| `errorBoundary(renderFn, fallbackFn)` | `→ element` | Catches render errors, shows fallback |
| `suspense(asyncFn, fallback)` | `→ element` | Shows fallback while async resolves |
| `transition(el, opts)` | `→ {in, out}` | `opts: {enter: {from, to}, leave: {to}, duration}`. CSS transitions |
| `bus` | `.on(e,fn)` `.emit(e,data)` `.off(e,fn?)` | Global event bus. `on` returns unsubscribe |
| `useAsync(asyncFn)` | `→ {data, loading, error, refetch}` | Async data fetching (signals) |
| `template(html, data)` | `→ element` | `{{key}}` escaped, `{{{key}}}` raw. Values can be signal getters |
| `onError(handler)` | void | Global error handler |

## createForm(schema)

```js
const form = Novoid.createForm({
  name:  { initial: '', required: true, minLength: 2 },
  email: { initial: '', required: true, pattern: /.+@.+/, message: 'Invalid email' },
  bio:   { initial: '', maxLength: 500 },
  agree: { initial: false, validate: v => v || 'Must agree' },
});
form.fields.name    // {get, set} — bindable as [form.fields.name.get, form.fields.name.set]
form.errors.name    // {get, set} — get() returns error string or ''
form.isValid        // signal getter
form.isSubmitting   // signal getter
form.validate()     // → bool
form.handleSubmit(async data => { ... })
form.reset()
```

Schema keys per field: `initial`, `required`, `minLength`, `maxLength`, `pattern`, `message`, `validate`.

---

## Conventions

1. **Signal getters are functions:** `count()` not `count`.
2. **Name every signal:** `signal(0, 'count')`. Unnamed → `signal_0` in MCP.
3. **Script tag boundary:** HTML parser closes `<script>` on any `</script>` in content. Use `'</' + 'script>'` in JS strings. Real closing tags use literal `</script>`. `verify.sh` catches violations.
4. **CSP-enabled hosting:** `eval()`, `Function()`, `new Function()` are blocked. Use safe parsers for expressions.
5. **Raw Unicode in files:** Edit tool writes raw bytes. Use `∅` not `\u2205`, `→` not `\u2192`.
6. **Focus preservation:** The reactive DOM engine saves/restores focus across reactive updates (by element reference, id, or name).
7. **Auto-merge in stores:** Actions return partial state. Framework merges via `Object.assign({}, current, partial)`.
8. **Testable apps use createStore:** Store actions → MCP tools → testable. DOM onclick handlers are not testable.
9. **Always generate `.test.json`** alongside every app for automated E2E on publish.
10. **Avoid full-store tracking in match/when/list:** `store.get()` is a single signal — reading it inside `match`, `when`, or `list` subscribes to *every* state change. Use `store.select(key)` to extract specific keys:
    ```js
    // BAD — re-evaluates on every store change (causes focus loss in inputs)
    Novoid.match(() => store.get().mode, { ... })

    // GOOD — only re-evaluates when mode actually changes
    var mode = store.select('mode');
    Novoid.match(mode, { ... })
    ```

## Test spec format

```json
{
  "steps": [
    { "action": "read", "resource": "count", "assert": { "eq": 0 } },
    { "action": "call", "tool": "inc", "then": { "read": "count", "assert": { "eq": 1 } } },
    { "action": "call", "tool": "reset", "then": { "read": "count", "assert": { "eq": 0 } } }
  ]
}
```

| Step | Fields | Purpose |
|---|---|---|
| `read` | `resource`, `assert` | Check store state |
| `call` | `tool`, `args?`, `then?` | Invoke store action |
| `push` | `query`, `data`, `then?` | Simulate Convex update |

Assertions: `eq` (deep), `length`, `contains`, `matches`. Resource names are store state keys directly — no `store_0.` prefix.

**`contains` is shallow.** For arrays, checks `arr.includes(needle)` — does NOT deep-search into nested objects. For strings, checks `str.includes(needle)`. To test nested data, read a specific key path instead of the top-level array.
