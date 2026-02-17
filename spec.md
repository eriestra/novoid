# no∅ — spec

> Axiomatic reference. One example per API. Zero tutorials.

## Loading

```html
<!-- Core only -->
<link rel="stylesheet" href="../css/core.min.css">
<script src="../js/core.min.js"></script>

<!-- With plugins (order matters) -->
<script src="../js/router.min.js"></script>
<script src="../js/convex.min.js"></script>
<script src="../js/auth.min.js"></script>    <!-- requires convex -->
<script src="../js/toast.min.js"></script>
<script src="../js/render.min.js"></script>  <!-- declarative UI -->

```

CSS prefix: `nv-` classes, `--nv-` variables. JS global: `Novoid`.

---

## Core.js API

### signal(initial, name?) → [getter, setter]
```js
const [count, setCount] = Novoid.signal(0, 'count');
count();           // read (call as function!)
setCount(5);       // set
setCount(n => n+1); // updater
count.peek();      // read without tracking
count.subscribe(fn); // manual subscribe → unsubscribe fn
count.signalName;  // 'count' (if name was provided)
```
**Named signals** produce semantic names in tooling and debugging. Always pass a name for signals in published apps.

### computed(fn) → getter
```js
const double = Novoid.computed(() => count() * 2);
double(); // reactive derived value
```

### effect(fn, deps?) → dispose
```js
const dispose = Novoid.effect(() => {
  console.log(count()); // auto-tracks count
  return () => cleanup(); // optional cleanup
});
dispose(); // manual teardown
```

### batch(fn)
```js
Novoid.batch(() => { setA(1); setB(2); }); // single re-render
```

### h(tag, attrs?, ...children) → HTMLElement
```js
Novoid.h('div', { class: 'nv-card' },
  Novoid.h('h2', {}, 'Title'),
  Novoid.h('p', {}, () => count()), // reactive text
);
```
**Attrs:** `class`/`className`, `style` (object or fn), `on*` events, `ref`, `html`, `show`, `bind`, boolean attrs (`disabled`, `checked`, `hidden`, `readonly`, `required`, `selected`, `open`).

**bind** (two-way): `{ bind: [getter, setter] }` — create bound inputs at component scope, outside `effect()` blocks.

### list(container, items, keyFn, renderFn)
```js
Novoid.list(ul, todos, t => t.id, t =>
  Novoid.h('li', {}, t.text)
);
```

### when(cond, thenFn, elseFn?) → reactive fn
```js
Novoid.when(() => isLoggedIn(), () => h('p', {}, 'Hi'), () => h('p', {}, 'Login'));
```

### match(value, cases) → reactive fn
```js
Novoid.match(tab, { home: () => HomePage(), settings: () => Settings(), default: () => NotFound() });
```

### mount(selector, appFn) → root
```js
Novoid.mount('#app', () => Novoid.h('div', {}, 'Hello'));
```

### onMount(fn)
```js
Novoid.onMount(() => { /* runs after mount() */ });
```

### Other core
| Function | Signature | Purpose |
|---|---|---|
| `ref(init?)` | `→ {current}` | DOM ref |
| `createContext(default)` | `→ {Provider, use}` | Scoped state |
| `createStore(state, actions?)` | `→ {get, set, subscribe, actions}` | Global state (actions auto-merge partial returns) |
| `component(name, renderFn)` | `→ factory fn` | Named components |
| `portal(target, content)` | `→ dispose` | Render elsewhere |
| `errorBoundary(renderFn, fallbackFn)` | `→ element` | Error catching |
| `suspense(asyncFn, fallback)` | `→ element` | Async loading |
| `transition(el, opts)` | `→ {in, out}` | Animations |
| `bus` | `.on(e,fn)` `.emit(e,data)` `.off(e,fn?)` | Event bus |
| `createForm(schema)` | `→ {fields, errors, validate, handleSubmit, reset}` | Form handling |

#### createForm schema
```js
const form = Novoid.createForm({
  name:  { initial: '', required: true, minLength: 2 },
  email: { initial: '', required: true, pattern: /.+@.+/, message: 'Invalid email' },
  bio:   { initial: '', maxLength: 500 },
  agree: { initial: false, validate: v => v || 'Must agree' },
});
// form.fields.name → [getter, setter] (bindable)
// form.errors.name() → error string or ''
// form.handleSubmit(data => { ... })
```
Schema keys per field: `initial`, `required`, `minLength`, `maxLength`, `pattern`, `message`, `validate`.
| `useAsync(asyncFn)` | `→ {data, loading, error, refetch}` | Async data |
| `template(html, data)` | `→ element` | Template strings |
| `onError(handler)` | void | Global error handler |

