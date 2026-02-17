# novoid-render

Codified knowledge for the no∅ render plugin. This file replaces reading `render.md` and `src/plugins/render.js`.

## Architecture

```
store  → state + actions                    (agentic layer, testable via MCP)
render → sections + bindings + formatting   (UI layer, pattern-locked)
```

The agent writes `store` and `render`. The renderer owns all DOM, CSS, layout, transitions, and responsive behavior. Render apps contain **zero `h()` calls and zero CSS**.

## Loading

```html
<script src="../js/core.min.js"></script>
<script src="../js/render.min.js"></script>
<script>
const store = Novoid.createStore(initialState, actions);
Novoid.render('#app', store, spec);
</script>
```

---

## Reactive Expressions

Anything prefixed with `$` is reactive — the renderer auto-subscribes and updates DOM when values change.

| Expression | Source | Example |
|---|---|---|
| `$key` | Store state | `$filter`, `$count` |
| `$q.ref` | Convex query result | `$q.bills` |
| `$q.ref.field` | Nested query field | `$q.stats.totalCost` |
| `$auth.field` | Auth state | `$auth.user`, `$auth.role` |
| `$params.key` | View params | `$params.id` |
| `$row.key` | Current table row | `$row.installation` |
| `$item.key` | Current card/list item | `$item.name` |
| `$self` | Current input value | slider, text field |
| `"$a + $b"` | Inline expression | `"$price * $qty"` |

**Inline expressions** are CSP-safe (no `eval`/`new Function`). Supported operators:
- Comparison: `===`, `!==`, `==`, `!=`, `>`, `<`, `>=`, `<=`
- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Logical not: `!$flag`

Examples: `$submitted === false`, `$count > 0`, `$price * $qty`, `!$isEditing`.

**Null safety:** `$q.ref` returns `null` while loading. Use `gate: $q.ref` to wait until resolved.

---

## Sections

The complete UI vocabulary. Every visible element is one of these types.

### metrics

KPI cards in a responsive grid.

```js
{ metrics: {
  columns: 4,  // 1-6, responsive
  items: [
    { label: 'Total Cost', value: '$q.stats.totalCost', format: 'currency', color: 'teal' },
    { label: 'Savings', value: '$totalSavings', format: 'currency', color: 'green',
      trend: { value: '$q.stats.savingsPercent', format: 'percent' } },
    { label: 'Items', value: '$q.bills.length', color: 'blue' },
  ]
}}
```

Item fields: `label`, `value`, `format`, `color`, `icon`, `trend` (`{value, format}`), `spark` (`{source, key, color}`).

### table

Data table with filter, sort, pagination, row actions.

```js
{ table: {
  title: 'Invoices',
  source: '$filteredBills',
  empty: 'No results',
  loading: 'skeleton',  // skeleton | spinner
  filter: {
    key: 'status', action: 'setFilter',
    options: [
      { value: 'all', label: 'All' },
      { value: 'paid', label: 'Paid' },
    ]
  },
  sort: { default: { key: 'totalCost', dir: 'desc' }, action: 'setSort' },
  columns: [
    { key: 'name', label: 'Name', subtitle: 'period' },
    { key: 'consumption', label: 'Usage', format: 'kwh' },
    { key: 'cost', label: 'Cost', format: 'currency', bold: true },
    { key: 'status', label: 'Status', badge: true },
    { key: 'savings', label: 'Savings', format: 'currency', color: 'green', hideBelow: 'md' },
  ],
  onRowClick: { navigate: 'detail', params: { id: '$row.id' } },
  pageSize: 10,
}}
```

Column fields: `key`, `label`, `format`, `bold`, `color`, `badge` (pill style), `subtitle` (second key below), `icon`, `hideBelow` (`md`|`lg`).

### cards

Iterable card list with a template.

