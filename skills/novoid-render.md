# novoid-render

Codified knowledge for the no∅ render plugin. This file replaces reading `render.md` and `src/plugins/render.js`.

## Architecture

```
store  → state + actions                    (agentic layer, testable via MCP)
render → sections + bindings + formatting   (UI layer, pattern-locked)
```

The agent writes `store` and `render`. The renderer owns all DOM, CSS, layout, transitions, and responsive behavior. Render apps contain **zero `h()` calls and zero CSS**.

# novoid-render

Codified knowledge for the no∅ render plugin. Replaces reading `render.md`.

## Architecture & Responsibilities
- **Store (Logic):** You write the state and actions. Actions become MCP-callable tools.
- **Render (UI):** You write a JSON spec of predefined sections. The renderer owns DOM, CSS, layout, and responsiveness.
- **Rules:** Render apps contain **zero `h()` calls and zero CSS**.

## 1. Creating a Render App
Initialize the store and pass it to `Novoid.render()` alongside the UI specification.

```html
<script src="../js/core.min.js"></script>
<script src="../js/render.min.js"></script>
<script>
const store = Novoid.createStore(
  { count: 0 },
  { inc(s) { return { count: s.count + 1 }; } }
);

Novoid.render('#app', store, {
  app: { name: 'Counter App', theme: 'dark' },
  sections: [
    { stat: { value: '$count', label: 'Total', size: 'lg' } },
    { button: { label: '+1', action: 'inc', style: 'primary' } }
  ]
});
</script>
```

## 2. Reactive Expressions (`$`)
Any string prefixed with `$` is auto-subscribed by the renderer.

| Expression | Source | Example |
|---|---|---|
| `$key` | Store state | `$count` |
| `$q.ref` | Convex query | `$q.users` |
| `$auth.field` | Auth state | `$auth.role` |
| `"$a + $b"` | Inline math | `"$price * $qty"` |

## 3. Core UI Sections
Every visible element must be one of these types.

### Data Display (table, cards, metrics)
```js
// Metrics (KPI grid)
{ metrics: {
  columns: 3,
  items: [
    { label: 'Users', value: '$q.users.length', color: 'blue' },
    { label: 'Revenue', value: '$revenue', format: 'currency', color: 'green' }
  ]
}}

// Table (with actions)
{ table: {
  title: 'Invoices',
  source: '$q.invoices', // array of objects
  loading: 'skeleton',
  columns: [
    { key: 'name', label: 'Name' },
    { key: 'amount', label: 'Total', format: 'currency', bold: true }
  ],
  onRowClick: { navigate: 'detail', params: { id: '$row.id' } }
}}
```

### Forms & Inputs (bind mode)
Store-driven forms update state immediately.
```js
{ form: {
  bind: 'store',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'role', label: 'Role', type: 'select', options: ['admin', 'user'] }
  ]
}}
```

### Convex Mutation Forms
```js
{ form: {
  title: 'Edit User',
  mutation: 'm.updateUser',
  args: { id: '$params.id' },
  submit: 'Save',
  onSuccess: { navigate: 'overview' },
  fields: [ /* ... */ ]
}}
```

## 4. Multi-Page Apps (Views)
For apps with navigation, define `views` instead of flat `sections`.

```js
Novoid.render('#app', store, {
  views: {
    overview: {
      title: 'Home', icon: 'home',
      sections: [ /* ... */ ]
    },
    detail: {
      title: 'Details',
      params: ['id'], // URL #/detail/123 -> $params.id
      back: 'overview',
      sections: [ /* ... */ ]
    }
  },
  navigation: { type: 'tabs', default: 'overview', items: [{ view: 'overview' }] }
});
```

## 5. Connecting Convex Data
Declare bindings at the top level of the render spec.

```js
data: {
  queries: {
    users: { ref: 'users:list', args: { org: '$auth.orgId' } }
  },
  mutations: {
    updateUser: { ref: 'users:update' }
  }
}
```

## 6. Hybrid Apps (Classic + Render)
When you need custom marketing UI *and* data tables, use separate mount points. DO NOT mix them inside the same DOM tree.

```html
<div id="hero"></div> <!-- classic h() -->
<div id="dash"></div> <!-- Novoid.render() -->
<script>
  Novoid.mount('#hero', () => Novoid.h('h1', {}, 'Welcome'));
  Novoid.render('#dash', store, { sections: [...] });
</script>
```