---

## Plugin: Render (`src/plugins/render.js`)

Declarative UI — describe sections, the renderer owns all DOM, CSS, layout. Apps contain zero `h()` calls.

```js
Novoid.render('#app', store, {
  app: { name: 'My App', theme: 'dark', locale: 'es-MX' },
  sections: [
    { metrics: { columns: 4, items: [
      { label: 'Total', value: '$totalCost', format: 'currency', color: 'teal' }
    ]}},
    { table: { title: 'Items', source: '$items', columns: [
      { key: 'name', label: 'Name' },
      { key: 'cost', label: 'Cost', format: 'currency' }
    ]}},
    { cards: { title: 'Cards', source: '$items', template: {
      title: '$item.name', grid: [
        { label: 'Cost', value: '$item.cost', format: 'currency' }
      ]
    }}}
  ]
});
```

**Sections:** `metrics`, `table`, `cards`, `form`, `chart`, `stat`, `header`, `row`, `list`, `empty`, `divider`.
**Reactive expressions:** `$key` (store state), `$item.key` (card/list item), `$row.key` (table row).
**Formats:** `currency`, `kwh`, `rate`, `percent`, `number`, `date`, `datetime`, `timeAgo`, `bytes`, `duration`, `{ template: "{} units" }`.

`createStore` actions return **partial state** — auto-merged with current state. No need to spread the full state object.

Full spec: `render.md`.

---

## Plugin: Router (`src/plugins/router.js`)

```js
const { navigate, currentRoute } = Novoid.createRouter([
  { path: '/', component: () => Home() },
  { path: '/user/:id', component: ({ params }) => User(params.id) },
  { path: '*', component: () => NotFound() },
], container);

const link = Novoid.link('Home', '/', 'nv-btn');
navigate('/about');
```
Route guards: `{ guard: () => bool, redirect: '/login' }`.

---

## Plugin: Convex (`src/plugins/convex.js`)

```js
const db = Novoid.createClient(CONVEX_URL);
const { data, loading, error } = Novoid.useQuery(db, 'tasks:list', { orgId: '123' });
const addTask = Novoid.useMutation(db, 'tasks:add');
await addTask({ text: 'New task' }); // addTask.isLoading, addTask.error
const run = Novoid.useAction(db, 'ai:chat');
await run({ prompt: 'Hello' }); // run.isLoading, run.error
```

**useQuery skip:** pass `'skip'` as args to disable subscription.
**useQuery reactive args:** `Novoid.useQuery(db, 'ref', () => ({ id: selectedId() }))`.

### useAI(client, actionRef)
```js
const send = Novoid.useAI(db, 'ai:chat');
await send({ prompt: 'Hi' });
send.response(); send.isLoading(); send.history(); send.clear();
```

### useAuth / useConnectionState
```js
const { isAuthenticated, isLoading, logout } = Novoid.useAuth(db, fetchTokenFn);
const connState = Novoid.useConnectionState(db); // → 'connected' | 'connecting' | ...
```

---

## Plugin: Auth (`src/plugins/auth.js`)

```js
const auth = Novoid.useNovoidAuth(db);
auth.user(); auth.isAuthenticated(); auth.isLoading(); auth.error();
await auth.register(email, password, name);
await auth.login(email, password);
await auth.logout();
auth.getToken();

const org = Novoid.useOrg(db, auth);
org.orgs(); org.currentOrg(); org.currentRole(); org.switchOrg(id);
```

---

## Plugin: Toast (`src/plugins/toast.js`)

```js
Novoid.toast.info('Saved');
Novoid.toast.success('Done');
Novoid.toast.danger('Error');
Novoid.toast.warning('Careful', 5000); // custom duration
```

---

## CSS Reference

### Core (`src/core.css`)
**Variables:** `--nv-primary-{50-900}`, `--nv-gray-{50-900}`, `--nv-success|warning|danger|info-{50,500,700}`, `--nv-bg`, `--nv-bg-subtle`, `--nv-bg-muted`, `--nv-text`, `--nv-text-muted`, `--nv-text-subtle`, `--nv-border`, `--nv-border-strong`, `--nv-ring`, `--nv-font-sans|mono|display`, `--nv-text-{xs-6xl}`, `--nv-space-{0-24}`, `--nv-radius-{none-full}`, `--nv-shadow-{xs-2xl}`, `--nv-z-{base,dropdown,sticky,overlay,drawer,modal,popover,toast}`.

**Dark:** `[data-theme="dark"]` or `.nv-dark`.