```js
{ cards: {
  title: 'Tariffs',
  source: '$q.tariffs',
  empty: 'No tariffs',
  select: { bind: '$selectedTariff', action: 'selectTariff', arg: 'id' },
  actions: [  // header-level buttons
    { label: 'Add', action: 'create', icon: 'plus', style: 'primary' },
  ],
  template: {
    title: '$item.name',
    subtitle: '$item.provider',
    badge: { value: '$item.type', map: { hourly: 'Hourly', fixed: 'Fixed' } },
    grid: [
      { label: 'Peak', value: '$item.peakRate', format: 'rate' },
      { label: 'Base', value: '$item.baseRate', format: 'rate' },
    ],
    footer: '$item.installations installations',
    menu: [  // per-card action buttons
      { label: 'Edit', action: 'openPanel', args: { view: 'editTariff', id: '$item.id' } },
      { label: 'Delete', action: 'remove', args: { id: '$item.id' }, style: 'danger' },
    ],
  },
}}
```

Template fields: `title`, `subtitle`, `badge` (`{value, map, color, format}`), `grid` (`[{label, value, format, color}]`), `footer`, `menu` (`[{label, action, args, style}]`).

### form

Input fields bound to store state or Convex mutations.

```js
{ form: {
  title: 'Edit Invoice',
  mutation: 'm.updateBill',  // or action: 'storeAction'
  args: { id: '$params.id' },
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'amount', label: 'Amount', type: 'number', min: 0 },
    { key: 'period', label: 'Period', type: 'select', options: '$q.periods' },
    { key: 'status', label: 'Status', type: 'radio', options: ['draft', 'final', 'paid'] },
    { key: 'notes', label: 'Notes', type: 'textarea', maxLength: 500 },
    { key: 'active', label: 'Active', type: 'toggle' },
    { key: 'factor', label: 'Factor', type: 'slider', min: 0.5, max: 2.0, step: 0.1 },
    { key: 'startDate', label: 'Start', type: 'date' },
  ],
  submit: 'Save',
  cancel: { navigate: 'overview' },
  onSuccess: { navigate: 'detail', params: { id: '$result.id' } },
  onError: 'toast',
}}
```

**Bind mode** — store-driven forms (no mutation, immediate reactivity):
```js
{ form: {
  bind: 'store',
  fields: [
    { key: 'multiplier', label: 'Factor', type: 'slider', min: 0.5, max: 2.0,
      action: 'simulate', args: { value: '$self' } },
  ]
}}
```

Field types: `text`, `number`, `date`, `select`, `radio`, `textarea`, `toggle`, `slider`.
Field attrs: `key`, `label`, `type`, `required`, `placeholder`, `min`, `max`, `step`, `maxLength`, `options`, `default`, `action`, `args`.

### chart

```js
{ chart: {
  title: 'Usage vs Production',
  type: 'bar',  // bar | line | area | pie | donut | spark
  source: '$q.monthlyHistory',
  x: 'month',
  series: [
    { key: 'consumption', label: 'Usage', color: 'gray' },
    { key: 'production', label: 'Production', color: 'teal' },
  ],
  height: 300,
}}
```

### header

Page/section header with title, badges, action buttons.

```js
{ header: {
  title: '$q.billDetail.installation',
  subtitle: '$q.billDetail.period',
  badge: { value: '$q.billDetail.status', badge: true },
  back: 'overview',
  actions: [
    { label: 'Export', serverAction: 'a.exportPdf', args: { id: '$params.id' }, icon: 'download', style: 'outline' },
    { label: 'Delete', mutation: 'm.deleteBill', args: { id: '$params.id' }, confirm: 'Sure?', style: 'danger', gate: ['admin'] },
  ],
}}
```

### row

Multi-column layout container.

```js
{ row: { columns: 2, items: [
  { cards: { ... } },
  { cards: { ... } },
]}}
```

### list

Simple list (no card chrome).

