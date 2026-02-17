# render — spec

> Declarative UI language for no∅. State drives pixels. One vocabulary, one renderer.

## Architecture

```
store  → state + actions + computed       (agentic layer, testable via MCP)
render → sections + bindings + wiring     (UI layer, pattern-locked)
```

The agent writes `store` and `render`. The renderer (`render.min.js`) owns all DOM, CSS, layout, transitions, and responsive behavior. Apps never contain `h()` calls or CSS.

---

## File Format

```yaml
# inline in HTML
render:
  sections: [...]

# or standalone file
# src/app/my-app.render.yaml
```

Loaded via:
```html
<script src="../js/core.min.js"></script>
<script src="../js/render.min.js"></script>
<script>
Novoid.render('#app', store, render);
</script>
```

---

## Reactive Expressions

Anything prefixed with `$` is reactive — the renderer auto-subscribes and updates the DOM when the value changes.

| Expression | Source | Example |
|---|---|---|
| `$key` | Store state | `$filter`, `$count` |
| `$computed` | Store computed | `$totalSavings` |
| `$q.ref` | Convex query result | `$q.bills` |
| `$auth.field` | Auth state | `$auth.user`, `$auth.role` |
| `$params.key` | View params | `$params.id` |
| `$row.key` | Current table row | `$row.installation` |
| `$item.key` | Current card/list item | `$item.name` |
| `$self` | Current input value | slider, text field |
| `"$a + $b"` | Inline expression | `"$price * $qty"` |
| `$q.ref.field` | Nested query field | `$q.stats.totalCost` |

**Null safety:** `$q.ref` returns `null` while loading. Sections with `gate: $q.ref` wait until resolved.

---

## Sections

The complete UI vocabulary. Every visible element is one of these.

### metrics

KPI cards in a responsive grid.

```yaml
- metrics:
    columns: 4                          # 1-6, responsive default
    items:
      - label: Costo Este Mes
        value: $q.stats.totalCost
        format: currency
        color: teal
      - label: Ahorro
        value: $totalSavings
        format: currency
        color: green
        trend: { value: $q.stats.savingsPercent, format: percent }
      - label: Items
        value: $q.bills.length
        color: blue
```

### table

Data table with optional filter, sort, pagination, row actions.

```yaml
- table:
    title: Facturas
    source: $filteredBills
    empty: "Sin resultados"
    loading: skeleton
    filter:
      key: status
      action: setFilter
      options:
        - { value: all, label: Todas }
        - { value: draft, label: Borrador }
        - { value: paid, label: Pagada }
    sort:
      default: { key: totalCost, dir: desc }
      action: setSort
    columns:
      - { key: installation, label: Instalacion, subtitle: period }
      - { key: consumptionKwh, label: Consumo, format: kwh }
      - { key: totalCost, label: Costo, format: currency, bold: true }
      - { key: status, label: Estado, badge: true }
      - { key: savings, label: Ahorro, format: currency, color: green, icon: arrowDown }
    onRowClick:
      navigate: detail
      params: { id: $row.id }
    pageSize: 10                        # omit for no pagination
```

### cards

Iterable card list with a template.

```yaml
- cards:
    title: Tarifas
    source: $q.tariffs
    empty: "No hay tarifas"
    select:
      bind: $selectedTariff
      action: selectTariff
      arg: id
    actions:                            # header-level action buttons
      - { label: Agregar, mutation: m.createTariff, icon: plus, style: primary }
    template:
      title: $item.name
      subtitle: $item.provider
      badge: { value: $item.type, map: { horaria: Horaria, fija: Fija } }
      grid:
        - { label: Pico, value: $item.peakRate, format: rate }
        - { label: Base, value: $item.baseRate, format: rate }
        - { label: Feed-in, value: $item.feedInRate, format: rate, color: teal }
      footer: "$item.installations instalaciones"
      menu:                             # per-card action menu
        - { label: Editar, action: openPanel, args: { view: editTariff, id: $item.id } }
        - { label: Eliminar, mutation: m.deleteTariff, args: { id: $item.id }, confirm: "Eliminar?", style: danger }
```

### form

Input fields bound to store state or Convex mutations.

```yaml
- form:
    title: Editar Factura
    mutation: m.updateBill
    args: { id: $params.id }            # extra args merged into submission
    fields:
      - { key: installation, label: Instalacion, type: text, required: true }
      - { key: consumptionKwh, label: Consumo, type: number, required: true, min: 0 }
      - { key: period, label: Periodo, type: select, options: $q.periods }
      - { key: status, label: Estado, type: radio, options: [draft, final, paid] }
      - { key: notes, label: Notas, type: textarea, maxLength: 500 }
      - { key: isActive, label: Activo, type: toggle }
      - { key: multiplier, label: Factor, type: slider, min: 0.5, max: 2.0, step: 0.1 }
      - { key: startDate, label: Fecha Inicio, type: date }
    submit: Guardar
    cancel: { navigate: overview }
    onSuccess: { navigate: detail, params: { id: $result.id } }
    onError: toast
```

