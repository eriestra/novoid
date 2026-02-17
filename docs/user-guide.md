# no∅ User Guide

A progressive tutorial for building reactive web apps with novoid.

---

## 1. Welcome to no∅

no∅ (pronounced "novoid") is a frictionless frontend framework built on one idea: **describe it, it's live.**

You write a single HTML file. You run one shell command. Your app is live on the internet -- globally accessible, verified, with an MCP endpoint for AI agents. No bundler. No CI/CD. No configuration files.

### Who is this for?

- Developers who want to ship fast without drowning in tooling
- AI agents that generate frontends programmatically
- Anyone tired of the React/Next.js ceremony of 10-50 files, 3-8 config files, and 30-120 second deploy cycles

### The philosophy

Traditional frameworks optimize for large teams maintaining large codebases over long periods. no∅ optimizes for the moment of creation. The gap between "I have an idea" and "here's the URL" should be seconds, not hours.

no∅ has two ways to build:

1. **Render apps (preferred)** -- Declarative UI. You describe sections (metrics, tables, cards, forms), and the renderer owns all DOM, CSS, and layout. Zero `h()` calls, zero CSS. This is the agentic layer: your store is testable via MCP, and the UI is pattern-locked.
2. **Classic apps** -- Imperative `h()` calls with full CSS control. More flexibility, more responsibility.

Both approaches share the same reactive core: signals, computed values, effects, and stores.

---

## 2. Quick Start

### Prerequisites