```js
{ list: {
  source: '$q.notifications',
  template: {
    icon: { value: '$item.type', map: { alert: 'bell', info: 'info' } },
    title: '$item.message',
    subtitle: { value: '$item.createdAt', format: 'timeAgo' },
    action: { navigate: 'detail', params: { id: '$item.refId' } },
  },
}}
```

### stat

Single large stat display.

```js
{ stat: {
  value: '$q.billDetail.savings',
  format: 'currency',
  label: 'Total Savings',
  color: 'green',
  size: 'lg',  // sm | md | lg
}}
```

### empty

Empty state placeholder.

```js
{ empty: {
  icon: 'inbox',
  title: 'No invoices',
  description: 'Add your first invoice to get started',
  action: { label: 'Create Invoice', navigate: 'create' },
}}
```

### divider

```js
{ divider: true }
{ divider: { label: 'Or continue with' } }
```

---

## Conditionals

### when — conditional rendering

```js
{ when: '$q.billDetail.status === "draft"',
  section: [
    { form: { ... } }
  ]
}
```

### show — reactive visibility (preserves state)

```js
{ metrics: { show: '$isExpanded', items: [...] } }
```

### gate — access control

```js
{ form: { gate: ['admin', 'operator'], title: 'Settings', fields: [...] } }
```

Section not rendered unless role matches. Also used for data gates: `gate: '$q.bills'` waits until query resolves.

### loading

```js
{ table: { gate: '$q.bills', loading: 'skeleton', source: '$q.bills', columns: [...] } }
```

`skeleton` or `spinner` placeholder while data resolves.

---

## Actions

How UI events connect to logic.

### Store action
```js
{ action: 'setFilter', args: { value: '$row.status' } }
```

### Convex mutation
```js
{ mutation: 'm.updateBill', args: { id: '$params.id', status: 'paid' },
  confirm: 'Mark as paid?', onSuccess: { toast: 'Updated' }, onError: 'toast' }
```

### Convex server action
```js
{ serverAction: 'a.exportPdf', args: { id: '$params.id' }, onSuccess: { toast: 'PDF generated' } }
```

### Navigate
```js
{ navigate: 'detail', params: { id: '$row.id' }, transition: 'slide' }
```

### Action chain (do)
```js
{ do: [
  { mutation: 'm.updateBill', args: { id: '$params.id', status: 'paid' } },
  { toast: 'Paid' },
  { navigate: 'overview' },
]}
```

---

## Views

Multi-page apps define named views with navigation.

```js
{
  views: {
    overview: {
      title: 'Summary', icon: 'home',
      sections: [...]
    },
    detail: {
      title: 'Invoice', icon: 'receipt',
      params: ['id'],       // URL params: #/detail/123
      back: 'overview',
      gate: '$q.billDetail', loading: 'skeleton',
      sections: [...]
    },
    create: {
      title: 'New Invoice', icon: 'plus',
      gate: ['admin', 'operator'],
      sections: [{ form: { ... } }]
    },
  },

  navigation: {
    type: 'tabs',          // tabs | sidebar | stack | bottomBar
    default: 'overview',
    transition: 'fade',    // fade | slide | none
    items: [
      { view: 'overview' },
      { view: 'create' },
      { view: 'detail', hidden: true },  // reachable but not in nav
    ],
    mobile: 'bottomBar',
  },
}
```

**Single-view apps** omit `views` and use `sections` directly:
```js
Novoid.render('#app', store, { sections: [...] });
```

---

## Panels

Side drawers triggered by store state.

```js
{
  panels: {
    editTariff: {
      title: 'Edit Tariff',
      position: 'right',   // left | right
      size: 'md',          // sm | md | lg
      trigger: { bind: '$sidePanel', value: 'editTariff' },
      close: 'closePanel',
      sections: [{ form: { ... } }],
    },
  },
}
```

---

## Data Bindings

Convex bindings declared at the top level.