**Typography:** `.nv-h1`–`.nv-h6`, `.nv-text-{xs-6xl}`, `.nv-font-{light,normal,medium,semibold,bold,black}`, `.nv-font-{sans,mono,display}`, `.nv-text-{left,center,right}`, `.nv-truncate`, `.nv-line-clamp-{2,3}`.

**Colors:** `.nv-text-{primary,muted,subtle,success,warning,danger,info,white}`, `.nv-bg-{primary,subtle,muted,success,warning,danger,info,white}`.

**Layout:** `.nv-container`, `.nv-grid`, `.nv-cols-{1-6,12}`, `.nv-col-span-{1-12,full}`, `.nv-flex`, `.nv-stack`, `.nv-items-{start,center,end}`, `.nv-justify-{start,center,end,between}`.

**Spacing:** `.nv-p-{0-12}`, `.nv-px-{0-8}`, `.nv-py-{0-8}`, `.nv-m-{0-4,auto}`, `.nv-mt-{0-8}`, `.nv-mb-{0-8}`, `.nv-gap-{0-8}`.

**Misc:** `.nv-border`, `.nv-rounded{-sm,-lg,-xl,-full}`, `.nv-shadow{-xs,-sm,-lg,-xl}`, `.nv-hidden`, `.nv-relative`, `.nv-absolute`, `.nv-fixed`, `.nv-sticky`, `.nv-transition`, `.nv-sr-only`.

### Components (`src/components.css`)
| Component | Classes |
|---|---|
| Button | `.nv-btn` `.nv-btn-{primary,secondary,success,danger,warning,ghost,outline,link}` `.nv-btn-{sm,lg,xl,icon,block,pill}` `.nv-btn-group` |
| Card | `.nv-card` `.nv-card-{elevated,header,body,footer,hoverable}` |
| Form | `.nv-label` `.nv-input` `.nv-select` `.nv-textarea` `.nv-checkbox` `.nv-radio` `.nv-field` `.nv-input-{sm,lg,error,success}` `.nv-input-group` `.nv-input-addon` `.nv-toggle` |
| Table | `.nv-table` `.nv-table-{striped,hover,compact}` |
| Badge | `.nv-badge` `.nv-badge-{primary,success,warning,danger,info,neutral}` `.nv-badge-{dot,lg}` |
| Alert | `.nv-alert` `.nv-alert-{info,success,warning,danger}` `.nv-alert-title` |
| Navbar | `.nv-navbar` `.nv-navbar-{brand,nav,link,sticky}` |
| Tabs | `.nv-tabs` `.nv-tab` `.nv-tab-panel` `.nv-tabs-pill` |
| Modal | `.nv-modal-overlay` `.nv-modal` `.nv-modal-{header,title,body,footer,close,sm,lg,xl}` |
| Drawer | `.nv-drawer-overlay` `.nv-drawer` `.nv-drawer-{left,right,header,title,body,footer,close,sm,lg,xl}` |
| Dropdown | `.nv-dropdown` `.nv-dropdown-{menu,item,divider,right}` |
| Toast | `.nv-toast-container` `.nv-toast` `.nv-toast-{success,danger,warning}` |
| Other | `.nv-spinner{-sm,-lg}`, `.nv-skeleton`, `.nv-avatar{-sm,-lg,-xl}`, `.nv-progress`, `.nv-breadcrumb`, `.nv-pagination`, `.nv-divider`, `.nv-tag`, `.nv-tooltip`, `.nv-popover`, `.nv-accordion`, `.nv-code`, `.nv-pre`, `.nv-prose` |

**Active state:** `.nv-active` toggles visibility on modals, drawers, dropdowns, tabs.

**Animations:** `.nv-animate-{fade-in,fade-up,fade-down,scale-in,slide-right,slide-left,bounce,pulse}`, `.nv-delay-{100-500}`.

**Responsive:** `.nv-{sm,md,lg}-cols-{2-6}`, `.nv-hide-sm`, `.nv-hide-below-lg`.

---

## Publishing

```sh
sh publish.sh <slug> src/app/<slug>.html
```

This runs verification (Nous + novoid-browser), publishes to Convex, and runs post-publish E2E. On success it prints the live URL and MCP URL.

**MCP test specs:** place `<slug>.test.json` next to `<slug>.html` to auto-run behavioral assertions on publish (Phase 3).

---

## E2E Test Specs

**Always generate a `.test.json` for every app.** Runs automatically on publish (~8ms for 20 tests).

### Testability requirement

Use `createStore` instead of raw signals for app logic. Store actions become MCP-callable tools; raw DOM `onclick` handlers are not testable.