- Node.js (any recent version)
- A [Convex](https://convex.dev) account (free tier works)
- A terminal

### Setup

```sh
git clone https://github.com/eriestra/novoid
cd novoid
npm install
npx convex dev                # creates your Convex project
```

In a second terminal:

```sh
# Set the publish secret
npx convex run seed:seedSecret '{"name":"PUBLISH_SECRET","value":"pick-a-secret"}'

# Seed framework assets + platform page
sh seed.sh <your-cloud-url> pick-a-secret
```

Create a `.env.local` file (see `.env.local.example`):

```
CONVEX_URL=https://<deployment>.convex.cloud
CONVEX_SITE_URL=https://<deployment>.convex.site
PUBLISH_SECRET=pick-a-secret
```

Load your credentials:

```sh
source .env.local
```

### Your first app in 5 minutes

Create the file `src/app/hello.html`:

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hello - no∅</title>
  <link rel="stylesheet" href="../css/core.min.css">
  <link rel="stylesheet" href="../css/components.min.css">
</head>
<body>
  <div id="app"></div>
  <script src="../js/core.min.js"></script>
  <script src="../js/render.min.js"></script>
  <script>
  (function() {
    var N = Novoid;

    var store = N.createStore(
      { greeting: 'Hello, world!' },
      {}
    );

    N.render('#app', store, {
      app: { name: 'Hello', theme: 'dark' },
      sections: [
        { stat: { value: '$greeting', label: 'My First App', size: 'lg', color: 'teal' } }
      ]
    });
  })();
  </script>
</body>
</html>
```

Create the test file `src/app/hello.test.json`:

```json
{
  "steps": [
    { "action": "read", "resource": "greeting", "assert": { "eq": "Hello, world!" } }
  ]
}
```

Publish it:

```sh
sh publish.sh hello src/app/hello.html
```

The output gives you the live URL. You can also look it up anytime:

```sh
sh url.sh hello
```

That's it. One file, one command, live on the internet.

---

## 3. Core Concepts

no∅ is built on fine-grained reactivity. There is no virtual DOM. When a value changes, only the DOM nodes that depend on that value update. The three primitives are **signals**, **computed values**, and **effects**.

### Signals

A signal is a reactive container for a value. You create one with `Novoid.signal()`:

```js
const [count, setCount] = Novoid.signal(0, 'count');
```

This returns two things:
- `count` -- a **getter function** (you must call it: `count()`, not `count`)
- `setCount` -- a setter function

```js
count();           // read the current value: 0
setCount(5);       // set to 5
setCount(n => n + 1); // updater function: now 6
```

Always pass a name as the second argument. Named signals produce semantic names in debugging, tooling, and MCP resource names. The formal verifier (Nous) warns on unnamed signals.

**Peeking without tracking:**

```js
count.peek();  // reads the value without creating a reactive dependency
```

**Manual subscription:**

```js
const unsub = count.subscribe(value => console.log('count is now', value));
// later:
unsub();
```

### Computed

A computed value derives from one or more signals. It automatically tracks which signals it reads and recalculates when they change:

```js
const [price, setPrice] = Novoid.signal(10, 'price');
const [quantity, setQuantity] = Novoid.signal(3, 'quantity');

const total = Novoid.computed(() => price() * quantity());

total(); // 30
setPrice(20);
total(); // 60
```

Computed values are lazy -- they only recalculate when read after a dependency changes.

### Effects

An effect is a side-effect that runs whenever its dependencies change:

```js
const dispose = Novoid.effect(() => {
  console.log('The count is', count());
  return () => {
    // optional cleanup, runs before re-execution or on dispose
  };
});
```

Effects auto-track any signal or computed value read inside them. When any of those values change, the effect re-runs.

Call `dispose()` to stop the effect and run its cleanup.

### Batching

When you need to update multiple signals at once, wrap them in `batch()` to trigger only one re-render:

```js
Novoid.batch(() => {
  setPrice(25);
  setQuantity(4);
});
// effects and DOM updates happen once, not twice
```

### The reactive model visualized

```
signal(0, 'count')          signal(10, 'price')
       |                           |
       v                           v
  computed(() =>              effect(() =>
    count() * 2)                log(price()))
       |
       v
  DOM text node: "0"  -->  "2"  -->  "4"
```

When you call a setter, no∅ walks the dependency graph and updates only what changed. There is no diffing, no reconciliation, no batched virtual DOM comparison. It is direct and immediate.

---

## 4. Building with h()

The `h()` function creates DOM elements. This is the "classic" way to build no∅ apps -- you have full control over the DOM structure and CSS classes.

### Basic elements

```js
const { h, mount } = Novoid;

mount('#app', () =>
  h('div', { class: 'nv-container nv-py-8' },
    h('h1', { class: 'nv-h1' }, 'Hello, world'),
    h('p', { class: 'nv-text-muted' }, 'Built with no∅')
  )
);
```

`h(tag, attrs, ...children)` takes:
1. A tag name (string)
2. An optional attributes object
3. Any number of children (strings, elements, or functions for reactive content)

### Reactive text

Pass a function as a child to make text reactive:

```js
const [name, setName] = Novoid.signal('world', 'name');

h('p', {}, () => 'Hello, ' + name() + '!');
// When name changes, only this text node updates
```

### Attributes

```js
h('div', {
  class: 'nv-card',                      // static class
  style: { color: 'red', padding: '1rem' }, // style object
  id: 'my-card',                          // any standard attribute
  onclick: (e) => console.log('clicked'), // event handler
});
```

**Reactive attributes** -- pass a function:

```js
h('div', {
  class: () => isActive() ? 'nv-card nv-card-elevated' : 'nv-card',
  style: () => ({ opacity: isVisible() ? 1 : 0 }),
});
```

**Boolean attributes** -- reactive booleans work naturally:

```js
h('button', {
  disabled: () => isLoading(),
  class: 'nv-btn nv-btn-primary',
}, 'Submit');
```

When `isLoading()` is true, the `disabled` attribute is present. When false, it is removed.

### Two-way binding

The `bind` attribute creates two-way data binding on form inputs:

```js
const [name, setName] = Novoid.signal('', 'name');

h('input', {
  class: 'nv-input',
  bind: [name, setName],
  placeholder: 'Enter your name',
});
```

Important: create bound inputs at component scope, never inside an `effect()` block.

### Events

All DOM events are supported with the `on` prefix:

```js
h('button', {
  onclick: () => setCount(c => c + 1),
  onmouseenter: () => setHovered(true),
  onmouseleave: () => setHovered(false),
  class: 'nv-btn nv-btn-primary',
}, 'Click me');
```

### Lists

Use `Novoid.list()` for efficient keyed list rendering:

```js
const [todos, setTodos] = Novoid.signal([
  { id: 1, text: 'Learn no∅' },
  { id: 2, text: 'Build something' },
], 'todos');

const ul = h('ul', { class: 'nv-stack nv-gap-2' });

Novoid.list(ul, todos, t => t.id, t =>
  h('li', { class: 'nv-card nv-p-4' }, t.text)
);
```

The second argument is the signal getter (not called -- `list` subscribes to it). The third argument is a key function for efficient diffing. The fourth is the render function for each item.

### Conditionals

`when()` renders content based on a condition:

```js
Novoid.when(
  () => isLoggedIn(),
  () => h('p', {}, 'Welcome back!'),
  () => h('p', {}, 'Please log in')
);
```

`match()` is a switch-style conditional:

```js
const [tab, setTab] = Novoid.signal('home', 'tab');

Novoid.match(tab, {
  home: () => h('div', {}, 'Home page'),
  settings: () => h('div', {}, 'Settings'),
  default: () => h('div', {}, 'Not found'),
});
```

### Refs

Access the underlying DOM element with `ref`:

```js
const inputRef = Novoid.ref();

h('input', { ref: inputRef, class: 'nv-input' });

Novoid.onMount(() => {
  inputRef.current.focus();
});
```

### onMount

`onMount` runs a callback after the app has been mounted to the DOM (via `requestAnimationFrame`, so layout is complete):

```js
Novoid.onMount(() => {
  console.log('App is mounted and visible');
});
```

### Full classic app example

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Todo - no∅</title>
  <link rel="stylesheet" href="../css/core.min.css">
  <link rel="stylesheet" href="../css/components.min.css">
</head>
<body>
  <div id="app"></div>
  <script src="../js/core.min.js"></script>
  <script>
  (function() {
    var N = Novoid;
    var h = N.h;

    var store = N.createStore(
      { todos: [], input: '' },
      {
        setInput: function(s, args) { return { input: args.value }; },
        add: function(s) {
          if (!s.input.trim()) return {};
          return {
            todos: s.todos.concat({ id: Date.now(), text: s.input }),
            input: ''
          };
        },
        remove: function(s, args) {
          return { todos: s.todos.filter(function(t) { return t.id !== args.id; }) };
        }
      }
    );

    N.mount('#app', function() {
      var input = h('input', {
        class: 'nv-input',
        placeholder: 'What needs to be done?',
        bind: [function() { return store.get().input; }, function(v) { store.actions.setInput({ value: v }); }],
        onkeydown: function(e) { if (e.key === 'Enter') store.actions.add(); }
      });

      var list = h('ul', { class: 'nv-stack nv-gap-2 nv-mt-4' });
      N.list(list, function() { return store.get().todos; }, function(t) { return t.id; }, function(t) {
        return h('li', { class: 'nv-card nv-p-4 nv-flex nv-justify-between nv-items-center' },
          h('span', {}, t.text),
          h('button', {
            class: 'nv-btn nv-btn-danger nv-btn-sm',
            onclick: function() { store.actions.remove({ id: t.id }); }
          }, 'Remove')
        );
      });

      return h('div', { class: 'nv-container nv-py-8', style: { maxWidth: '600px' } },
        h('h1', { class: 'nv-h2 nv-mb-4' }, 'Todo List'),
        h('div', { class: 'nv-flex nv-gap-2' },
          input,
          h('button', { class: 'nv-btn nv-btn-primary', onclick: function() { store.actions.add(); } }, 'Add')
        ),
        list
      );
    });
  })();
  </script>
</body>
</html>
```

---

## 5. State Management with createStore

While raw signals give you fine-grained control, `createStore` is the recommended way to manage state in no∅ apps. Stores are essential for two reasons:

1. **Testability** -- store actions become MCP-callable tools, enabling automated E2E testing
2. **Render apps** -- the declarative render system requires a store

### Creating a store

```js
var store = Novoid.createStore(
  // Initial state (plain object)
  { count: 0, name: 'world' },

  // Actions (functions that receive current state and return partial state)
  {
    inc: function(s) { return { count: s.count + 1 }; },
    dec: function(s) { return { count: s.count - 1 }; },
    reset: function() { return { count: 0 }; },
    setName: function(s, args) { return { name: args.value }; }
  }
);
```

### The partial state pattern

This is one of the most important concepts in no∅. Actions return **partial state** -- only the keys you want to change. The framework auto-merges the partial return with the current state.

```js
// You do NOT need to spread the full state:
inc: function(s) { return { count: s.count + 1 }; }
// The 'name' key is untouched -- it stays whatever it was

// You do NOT do this:
inc: function(s) { return { ...s, count: s.count + 1 }; }  // unnecessary
```

If an action returns an empty object `{}`, nothing changes. This is useful for conditional actions:

```js
add: function(s) {
  if (!s.input.trim()) return {};  // no-op
  return {
    todos: s.todos.concat({ id: Date.now(), text: s.input }),
    input: ''
  };
}
```

### Reading state

```js
store.get()          // returns the full current state object
store.get().count    // read a specific key
```

### Calling actions

```js
store.actions.inc();              // no arguments
store.actions.setName({ value: 'no∅' }); // with arguments
```

Actions receive two arguments: `(currentState, args)`. The `args` parameter is whatever object you pass when calling the action.

### Subscribing to changes

```js
store.subscribe(function(state) {
  console.log('State changed:', state);
});
```

### When to use stores vs raw signals

| Use case | Recommendation |
|---|---|
| Render apps (declarative UI) | Store (required) |
| Apps that need E2E testing | Store (required -- actions become testable tools) |
| Simple prototypes, experiments | Either works |
| Fine-grained per-element reactivity | Raw signals |
| Shared state across components | Store |

In practice, prefer stores for anything you plan to publish. The render system, the test harness, and the MCP endpoint all operate on stores.

---

## 6. The Render System (Declarative UI)

The render system is the preferred way to build no∅ apps. Instead of writing `h()` calls and CSS classes, you describe your UI as a set of **sections** -- metrics, tables, cards, forms, buttons -- and the renderer handles all DOM creation, CSS, layout, transitions, and responsive behavior.

### Architecture

```
store  --> state + actions + computed       (agentic layer, testable via MCP)
render --> sections + bindings + wiring     (UI layer, pattern-locked)
```

You write the store (data and logic). You describe the render (what to display). The renderer does everything else. Your HTML file contains zero `h()` calls and zero CSS.

### Your first render app: the counter

Let's walk through the render counter example line by line.

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Render Counter - no∅</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/core.min.css">
  <link rel="stylesheet" href="../css/components.min.css">
</head>
<body>
  <div id="app"></div>
  <script src="../js/core.min.js"></script>
  <script src="../js/render.min.js"></script>
  <script>
  (function() {
    var N = Novoid;

    var store = N.createStore(
      { count: 0 },
      {
        inc: function(s) { return { count: s.count + 1 }; },
        dec: function(s) { return { count: s.count - 1 }; },
        reset: function() { return { count: 0 }; }
      }
    );

    N.render('#app', store, {
      app: {
        name: 'Contador',
        theme: 'dark'
      },
      sections: [
        { stat: {
            value: '$count',
            label: 'Contador',
            size: 'lg',
            color: 'teal'
        }},
        { row: {
            columns: 3,
            items: [
              { button: { label: '+1', action: 'inc', style: 'primary' } },
              { button: { label: '-1', action: 'dec', style: 'secondary' } },
              { button: { label: 'Reset', action: 'reset', style: 'outline' } }
            ]
        }}
      ]
    });
  })();
  </script>
</body>
</html>
```

Breaking it down:

**The HTML boilerplate** loads two CSS files (core + components) and two JS files (core + render plugin). The `data-theme="dark"` attribute enables dark mode. The Google Fonts link loads DM Sans and Outfit, which are the no∅ brand fonts.

**The store** defines one piece of state (`count: 0`) and three actions. Each action returns partial state -- just the `count` key.

**The render call** -- `N.render('#app', store, config)` -- takes three arguments:
1. A CSS selector for the mount point
2. The store
3. A configuration object describing the UI

**The `app` block** sets the app name and theme.

**The `sections` array** is the UI definition. Each element is an object with a single key naming the section type:

- `stat` -- displays a single large number. `value: '$count'` is a reactive expression that binds to the store's `count` key. As the count changes, the display updates.
- `row` -- creates a multi-column layout. Inside it, three `button` sections are wired to store actions by name.

Notice: no `h()` calls. No CSS classes. No event handlers. The renderer handles all of that.

### Section types reference

Here is every section type in the render system. Most are implemented and working today; a few are planned (marked below).

#### stat

A single large value display, ideal for hero numbers on detail pages.

```js
{ stat: {
    value: '$count',
    label: 'Active Users',
    format: 'number',
    color: 'teal',
    size: 'lg'       // sm | md | lg
}}
```

#### metrics

A row of KPI cards in a responsive grid. This is the most common way to show summary numbers.

```js
{ metrics: {
    columns: 4,      // 1-6, responsive
    items: [
      { label: 'Revenue', value: '$revenue', format: 'currency', color: 'green' },
      { label: 'Users', value: '$userCount', format: 'number', color: 'blue' },
      { label: 'Growth', value: '$growth', format: 'percent', color: 'teal',
        trend: { value: '$growthDelta', format: 'percent' } },
      { label: 'Orders', value: '$orderCount', format: 'number', color: 'purple' }
    ]
}}
```

#### table

Data table with optional filtering and row actions.

```js
{ table: {
    title: 'Recent Bills',
    source: '$bills',           // reactive array from store
    empty: 'No results',
    filter: {
      key: 'filter',            // store state key that holds current filter
      action: 'setFilter',      // store action to call
      options: [
        { value: 'all', label: 'All' },
        { value: 'paid', label: 'Paid' },
        { value: 'draft', label: 'Draft' }
      ]
    },
    columns: [
      { key: 'name', label: 'Name', subtitle: 'period' },
      { key: 'amount', label: 'Amount', format: 'currency', bold: true },
      { key: 'status', label: 'Status', badge: true },
      { key: 'savings', label: 'Savings', format: 'currency', color: 'green', hideBelow: 'md' }
    ],
}}
```

The `subtitle` option shows a second line of text from another field. The `badge: true` option renders the value as a colored badge. The `hideBelow` option hides the column on smaller screens.

> **Note:** `sort`, `pageSize`, and `loading` are planned features not yet implemented in the render plugin.

#### cards

Iterable card list with a template. Each item in the source array is rendered as a card.

```js
{ cards: {
    title: 'Tariffs',
    source: '$tariffs',
    empty: 'No tariffs configured',
    select: {                       // makes cards selectable
      bind: '$selectedTariff',
      action: 'selectTariff',
      arg: 'id'
    },
    actions: [                      // header-level buttons
      { label: 'Add', action: 'addTariff', icon: 'plus', style: 'primary' }
    ],
    template: {
      title: '$item.name',
      subtitle: '$item.provider',
      badge: { value: '$item.type', map: { hourly: 'Hourly', fixed: 'Fixed' } },
      grid: [
        { label: 'Peak Rate', value: '$item.peakRate', format: 'rate' },
        { label: 'Base Rate', value: '$item.baseRate', format: 'rate' }
      ],
      footer: '$item.installations installations'
    }
}}
```

Inside a card template, `$item.key` refers to the current item's property.

#### form

Input fields with store-driven reactivity.

```js
{ form: {
    title: 'Edit Bill',
    bind: 'store',                  // store-driven (immediate reactivity)
    fields: [
      { key: 'installation', label: 'Installation', type: 'text', required: true },
      { key: 'consumption', label: 'Consumption (kWh)', type: 'number', min: 0 },
      { key: 'period', label: 'Period', type: 'select', options: '$periods' },
      { key: 'status', label: 'Status', type: 'radio', options: ['draft', 'final', 'paid'] },
      { key: 'notes', label: 'Notes', type: 'textarea', maxLength: 500 },
      { key: 'isActive', label: 'Active', type: 'toggle' },
      { key: 'factor', label: 'Factor', type: 'slider', min: 0.5, max: 2.0, step: 0.1,
        action: 'simulate', args: { value: '$self' } }
    ],
    submit: 'Save'
}}
```

Field types: `text`, `number`, `select`, `radio`, `textarea`, `toggle`, `slider`, `date`.

Forms submit via store actions (the renderer passes form state as args to the action). Convex mutation-driven forms (`mutation`, `onSuccess`, `onError`) are planned but not yet implemented.

#### header

Page or section header with title, badges, and action buttons.

```js
{ header: {
    title: '$appName',
    subtitle: 'Dashboard',
    badge: { value: '$status', badge: true },
    back: 'overview',
    actions: [
      { label: 'Export', action: 'exportData', style: 'outline' },
      { label: 'Delete', action: 'deleteItem', style: 'danger' }
    ]
}}
```

#### row

Multi-column layout container. Wraps other sections side by side.

```js
{ row: {
    columns: 2,     // 2-4
    items: [
      { cards: { title: 'Left Column', ... } },
      { cards: { title: 'Right Column', ... } }
    ]
}}
```

#### button

A standalone action button.

```js
{ button: { label: 'Save', action: 'save', style: 'primary' } }
```

Button styles: `primary`, `secondary`, `success`, `danger`, `warning`, `ghost`, `outline`, `link`.

#### list (planned)

> **Note:** List rendering is documented but not yet implemented in the render plugin. This section describes the planned API.

```js
{ list: {
    source: '$notifications',
    template: {
      icon: { value: '$item.type', map: { alert: 'bell', info: 'info' } },
      title: '$item.message',
      subtitle: { value: '$item.createdAt', format: 'timeAgo' },
      action: { navigate: 'detail', params: { id: '$item.refId' } }
    }
}}
```

#### empty

Empty state placeholder.

```js
{ empty: {
    icon: 'inbox',
    title: 'No bills yet',
    description: 'Add your first bill to get started',
    action: { label: 'Create Bill', navigate: 'create' }
}}
```

#### divider

A visual separator.

```js
{ divider: {} }
{ divider: { label: 'Or continue with' } }
```

#### chart (planned)

> **Note:** Chart rendering is documented but not yet implemented in the render plugin. This section describes the planned API.

```js
{ chart: {
    title: 'Monthly Consumption',
    type: 'bar',               // bar | line | area | pie | donut | spark
    source: '$monthlyHistory',
    x: 'month',
    series: [
      { key: 'consumption', label: 'Consumption', color: 'gray' },
      { key: 'production', label: 'Production', color: 'teal' }
    ],
    height: 300
}}
```

### Reactive expressions

Any string starting with `$` is a reactive expression. The renderer subscribes to the underlying value and updates the DOM when it changes.

| Expression | Source | Example |
|---|---|---|
| `$key` | Store state | `$count`, `$filter` |
| `$computed` | Store computed value | `$totalSavings` |
| `$item.key` | Current card/list item | `$item.name`, `$item.cost` |
| `$row.key` | Current table row | `$row.installation` |
| `$q.ref` | Convex query result | `$q.bills`, `$q.stats.totalCost` |
| `$auth.field` | Auth state | `$auth.user`, `$auth.role` |
| `$params.key` | View parameters | `$params.id` |
| `$self` | Current input value | Used in slider/form bindings |
| `"$a + $b"` | Inline expression | `"$price * $qty"` |

### Formatters

Formatters control how values are displayed. They are locale-aware (set `app.locale` in the render config).

| Format | Output example | Usage |
|---|---|---|
| `currency` | $45,250 | `format: 'currency'` |
| `kwh` | 12,500 kWh | `format: 'kwh'` |
| `rate` | $3.25/kWh | `format: 'rate'` |
| `percent` | 42% | `format: 'percent'` |
| `number` | 1,234 | `format: 'number'` |
| `date` | 12 Dec 2024 | `format: 'date'` |
| `datetime` | 12 Dec 2024, 14:30 | `format: 'datetime'` |
| `timeAgo` | 3 min ago / hace 3 min | `format: 'timeAgo'` (follows `app.locale`) |
| `bytes` | 1.2 MB | `format: 'bytes'` |
| `duration` | 2h 15m | `format: 'duration'` |
| Custom template | 48 months | `format: { template: '{} months' }` |

### Filters and select bindings

Tables can have filters that wire directly to store actions:

```js
filter: {
  key: 'filter',           // which store key holds the current filter value
  action: 'setFilter',     // which store action to call when user picks a filter
  options: [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' }
  ]
}
```

The corresponding store action receives the selected value:

```js
setFilter: function(s, args) {
  var f = args.value;
  var filtered = f === 'all' ? ALL_ITEMS : ALL_ITEMS.filter(function(item) {
    return item.status === f;
  });
  return { filter: f, items: filtered };
}
```

Cards can be selectable:

```js
select: {
  bind: '$selectedId',      // store key for selected value
  action: 'selectItem',    // store action called on click
  arg: 'id'                // which item property to pass
}
```

### Action buttons

Buttons can appear in card headers, table rows, and standalone:

```js
actions: [
  { label: '+20%', action: 'simulate', args: { multiplier: 1.2 }, style: 'ghost', size: 'sm' },
  { label: 'Reset', action: 'resetSimulation', style: 'outline', size: 'sm' }
]
```

Each button calls a store action with the specified args.

### Conditionals in render

**when** -- conditionally render an entire section:

```js
{ when: '$status === "draft"', section: [
    { form: { title: 'Edit', ... } }
]}
```

**show** -- toggle visibility (keeps the section in the DOM, preserves state):

```js
{ metrics: {
    show: '$isExpanded',
    items: [...]
}}
```

**gate** (planned) -- role-based access control. Not yet implemented in the render plugin.

### Building a real app: Bill Optimizer walkthrough

Let's study the bill-optimizer example, a solar energy bill management dashboard. This demonstrates most render features in a real-world context.

**The store** holds bills, tariffs, savings data, and summary metrics. It has four actions:

```js
var store = N.createStore(
  {
    filter: 'all',
    selectedTariff: null,
    bills: BILLS,
    tariffs: TARIFFS,
    savings: SAVINGS,
    totalCost: 45250,
    totalSavings: 32180,
    exportRevenue: 18450,
    totalBills: 24,
    avgSavingsPercent: 42
  },
  {
    setFilter: function(s, args) {
      var f = args.value;
      var filtered = f === 'all' ? BILLS : BILLS.filter(function(b) { return b.status === f; });
      return { filter: f, bills: filtered };
    },
    selectTariff: function(s, args) {
      return { selectedTariff: s.selectedTariff === args.id ? null : args.id };
    },
    simulateTariffChange: function(s, args) {
      var mult = args.multiplier || 1;
      var newSavings = SAVINGS.map(function(item) {
        var ms = Math.round(item.monthlySavings * mult);
        return {
          installation: item.installation,
          monthlySavings: ms,
          annualSavings: ms * 12,
          savingsPercent: Math.round(item.savingsPercent * mult),
          roiMonths: Math.round(item.roiMonths / mult)
        };
      });
      var totalSav = 0;
      for (var i = 0; i < newSavings.length; i++) totalSav += newSavings[i].monthlySavings;
      return {
        savings: newSavings,
        totalSavings: totalSav,
        avgSavingsPercent: Math.round(newSavings.reduce(function(a, b) {
          return a + b.savingsPercent;
        }, 0) / newSavings.length)
      };
    },
    resetSimulation: function() {
      return { savings: SAVINGS, totalSavings: 32180, avgSavingsPercent: 42 };
    }
  }
);
```

Notice the partial state pattern throughout. `setFilter` returns only `filter` and `bills`. `selectTariff` returns only `selectedTariff`. `simulateTariffChange` returns `savings`, `totalSavings`, and `avgSavingsPercent` -- leaving `bills`, `tariffs`, `filter`, and everything else untouched.

**The render config** builds the full dashboard:

```js
N.render('#app', store, {
  app: {
    name: 'Bill Optimizer',
    brand: 'SolarIA',
    theme: 'dark',
    locale: 'es-MX'
  },
  sections: [
    // 1. KPI row at the top
    { metrics: {
        columns: 4,
        items: [
          { label: 'Costo Este Mes', value: '$totalCost', format: 'currency', color: 'teal', icon: '$' },
          { label: 'Ahorro vs Sin Solar', value: '$totalSavings', format: 'currency', color: 'green',
            trend: { value: '$avgSavingsPercent', format: 'percent' } },
          { label: 'Ingresos Exportacion', value: '$exportRevenue', format: 'currency', color: 'blue' },
          { label: 'Total Facturas', value: '$totalBills', format: 'number', color: 'purple' }
        ]
    }},

    // 2. Filterable data table
    { table: {
        title: 'Facturas Recientes',
        source: '$bills',
        empty: 'Sin resultados',
        filter: {
          key: 'filter',
          action: 'setFilter',
          options: [
            { value: 'all', label: 'Todas' },
            { value: 'draft', label: 'Borrador' },
            { value: 'final', label: 'Final' },
            { value: 'paid', label: 'Pagada' }
          ]
        },
        columns: [
          { key: 'installation', label: 'Instalacion', subtitle: 'period' },
          { key: 'consumptionKwh', label: 'Consumo', format: 'kwh' },
          { key: 'productionKwh', label: 'Produccion', format: 'kwh', color: 'teal' },
          { key: 'exportKwh', label: 'Exportacion', format: 'kwh', color: 'green' },
          { key: 'totalCost', label: 'Costo', format: 'currency', bold: true },
          { key: 'savingsVsNoSolar', label: 'Ahorro', format: 'currency', color: 'green' },
          { key: 'status', label: 'Estado', badge: true }
        ]
    }},

    // 3. Two-column layout: tariff cards + savings analysis
    { row: {
        columns: 2,
        items: [
          { cards: {
              title: 'Tarifas Configuradas',
              source: '$tariffs',
              select: { bind: '$selectedTariff', action: 'selectTariff', arg: 'id' },
              template: {
                title: '$item.name',
                subtitle: '$item.provider',
                badge: { value: '$item.type',
                  map: { horaria: 'Horaria', escalonada: 'Escalonada', fija: 'Fija' }, color: 'teal' },
                grid: [
                  { label: 'Tarifa Pico', value: '$item.peakRate', format: 'rate' },
                  { label: 'Tarifa Base', value: '$item.baseRate', format: 'rate' },
                  { label: 'Feed-in', value: '$item.feedInRate', format: 'rate', color: 'teal' }
                ],
                footer: '$item.installations instalaciones'
              }
          }},
          { cards: {
              title: 'Analisis de Ahorros',
              source: '$savings',
              actions: [
                { label: '+20%', action: 'simulateTariffChange', args: { multiplier: 1.2 }, style: 'ghost', size: 'sm' },
                { label: '-20%', action: 'simulateTariffChange', args: { multiplier: 0.8 }, style: 'ghost', size: 'sm' },
                { label: 'Reset', action: 'resetSimulation', style: 'outline', size: 'sm' }
              ],
              template: {
                title: '$item.installation',
                badge: { value: '$item.savingsPercent', format: 'percent', color: 'green' },
                grid: [
                  { label: 'Ahorro Mensual', value: '$item.monthlySavings', format: 'currency', color: 'green' },
                  { label: 'Ahorro Anual', value: '$item.annualSavings', format: 'currency', color: 'green' },
                  { label: 'ROI', value: '$item.roiMonths', format: { template: '{} meses' }, color: 'teal' }
                ]
              }
          }}
        ]
    }},

    // 4. Summary metrics at the bottom
    { metrics: {
        columns: 4,
        items: [
          { label: 'Costo Total', value: '$totalCost', format: 'currency', color: 'teal' },
          { label: 'Ahorro Total', value: '$totalSavings', format: 'currency', color: 'green' },
          { label: 'Ingresos Exportacion', value: '$exportRevenue', format: 'currency', color: 'blue' },
          { label: 'Ahorro Promedio', value: '$avgSavingsPercent', format: 'percent', color: 'purple' }
        ]
    }}
  ]
});
```

Key patterns demonstrated:

1. **Metrics with trends** -- the second metric in the top row has a `trend` sub-object that shows the savings percentage alongside the main value.
2. **Filtered table** -- the filter object connects a set of UI buttons to a store action. When the user picks "Borrador", the renderer calls `store.actions.setFilter({ value: 'draft' })`.
3. **Row layout** -- `row` with `columns: 2` puts tariff cards and savings cards side by side.
4. **Selectable cards** -- the tariff cards have a `select` binding. Clicking a card calls `selectTariff` with the card's `id`.
5. **Card-level actions** -- the savings cards have header buttons (+20%, -20%, Reset) that run simulation actions.
6. **Badge mapping** -- `map: { horaria: 'Horaria', escalonada: 'Escalonada', fija: 'Fija' }` transforms raw data values into display labels.
7. **Custom format templates** -- `format: { template: '{} meses' }` wraps the number in custom text.
8. **Locale** -- `locale: 'es-MX'` makes formatters use Mexican Spanish number/date formatting. The `currency` formatter always uses `$` prefix; `timeAgo` outputs Spanish when locale starts with `es`.

**Try it:** Modify the bill-optimizer to add a fifth metric showing average ROI in months. Add a `hideBelow: 'md'` to the "Exportacion" table column.

---

## 7. Testing Your Apps

Every no∅ app should have a `.test.json` file alongside it. Tests run automatically when you publish and take about 8ms for 20 tests.

### Why test specs matter

Store actions become MCP-callable tools. The test harness (Qed) loads your app in a headless JavaScript runtime, then calls store actions and reads store state using MCP semantics. This means your tests verify actual application behavior, not just DOM appearance.

### Testability requirement

Your app must use `createStore` for testable logic. Raw signals with DOM `onclick` handlers are not testable by the harness:

```js
// Testable -- actions are callable by the test harness
var store = N.createStore(
  { count: 0 },
  { inc: function(s) { return { count: s.count + 1 }; } }
);

// NOT testable -- logic is inside a DOM handler
button.onclick = function() { setCount(count() + 1); };
```

### Test spec format

Create a file with the same name as your app but with `.test.json` extension:

```
src/app/counter.html        <-- the app
src/app/counter.test.json   <-- the test spec
```

A test spec is a JSON object with a `steps` array:

```json
{
  "steps": [
    { "action": "read", "resource": "count", "assert": { "eq": 0 } },
    { "action": "call", "tool": "inc", "then": { "read": "count", "assert": { "eq": 1 } } },
    { "action": "call", "tool": "inc", "then": { "read": "count", "assert": { "eq": 2 } } },
    { "action": "call", "tool": "reset", "then": { "read": "count", "assert": { "eq": 0 } } }
  ]
}
```

### Step types

#### read -- check current state

```json
{ "action": "read", "resource": "count", "assert": { "eq": 0 } }
```

Reads a store state key and asserts its value. Resource names are store state keys directly -- `count`, `filter`, `todos`. Do not prefix with `store_0.`.

#### call -- invoke a store action

```json
{ "action": "call", "tool": "inc" }
```

Calls a store action by name. Optionally pass arguments and a follow-up assertion:

```json
{
  "action": "call",
  "tool": "setFilter",
  "args": { "value": "paid" },
  "then": { "read": "filter", "assert": { "eq": "paid" } }
}
```

#### push -- simulate a Convex update

```json
{
  "action": "push",
  "query": "tasks:list",
  "data": [{ "id": "1", "text": "Buy milk", "done": false }],
  "then": { "read": "tasks", "assert": { "length": 1 } }
}
```

This simulates a Convex query returning data, useful for testing apps that depend on backend data.

### Assertions

| Assertion | What it checks | Example |
|---|---|---|
| `eq` | Deep equality | `{ "eq": 0 }`, `{ "eq": "hello" }`, `{ "eq": [1,2,3] }` |
| `length` | Array length | `{ "length": 5 }` |
| `contains` | Array includes value, or string contains substring | `{ "contains": "milk" }` |
| `matches` | String pattern match | `{ "matches": "^Hello" }` |

### Seed data

For apps that need Convex query data at startup, use the `seed` field:

```json
{
  "seed": {
    "tasks:list": [
      { "id": "1", "text": "Buy milk" },
      { "id": "2", "text": "Walk the dog" }
    ]
  },
  "steps": [
    { "action": "read", "resource": "tasks", "assert": { "length": 2 } }
  ]
}
```

### Full test example for the counter

`src/app/render-counter.test.json`:

```json
{
  "steps": [
    { "action": "read", "resource": "count", "assert": { "eq": 0 } },
    { "action": "call", "tool": "inc", "then": { "read": "count", "assert": { "eq": 1 } } },
    { "action": "call", "tool": "inc", "then": { "read": "count", "assert": { "eq": 2 } } },
    { "action": "call", "tool": "dec", "then": { "read": "count", "assert": { "eq": 1 } } },
    { "action": "call", "tool": "reset", "then": { "read": "count", "assert": { "eq": 0 } } }
  ]
}
```

### Full test example for the bill optimizer

`src/app/bill-optimizer.test.json`:

```json
{
  "steps": [
    { "action": "read", "resource": "filter", "assert": { "eq": "all" } },
    { "action": "read", "resource": "bills", "assert": { "length": 5 } },
    { "action": "read", "resource": "totalCost", "assert": { "eq": 45250 } },
    { "action": "call", "tool": "setFilter", "args": { "value": "paid" },
      "then": { "read": "bills", "assert": { "length": 2 } } },
    { "action": "call", "tool": "setFilter", "args": { "value": "all" },
      "then": { "read": "bills", "assert": { "length": 5 } } },
    { "action": "call", "tool": "selectTariff", "args": { "id": "tariff-1" },
      "then": { "read": "selectedTariff", "assert": { "eq": "tariff-1" } } },
    { "action": "call", "tool": "selectTariff", "args": { "id": "tariff-1" },
      "then": { "read": "selectedTariff", "assert": { "eq": null } } },
    { "action": "call", "tool": "simulateTariffChange", "args": { "multiplier": 1.2 },
      "then": { "read": "avgSavingsPercent", "assert": { "eq": 54 } } },
    { "action": "call", "tool": "resetSimulation",
      "then": { "read": "totalSavings", "assert": { "eq": 32180 } } }
  ]
}
```

**Try it:** Write a test spec for the hello app from Section 2.

---

## 8. Publishing

Publishing takes your HTML file, verifies it, uploads it to Convex, and runs post-publish checks. One command:

```sh
sh publish.sh <slug> src/app/<slug>.html
```

### What happens during publish

```
Phase 1: Pre-flight verification
  - Nous (static analysis) -- proves structural contracts, layout feasibility,
    reactive dataflow acyclicity, dead signal detection, accessibility
  - Qed (headless runtime) -- executes the app in a sandboxed JS runtime,
    catches runtime errors, introspects signals/stores/actions

Phase 2: Upload
  - HTML is uploaded to the Convex pages table
  - The app is live at https://<deployment>.convex.site/app/<slug>

Phase 3: Post-publish E2E
  - Runs your .test.json spec against the live app
  - Checks the live URL returns 200
  - Verifies the MCP endpoint is available
  - Checks Lux sentinel for runtime errors
```

A successful publish looks like this:

```
┌─ verify ───────────────────────────────────────────┐
│ nous    ✓ SOUND  47 nodes, 6 signals               │
│ browser ✓ clean  1 stores, 5 actions               │
│ ✓ 104/104 passed (8ms)                              │
├─────────────────────────────────────────────────────┤
│ ✓ verified                                          │
└─────────────────────────────────────────────────────┘

┌─ post-publish ─────────────────────────────────────────┐
│ live     ✓ https://...convex.site/app/<slug> (200)     │
│ mcp      ✓ 3 tools, 5 resources                       │
│ sentinel ✓ no runtime errors                           │
├────────────────────────────────────────────────────────┤
│ ✓ e2e passed                                           │
└────────────────────────────────────────────────────────┘
```

### Other commands

```sh
sh verify.sh src/app/<slug>.html     # verify without publishing
sh url.sh <slug>                      # look up URLs for a published app
sh build.sh                           # minify src/ into dist/ (23ms)
sh seed.sh "$CONVEX_URL" "$PUBLISH_SECRET"   # re-upload framework assets after editing src/
```

### Looking up URLs

Never construct URLs manually. Always use:

```sh
sh url.sh <slug>
```

This prints both the live app URL and the MCP endpoint URL.

### Checking for runtime errors

After publish, the Lux sentinel monitors your app in production. If users encounter runtime errors, they flow back to Convex automatically. Check them with:

```sh
npx convex run errors:recent '{"slug":"<slug>"}'
```

Clear them after fixing:

```sh
npx convex run errors:clear '{"slug":"<slug>","secret":"'$PUBLISH_SECRET'"}'
```

---

## 9. Plugins

no∅ plugins are self-registering scripts. Load them after `core.min.js` and they attach to the `Novoid` namespace.

### Router

Hash-based routing with guards and dynamic parameters.

```html
<script src="../js/router.min.js"></script>
```

```js
var { navigate, currentRoute } = Novoid.createRouter([
  { path: '/', component: function() { return Home(); } },
  { path: '/user/:id', component: function(ctx) { return User(ctx.params.id); } },
  { path: '/admin', component: function() { return Admin(); },
    guard: function() { return isAdmin(); }, redirect: '/login' },
  { path: '*', component: function() { return NotFound(); } }
], document.getElementById('app'));

// Programmatic navigation
navigate('/user/42');

// Create a link element
var link = Novoid.link('Home', '/', 'nv-btn');
```

Routes use hash-based URLs (`#/path`). Guards return a boolean -- if false, the user is redirected.

### Convex

Real-time database client with reactive queries.

```html
<script src="../js/convex.min.js"></script>
```

```js
var db = Novoid.createClient(CONVEX_URL);

// Reactive query -- auto-subscribes and updates
var { data, loading, error } = Novoid.useQuery(db, 'tasks:list', { orgId: '123' });

// Mutations
var addTask = Novoid.useMutation(db, 'tasks:add');
await addTask({ text: 'New task' });

// Actions (server-side functions)
var run = Novoid.useAction(db, 'ai:chat');
await run({ prompt: 'Hello' });
```

**Reactive arguments** -- pass a function to re-subscribe when args change:

```js
Novoid.useQuery(db, 'bills:get', function() { return { id: selectedId() }; });
```

**Skip** -- pass `'skip'` as args to disable the subscription:

```js
Novoid.useQuery(db, 'bills:get', 'skip');  // won't subscribe
```

**AI helper:**

```js
var send = Novoid.useAI(db, 'ai:chat');
await send({ prompt: 'Summarize this' });
send.response();   // the AI response
send.isLoading();  // boolean
send.history();    // conversation history
send.clear();      // reset
```

### Auth

User authentication and organization management.

```html
<script src="../js/auth.min.js"></script>  <!-- requires convex plugin -->
```

```js
var auth = Novoid.useNovoidAuth(db);

// Registration and login
await auth.register('user@example.com', 'password', 'Jane Doe');
await auth.login('user@example.com', 'password');
await auth.logout();

// State (all are getter functions)
auth.user();              // user object or null
auth.isAuthenticated();   // boolean
auth.isLoading();         // boolean
auth.error();             // error string or null
auth.getToken();          // session token

// Organization management
var org = Novoid.useOrg(db, auth);
org.orgs();               // list of organizations
org.currentOrg();         // current org object
org.currentRole();        // 'owner' | 'admin' | 'member'
org.switchOrg(orgId);     // switch active org
```

### Toast

Notification messages.

```html
<script src="../js/toast.min.js"></script>
```

```js
Novoid.toast.info('Document saved');
Novoid.toast.success('Published successfully');
Novoid.toast.danger('Failed to connect');
Novoid.toast.warning('Unsaved changes', 5000);  // custom duration in ms
```

---

## 10. CSS Reference

no∅ ships a complete CSS system with the `nv-` prefix. All classes work in both light and dark mode.

### Enabling dark mode

Add `data-theme="dark"` to the `<html>` element, or add the `nv-dark` class to any container.

### Typography

```
.nv-h1 through .nv-h6      -- heading sizes
.nv-text-xs through .nv-text-6xl  -- text sizes
.nv-font-light, .nv-font-normal, .nv-font-medium, .nv-font-semibold, .nv-font-bold, .nv-font-black
.nv-font-sans, .nv-font-mono, .nv-font-display
.nv-text-left, .nv-text-center, .nv-text-right
.nv-truncate, .nv-line-clamp-2, .nv-line-clamp-3
```

### Colors

**Text:** `.nv-text-primary`, `.nv-text-muted`, `.nv-text-subtle`, `.nv-text-success`, `.nv-text-warning`, `.nv-text-danger`, `.nv-text-info`, `.nv-text-white`

**Background:** `.nv-bg-primary`, `.nv-bg-subtle`, `.nv-bg-muted`, `.nv-bg-success`, `.nv-bg-warning`, `.nv-bg-danger`, `.nv-bg-info`, `.nv-bg-white`

### Layout

```
.nv-container                    -- centered max-width container
.nv-grid                        -- CSS grid
.nv-cols-1 through .nv-cols-6, .nv-cols-12  -- grid columns
.nv-col-span-1 through .nv-col-span-12, .nv-col-span-full
.nv-flex                        -- flexbox
.nv-stack                       -- vertical flex stack
.nv-items-start, .nv-items-center, .nv-items-end
.nv-justify-start, .nv-justify-center, .nv-justify-end, .nv-justify-between
```

### Spacing

```
.nv-p-0 through .nv-p-12       -- padding
.nv-px-0 through .nv-px-8      -- horizontal padding
.nv-py-0 through .nv-py-8      -- vertical padding
.nv-m-0 through .nv-m-4, .nv-m-auto  -- margin
.nv-mt-0 through .nv-mt-8      -- margin top
.nv-mb-0 through .nv-mb-8      -- margin bottom
.nv-gap-0 through .nv-gap-8    -- flex/grid gap
```

### Components

**Buttons:**
```
.nv-btn
.nv-btn-primary, .nv-btn-secondary, .nv-btn-success, .nv-btn-danger,
.nv-btn-warning, .nv-btn-ghost, .nv-btn-outline, .nv-btn-link
.nv-btn-sm, .nv-btn-lg, .nv-btn-xl, .nv-btn-icon, .nv-btn-block, .nv-btn-pill
.nv-btn-group
```

**Cards:**
```
.nv-card, .nv-card-elevated, .nv-card-header, .nv-card-body, .nv-card-footer, .nv-card-hoverable
```

**Forms:**
```
.nv-label, .nv-input, .nv-select, .nv-textarea, .nv-checkbox, .nv-radio, .nv-field
.nv-input-sm, .nv-input-lg, .nv-input-error, .nv-input-success
.nv-input-group, .nv-input-addon, .nv-toggle
```

**Tables:** `.nv-table`, `.nv-table-striped`, `.nv-table-hover`, `.nv-table-compact`

**Badges:** `.nv-badge`, `.nv-badge-primary`, `.nv-badge-success`, `.nv-badge-warning`, `.nv-badge-danger`, `.nv-badge-info`, `.nv-badge-neutral`, `.nv-badge-dot`, `.nv-badge-lg`

**Alerts:** `.nv-alert`, `.nv-alert-info`, `.nv-alert-success`, `.nv-alert-warning`, `.nv-alert-danger`, `.nv-alert-title`

**Modals:** `.nv-modal-overlay`, `.nv-modal`, `.nv-modal-header`, `.nv-modal-title`, `.nv-modal-body`, `.nv-modal-footer`, `.nv-modal-close`, `.nv-modal-sm`, `.nv-modal-lg`, `.nv-modal-xl`

**Drawers:** `.nv-drawer-overlay`, `.nv-drawer`, `.nv-drawer-left`, `.nv-drawer-right`, `.nv-drawer-header`, `.nv-drawer-body`, `.nv-drawer-footer`

**Other:** `.nv-spinner`, `.nv-skeleton`, `.nv-avatar`, `.nv-progress`, `.nv-breadcrumb`, `.nv-pagination`, `.nv-divider`, `.nv-tag`, `.nv-tooltip`, `.nv-popover`, `.nv-accordion`, `.nv-code`, `.nv-pre`, `.nv-prose`, `.nv-tabs`, `.nv-tab`, `.nv-dropdown`

### Active state

`.nv-active` toggles visibility on modals, drawers, dropdowns, and tabs.

### Animations

```
.nv-animate-fade-in, .nv-animate-fade-up, .nv-animate-fade-down
.nv-animate-scale-in, .nv-animate-slide-right, .nv-animate-slide-left
.nv-animate-bounce, .nv-animate-pulse
.nv-delay-100, .nv-delay-200, .nv-delay-300, .nv-delay-400, .nv-delay-500
```

### Responsive

```
.nv-sm-cols-2 through .nv-sm-cols-6   -- columns at small breakpoint
.nv-md-cols-2 through .nv-md-cols-6   -- columns at medium breakpoint
.nv-lg-cols-2 through .nv-lg-cols-6   -- columns at large breakpoint
.nv-hide-sm                           -- hide on small screens
.nv-hide-below-lg                     -- hide below large screens
```

### CSS variables

All theme values are exposed as CSS custom properties with the `--nv-` prefix:

```
--nv-primary-50 through --nv-primary-900
--nv-gray-50 through --nv-gray-900
--nv-success-50, --nv-success-500, --nv-success-700
--nv-warning-50, --nv-warning-500, --nv-warning-700
--nv-danger-50, --nv-danger-500, --nv-danger-700
--nv-info-50, --nv-info-500, --nv-info-700
--nv-bg, --nv-bg-subtle, --nv-bg-muted
--nv-text, --nv-text-muted, --nv-text-subtle
--nv-border, --nv-border-strong
--nv-ring
--nv-font-sans, --nv-font-mono, --nv-font-display
--nv-radius-none through --nv-radius-full
--nv-shadow-xs through --nv-shadow-2xl
```

---

## 11. Tips and Gotchas

These are the most common mistakes and the rules that prevent them.

### Signal getters are functions

This is the number one mistake. Signal getters must be called:

```js
// CORRECT
h('p', {}, () => count());
if (count() > 10) { ... }

// WRONG -- this passes the getter function itself, not the value
h('p', {}, count);
if (count > 10) { ... }  // always truthy (function objects are truthy)
```

### Always name your signals

```js
// CORRECT
var [count, setCount] = Novoid.signal(0, 'count');

// WRONG -- Nous warns, MCP shows "signal_0" instead of "count"
var [count, setCount] = Novoid.signal(0);
```

### No `</script>` inside JavaScript strings

The HTML parser closes the `<script>` tag when it encounters `</script>` anywhere -- even inside a string literal. This silently truncates your JavaScript.

```js
// CORRECT
var html = '</' + 'script>';

// WRONG -- breaks the HTML parser
var html = '</script>';
```

However, real closing `</script>` tags in HTML must NOT be escaped:

```html
<!-- CORRECT -->
</script>

<!-- WRONG -- backslash-escaping breaks HTML parsing -->
<\/script>
```

### Bind inputs outside effect()

Create bound inputs at component scope, not inside effects:

```js
// CORRECT
var input = h('input', { bind: [name, setName] });

// WRONG -- creates a new input every time the effect re-runs
Novoid.effect(function() {
  var input = h('input', { bind: [name, setName] });
});
```

### Partial state auto-merge

Store actions return only the keys that change. Do not spread the full state:

```js
// CORRECT
inc: function(s) { return { count: s.count + 1 }; }

// UNNECESSARY (works but wasteful)
inc: function(s) { return { ...s, count: s.count + 1 }; }
```

### Focus preservation

Give form inputs an `id` or `name` attribute so no∅ can restore focus after reactive updates:

```js
h('input', { id: 'search', bind: [query, setQuery] });
```

### onMount timing

`onMount` runs after the initial `mount()` call, via `requestAnimationFrame`. This means the DOM is fully laid out when your callback runs:

```js
Novoid.onMount(function() {
  // Safe to measure elements, set focus, start animations
  document.getElementById('search').focus();
});
```

### HTML is vanilla

Generated apps are plain HTML files. No build tools, no npm, no imports, no TypeScript, no JSX. This is by design -- it means zero configuration and instant loading.

### Edit src/, never dist/

The `dist/` directory and `convex/_generated/` are build outputs. Always edit files in `src/`. Run `sh build.sh` to regenerate `dist/`.

---

## 12. What's Next

### MCP endpoints

Every published app automatically gets an MCP (Model Context Protocol) endpoint. AI agents can read your app's state, call its actions, and query its data -- all through a standard JSON-RPC interface.

```
GET  /mcp/<slug>    -- JSON manifest (tools, resources, state)
POST /mcp/<slug>    -- MCP JSON-RPC (Streamable HTTP transport)
```

Store actions become MCP tools. Named signals and store state become MCP resources. Convex queries become live-readable resources. This happens with zero configuration.

### Multi-agent collaboration

Multiple AI agents can work on the same page simultaneously using Convex as a distributed coordination layer:

```sh
AGENT_ID="claude-$(date +%s | tail -c 5)"
npx convex run collab:status '{"slug":"my-app"}'
npx convex run collab:claim '{"slug":"my-app","name":"header","agentId":"'$AGENT_ID'","secret":"'$PUBLISH_SECRET'"}'
```

Agents claim fragments (atomic mutex), build their piece, then compose:

```sh
npx convex run collab:compose '{"slug":"my-app","secret":"'$PUBLISH_SECRET'"}'
```

### Views and navigation

For multi-page apps, the render system supports named views with tabs navigation:

```js
N.render('#app', store, {
  app: { name: 'My App' },
  navigation: {
    type: 'tabs',
    default: 'overview',
    items: [
      { view: 'overview' },
      { view: 'settings' },
      { view: 'detail', hidden: true }
    ]
  },
  views: {
    overview: {
      title: 'Overview',
      sections: [ ... ]
    },
    detail: {
      title: 'Detail',
      back: 'overview',
      sections: [ ... ]
    },
    settings: {
      title: 'Settings',
      sections: [ ... ]
    }
  }
});
```

Currently implemented: `tabs` navigation type, `default` view, `hidden` nav items, `back` buttons, view params via `__navigate`. Planned: `sidebar`, `stack`, `bottomBar` nav types, `transition` animations, `gate` (role-based access) on views, `icon` on views.

### Panels (planned)

Side drawers for editing and detail views. Not yet implemented in the render plugin. See `skills/novoid-render.md` for the planned API.

### Convex data bindings in render (planned)

Declarative `data: { queries, mutations, actions }` bindings for real-time Convex integration in render apps. Not yet implemented in the render plugin. For now, use the Convex plugin (`convex.min.js`) directly with `useQuery`/`useMutation` in classic or hybrid apps. See `skills/novoid-render.md` for the planned API.

### Advanced patterns

- **Error boundaries:** `Novoid.errorBoundary(renderFn, fallbackFn)` catches errors in a subtree
- **Suspense:** `Novoid.suspense(asyncFn, fallback)` shows a fallback while async data loads
- **Portals:** `Novoid.portal(target, content)` renders content outside the main tree (useful for modals)
- **Context:** `Novoid.createContext(default)` for scoped state without prop drilling
- **Event bus:** `Novoid.bus.on('event', fn)` / `Novoid.bus.emit('event', data)` for decoupled communication
- **Transitions:** `Novoid.transition(el, { enter, leave, duration })` for element animations
- **createForm:** Declarative form validation with schema-driven fields, errors, and submission handling

The complete API reference lives in `skills/novoid-core.md` and `skills/novoid-render.md`. For AI agents, the `skills/` directory contains codified knowledge that replaces reading source files. For human developers, `spec.md` and `render.md` remain the canonical specifications. Between them, you have everything you need to build any app with no∅.