```js
{
  data: {
    queries: {
      bills: { ref: 'bills:list', args: { orgId: '$auth.orgId' } },
      billDetail: { ref: 'bills:get', args: { id: '$params.id' }, skip: '$params.id' },
    },
    mutations: {
      createBill: { ref: 'bills:create' },
      updateBill: { ref: 'bills:update' },
    },
    actions: {
      exportPdf: { ref: 'reports:generatePdf' },
    },
  },
}
```

Referenced in sections as `$q.bills`, `m.createBill`, `a.exportPdf`.

**skip** — don't subscribe until expression is truthy: `{ ref: 'bills:get', args: { id: '$params.id' }, skip: '$params.id' }`.

---

## Auth

```js
{
  auth: {
    required: true,
    provider: 'novoid',   // novoid | custom token fn
    roles: ['admin', 'operator', 'viewer'],
    redirect: 'login',
    gates: { settings: ['admin'], create: ['admin', 'operator'] },
  },
}
```

Built-in expressions: `$auth.user`, `$auth.role`, `$auth.orgId`, `$auth.isAuthenticated`.

---

## Formats

| Key | Output | Example |
|---|---|---|
| `currency` | `$45,250` (locale-aware) | costs, prices |
| `kwh` | `12,500 kWh` | energy consumption |
| `rate` | `$3.25/kWh` | per-unit rates |
| `percent` | `42%` | percentages |
| `number` | `1,234` | counts |
| `date` | `12 Dec 2024` | dates |
| `datetime` | `12 Dec 2024, 14:30` | timestamps |
| `timeAgo` | `3 min ago` / `hace 3 min` | relative time (follows `app.locale`) |
| `bytes` | `1.2 MB` | file sizes |
| `duration` | `2h 15m` | elapsed time |
| `{ template: "{} units" }` | `42 units` | custom format |

Locale follows `app.locale`. Defaults to `es-MX`. The `timeAgo` formatter outputs Spanish (`hace 3 min`) when locale starts with `es`, English (`3 min ago`) otherwise.

---

## Colors

Semantic tokens used across all sections:

```
teal  green  blue  purple  red  orange  yellow  gray
```

Applied via `color: 'teal'` on values, badges, icons, chart series. Also supports hex: `color: '#14b8a6'`.

---

## Icons

Icons in the current renderer use **Unicode/emoji fallback** — not Lucide SVGs. The `icon` field on metrics items renders either:
- The provided string directly (e.g. `'$'`, `'⚡'`, emoji)
- `label.charAt(0)` if no icon is specified
- Special cases in tables: `arrowDown` → `↓`, `arrowUp` → `↑`
- Empty state icons: `inbox` → 📥, default → 📂

Lucide SVG rendering is planned but not yet implemented.

---

## Responsive

The renderer handles breakpoints automatically:

| Breakpoint | Behavior |
|---|---|
| `< 640px` | metrics → 1 col, table hides overflow, sidebar → bottomBar |
| `640-1024px` | metrics → 2 col, row → stacked |
| `> 1024px` | Full layout as declared |

Per-column override: `{ key: 'savings', hideBelow: 'md' }`.

---

## Full Example (minimal counter)

```js
const store = Novoid.createStore(
  { count: 0 },
  {
    inc(s) { return { count: s.count + 1 }; },
    reset() { return { count: 0 }; },
  }
);

Novoid.render('#app', store, {
  app: { name: 'Counter', theme: 'dark' },
  sections: [
    { stat: { value: '$count', label: 'Counter', size: 'lg' } },
    { row: { columns: 2, items: [
      { button: { label: '+1', action: 'inc', style: 'primary' } },
      { button: { label: 'Reset', action: 'reset', style: 'outline' } },
    ]}},
  ],
});
```

## Hybrid Apps (h() + render)

When a page needs both custom UI (marketing, carousel, rich visuals) and data-driven sections (forms, tables, cards), use separate mount points:

```html
<div id="navbar"></div>   <!-- classic h() — custom layout, SVGs, animations -->
<div id="carousel"></div> <!-- classic h() — image carousel with signals -->
<div id="app"></div>      <!-- Novoid.render() — forms, data tables, auth -->
<div id="footer"></div>   <!-- classic h() — links, branding -->

<script src="../js/core.min.js"></script>
<script src="../js/render.min.js"></script>
<script>
// h() shell — owns custom DOM and CSS
Novoid.mount('#navbar', function() {
  return Novoid.h('nav', {}, ...);
});

// render section — owns data-driven UI, zero CSS
var store = Novoid.createStore(state, actions);
Novoid.render('#app', store, {
  sections: [{ form: { ... } }]
});
</script>
```

### When to use hybrid

| Need | Approach |
|---|---|
| Dashboard, CRUD, data app | Pure render (`Novoid.render` only) |
| Marketing, landing page, rich visuals | Pure classic (`h()` + CSS only) |
| Landing page + contact form + auth | **Hybrid** — h() shell + render sections |
| Agent inline app with forms | **Hybrid** — h() for layout, render for interactive |

### Rules

1. Each mount point is independent — h() and render don't share DOM.
2. They can share the same store (pass the same `createStore` instance to both).
3. CSS in `<style>` applies only to h() elements. Render sections self-style.
4. Load both `core.min.js` and `render.min.js`.
5. Always generate `.test.json` for the store actions (same as pure render).

Reference implementation: `src/app/ulearnet-v2.html`.

---

## Status

Features are either **implemented** (working in `src/plugins/render.js`) or **planned** (documented spec, not yet coded).

### Implemented
- **Sections:** metrics, table, cards, form, header, row, button, stat, empty, divider
- **Conditionals:** when, show
- **Actions:** store action, navigate
- **Formats:** currency, kwh, rate, percent, number, date, datetime, timeAgo, bytes, duration, custom template
- **Views & navigation:** named views, tabs navigation, view params, back button
- **Expressions:** $-prefixed reactive bindings, inline arithmetic/comparison, CSP-safe evaluator
- **Form fields:** text, number, date, select, radio, textarea, toggle, slider

### Planned (not yet in render.js)
- **Sections:** chart, list, panels
- **Data bindings:** Convex queries/mutations/actions (`data: { queries, mutations, actions }`)
- **Auth:** auth section, gate (role-based access control), `$auth.*` expressions
- **Table features:** sort, pageSize, loading (skeleton/spinner)
- **Action types:** mutation, serverAction, do (action chain), confirm dialogs, onSuccess/onError callbacks
- **Navigation:** transition animations (fade/slide), sidebar/stack/bottomBar nav types, mobile nav
- **Icons:** Lucide SVG rendering (currently uses Unicode fallback or `label.charAt(0)`)

---

## Conventions

1. **Pure render apps have zero `h()` calls and zero CSS.** Hybrid apps use h() only in their shell mount points.
2. **Store actions return partial state.** Auto-merged via `Object.assign({}, current, partial)`.
3. **Use createStore for all app logic.** Actions become MCP tools and are testable.
4. **`$` expressions are reactive.** The renderer auto-subscribes to store state, queries, and auth.
5. **Sections are the only vocabulary.** Every UI element maps to one of: `metrics`, `table`, `cards`, `form`, `chart`, `stat`, `header`, `row`, `list`, `empty`, `divider`, `button`.
6. **Always generate a `.test.json`** alongside every render app.
7. **Form submit actions receive `formState` as args.** The renderer passes its internal form state as the second argument (`args`) to the submit action. Actions used as form submit handlers **must read from `args`**, not from store state. Store state is only updated if fields have explicit `action` properties. Pattern:
   ```js
   // CORRECT — reads from args (renderer passes formState)
   add: function(s, args) {
     var text = (args && args.fieldKey || '').trim();
     if (!text) return {};
     return { items: s.items.concat([{ text: text }]) };
   }
   // WRONG — reads store state that form never updated
   add: function(s) { return { items: s.items.concat([{ text: s.fieldKey }]) }; }
   ```