**Bind mode** — for store-driven forms (no mutation, immediate reactivity):
```yaml
- form:
    bind: store
    fields:
      - { key: simulationMultiplier, label: Factor, type: slider, min: 0.5, max: 2.0, action: simulate, args: { value: $self } }
```

### chart

Data visualization.

```yaml
- chart:
    title: Consumo vs Produccion
    type: bar                           # bar | line | area | pie | donut | spark
    source: $q.monthlyHistory
    x: month
    series:
      - { key: consumption, label: Consumo, color: gray }
      - { key: production, label: Produccion, color: teal }
    height: 300                         # px, optional
```

**Spark** — inline mini chart inside a metric:
```yaml
- metrics:
    items:
      - label: Produccion
        value: $q.stats.totalKwh
        format: kwh
        spark: { source: $q.monthlyHistory, key: production, color: teal }
```

### header

Page/section header with title, badges, action buttons.

```yaml
- header:
    title: $q.billDetail.installation
    subtitle: $q.billDetail.period
    badge: { value: $q.billDetail.status, badge: true }
    back: overview
    actions:
      - { label: Exportar, serverAction: a.exportPdf, args: { id: $params.id }, icon: download, style: outline }
      - { label: Eliminar, mutation: m.deleteBill, args: { id: $params.id }, confirm: "Seguro?", style: danger, gate: [admin] }
```

### row

Multi-column layout container.

```yaml
- row:
    columns: 2                          # 2-4
    items:
      - cards: { ... }
      - cards: { ... }
```

### list

Simple list (no card chrome).

```yaml
- list:
    source: $q.notifications
    template:
      icon: { value: $item.type, map: { alert: bell, info: info } }
      title: $item.message
      subtitle: { value: $item.createdAt, format: timeAgo }
      action: { navigate: detail, params: { id: $item.refId } }
```

### stat

Single large stat display (for detail pages).

```yaml
- stat:
    value: $q.billDetail.savings
    format: currency
    label: Ahorro Total
    color: green
    icon: trendingDown
    size: lg                            # sm | md | lg
```

### empty

Empty state placeholder.

```yaml
- empty:
    icon: inbox
    title: Sin facturas
    description: Agrega tu primera factura para comenzar
    action: { label: Crear Factura, navigate: create }
```

### divider

Visual separator.

```yaml
- divider
- divider: { label: "O continuar con" }
```

---

## Conditionals

### when

Render section only when expression is truthy.

```yaml
- when: $q.billDetail.status === 'draft'
  section:
    - form: { ... }

- when: $auth.role === 'admin'
  section:
    - cards: { title: Admin Tools, ... }
```

### show

Reactive visibility on any section (renders but hides, preserves state).

```yaml
- metrics:
    show: $isExpanded
    items: [...]
```

### gate

Access control — section not rendered unless role matches.

```yaml
- form:
    gate: [admin, operator]
    title: Configuracion
    fields: [...]
```

### loading

Placeholder while data resolves.

```yaml
- table:
    gate: $q.bills                      # wait for query
    loading: skeleton                   # skeleton | spinner
    source: $q.bills
    columns: [...]
```

---

## Actions

How UI events connect to logic. Every interactive element uses one of these.

### Store action
```yaml
action: setFilter
args: { value: $row.status }
```

### Convex mutation
```yaml
mutation: m.updateBill
args: { id: $params.id, status: "paid" }
confirm: "Marcar como pagada?"          # optional confirmation
onSuccess: { toast: "Factura actualizada" }
onError: toast
```

### Convex server action
```yaml
serverAction: a.exportPdf
args: { id: $params.id }
onSuccess: { toast: "PDF generado" }
```

### Navigate
```yaml
navigate: detail
params: { id: $row.id }
transition: slide                       # override default transition
```

### Composite (action chain)
```yaml
do:
  - mutation: m.updateBill, args: { id: $params.id, status: "paid" }
  - toast: "Factura pagada"
  - navigate: overview
```

---

## Views

Multi-page apps define named views.

```yaml
views:
  overview:
    title: Resumen
    icon: home
    sections: [...]

  detail:
    title: Factura
    icon: receipt
    params: [id]                        # URL params: #/detail/123
    back: overview
    gate: $q.billDetail                 # wait for data
    loading: skeleton
    sections: [...]

  create:
    title: Nueva Factura
    icon: plus
    gate: [admin, operator]
    sections:
      - form: { mutation: m.createBill, ... }

  settings:
    title: Configuracion
    icon: gear
    gate: [admin]
    sections: [...]
```