```js
// ✓ Testable — actions are callable by novoid-browser
const store = createStore(
  { count: 0 },
  { inc(s) { return { count: s.count + 1 }; }, reset() { return { count: 0 }; } }
);

// ✗ Not testable — logic is inside DOM handler
button.onclick = () => setCount(count() + 1);
```

### Test spec format
```json
{
  "steps": [
    { "action": "read", "resource": "count", "assert": { "eq": 0 } },
    { "action": "call", "tool": "inc", "then": { "read": "count", "assert": { "eq": 1 } } },
    { "action": "call", "tool": "reset", "then": { "read": "count", "assert": { "eq": 0 } } }
  ]
}
```

### Steps

| Step | Purpose | Fields |
|---|---|---|
| `read` | Check state | `resource`, `assert` |
| `call` | Invoke store action | `tool`, `args` (optional), `then` (optional: `read` + `assert`) |
| `push` | Simulate Convex update | `query`, `data`, `then` (optional) |

### Assertions

| Field | Check |
|---|---|
| `eq` | Deep equality |
| `length` | Array length |
| `contains` | Array includes value or string contains substring |
| `matches` | String pattern match |

### Resource names

Use store state keys directly: `count`, `display`, `tasks`. Do **not** prefix with `store_0.` — the test harness resolves keys from any store automatically.

### Seed data

Pre-populate Convex queries for apps that depend on backend data:
```json
{ "seed": { "tasks:list": [{"id": "1", "text": "Buy milk"}] }, "steps": [...] }
```

---

## Notes

1. **Signal getters are functions:** `count()` not `count` — this is the core API contract
2. **Signals are named:** `signal(0, 'count')` — names improve debugging and tooling. Nous warns on unnamed signals.
3. **Script tag boundary:** The HTML parser closes `<script>` when it sees `</script>` anywhere — even inside a JS string. Use `'</' + 'script>'` for the string. Actual HTML closing tags use the real `</script>` (backslash-escaping breaks HTML parsing). verify.sh catches this as a runtime error.
4. **Convex hosting is CSP-enabled:** `eval()`, `Function()`, and `new Function()` are blocked. Arithmetic and expression evaluation use safe parsers (tokenizer + recursive descent).
5. **File edits write raw bytes:** Unicode escape sequences like `\u2205` in Edit tool calls become literal backslash characters on disk. Use the actual character directly: `∅`, `→`, `×`.

---

## MCP Endpoint

Every published app with a browser schema automatically gets an MCP (Model Context Protocol) interface:

```
GET  /mcp/:slug   → JSON manifest (tools, resources, state, navigation)
POST /mcp/:slug   → MCP JSON-RPC (Streamable HTTP transport)
```

**Tools** — Convex mutations and actions become executable MCP tools, store actions become schema-only tools:
```json
{"name": "mutation:tasks:create", "description": "Convex mutation: tasks:create"}
{"name": "action:ai:chat", "description": "Convex action: ai:chat"}
{"name": "addTask", "description": "Client store action: addTask on store_0"}
```

**Resources** — signals/stores become snapshot resources, Convex queries become live-readable:
```
novoid://<slug>/state/<name>      → signal/store value (snapshot)
novoid://<slug>/entity/<path>     → entity collection + schema
novoid://<slug>/query/<ref>       → live Convex query (runs server-side)
```

**JSON-RPC methods:** `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`.

**Auth** — mutations and actions require `Authorization: Bearer <PUBLISH_SECRET>`. The secret is auto-injected into function args. Queries and snapshot resources are public.

**Static detection** — for apps with placeholder URLs (e.g. `__CONVEX_URL__`), `verify.sh` statically extracts `useMutation`/`useAction`/`useAI` refs from source and injects them into the schema.

**Zero configuration** — the schema is extracted by novoid-browser at publish time. Named signals (`signal(val, 'name')`) produce semantic resource names instead of `signal_0`.

**MCP test harness** — novoid-browser can run behavioral test specs using MCP semantics:
```sh
novoid-browser --test counter.test.json src/app/counter.html --peek
```
Test specs define steps: `read` (resources/read), `call` (tools/call), `push` (Convex update), with assertions (`eq`, `length`, `contains`, `matches`). Place `<slug>.test.json` next to `<slug>.html` for automatic Phase 3 verification on publish.

**Raw endpoint** — `GET /raw/:slug` serves page HTML without sentinel injection or cache-busting, enabling novoid-browser to fetch and execute remote apps:
```sh
novoid-browser https://site.convex.site/raw/counter --peek
```