**Single-view apps** omit `views:` and use `sections:` directly:
```yaml
render:
  sections:
    - metrics: { ... }
    - table: { ... }
```

---

## Navigation

```yaml
navigation:
  type: tabs                            # tabs | sidebar | stack | bottomBar
  default: overview
  transition: fade                      # fade | slide | none
  items:
    - { view: overview }
    - { view: settings }
    - { view: detail, hidden: true }    # reachable but not in nav
    - { view: create, hidden: true }
  mobile: bottomBar                     # override nav type on mobile
```

---

## Panels

Side drawers, triggered by store state.

```yaml
panels:
  editTariff:
    title: Editar Tarifa
    position: right                     # left | right
    size: md                            # sm | md | lg
    trigger: { bind: $sidePanel, value: editTariff }
    close: closePanel
    sections:
      - form: { ... }
```

---

## Data

Convex bindings declared at the top level.

```yaml
data:
  queries:
    bills: { ref: "bills:list", args: { orgId: $auth.orgId } }
    billDetail: { ref: "bills:get", args: { id: $params.id }, skip: $params.id }
    stats: { ref: "stats:monthly", args: { period: $activePeriod } }

  mutations:
    createBill: { ref: "bills:create" }
    updateBill: { ref: "bills:update" }
    deleteBill: { ref: "bills:remove" }

  actions:
    exportPdf: { ref: "reports:generatePdf" }
    forecast: { ref: "ai:forecastSavings" }
```

Referenced in sections as `$q.bills`, `m.createBill`, `a.exportPdf`.

**skip** — don't subscribe until expression is truthy:
```yaml
billDetail: { ref: "bills:get", args: { id: $params.id }, skip: $params.id }
```

---

## Auth

```yaml
auth:
  required: true                        # false for public apps
  provider: novoid                      # novoid | custom token fn
  roles: [admin, operator, viewer]
  redirect: login                       # view to show when unauthenticated
  gates:
    settings: [admin]
    create: [admin, operator]
```

Built-in auth expressions: `$auth.user`, `$auth.role`, `$auth.orgId`, `$auth.isAuthenticated`.

---

## Formats

| Key | Output | Example |
|---|---|---|
| `currency` | `$45,250` (locale-aware) | `$q.stats.totalCost` |
| `kwh` | `12,500 kWh` | `$row.consumptionKwh` |
| `rate` | `$3.25/kWh` | `$item.peakRate` |
| `percent` | `42%` | `$avgSavingsPercent` |
| `number` | `1,234` | `$count` |
| `date` | `12 Dic 2024` | `$row.createdAt` |
| `datetime` | `12 Dic 2024, 14:30` | `$row.updatedAt` |
| `timeAgo` | `hace 3 min` | `$item.timestamp` |
| `bytes` | `1.2 MB` | `$item.fileSize` |
| `duration` | `2h 15m` | `$item.elapsed` |
| `custom` | User-defined | `format: { template: "{} unidades" }` |

Locale follows `app.locale`. Defaults to browser locale.

---

## Colors

Semantic color tokens used across all sections:

```
teal  green  blue  purple  red  orange  yellow  gray
```

Applied via `color: teal` on any value, badge, icon, or chart series.

---

## Icons

Subset of Lucide icon names, rendered by the renderer:

```
home receipt dollar trending-up trending-down percent zap file-text
building arrow-up arrow-down arrow-right check x plus minus edit trash
download upload search filter settings gear bell info alert-triangle
inbox user users lock unlock mail phone calendar clock chart-bar
chart-line chart-pie star heart bookmark flag tag folder eye eye-off
```

Used in: `icon: download`, `metric.icon`, `list.template.icon`, `header.actions[].icon`.

---

## Responsive

The renderer handles breakpoints automatically:

| Breakpoint | Behavior |
|---|---|
| `< 640px` | metrics → 1 col, table hides overflow columns, sidebar → bottomBar |
| `640-1024px` | metrics → 2 col, row → stacked |
| `> 1024px` | Full layout as declared |

Override per section:
```yaml
- table:
    columns:
      - { key: installation, label: Instalacion }
      - { key: totalCost, label: Costo, format: currency }
      - { key: savings, label: Ahorro, format: currency, hideBelow: md }
      - { key: exportKwh, label: Export, format: kwh, hideBelow: lg }
```

---

## Full Example (minimal)

```yaml
app:
  name: Contador
  theme: dark

store:
  state: { count: 0 }
  actions:
    inc: { set: { count: "$count + 1" } }
    reset: { set: { count: 0 } }

render:
  sections:
    - stat:
        value: $count
        label: Contador
        size: lg
    - row:
        columns: 2
        items:
          - button: { label: "+1", action: inc, style: primary }
          - button: { label: Reset, action: reset, style: outline }
```
