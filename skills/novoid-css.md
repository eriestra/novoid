# novoid-css

Codified knowledge for the no∅ design system. This file replaces reading `src/core.css` and `src/components.css`.

> **Render apps don't need this skill.** The render plugin owns all DOM and CSS. This skill is for classic apps using `h()` calls.

## Loading

```html
<link rel="stylesheet" href="../css/core.min.css">
```

Fonts: DM Sans (body), Outfit (headings), JetBrains Mono (code). Load via Google Fonts or self-host.

---

# novoid-css

Codified knowledge for the no∅ design system. Replaces reading `src/core.css`.

> **Render apps don't need this skill.** The render plugin owns all CSS. This skill is for classic apps using `h()` calls.

## 1. Quick Start & Theme Setup
Load the CSS once in your HTML:
```html
<link rel="stylesheet" href="../css/core.min.css">
```
To enable Dark Mode, set the attribute on the root:
```javascript
document.documentElement.setAttribute('data-theme', 'dark');
```

## 2. Layout Patterns
Instead of writing custom CSS, use these layout combinations:

### Page Container
Use `.nv-container` with `.nv-section` for the main content block.
```js
Novoid.h('div', { class: 'nv-container nv-section nv-stack nv-gap-6' }, ...)
```

### Grids (Responsive)
```js
// 1 col on mobile, 2 on sm, 3 on md/lg
Novoid.h('div', { class: 'nv-grid nv-cols-1 nv-sm-cols-2 nv-md-cols-3 nv-gap-4' })
```

### Flexbox Centering
```js
Novoid.h('div', { class: 'nv-flex nv-items-center nv-justify-between' })
```

## 3. Core UI Components

### Typography & Colors
- Primary text: `nv-text-primary` or `nv-text-muted`
- Headings: `nv-h1` through `nv-h6` (always use these for titles, not custom sizes)
- Sizes: `nv-text-sm`, `nv-text-lg`
- Backgrounds: `nv-bg-subtle` (light gray / dark gray), `nv-bg-primary`

### Buttons
All buttons need `.nv-btn`. Add modifiers for style:
```js
// Primary action
Novoid.h('button', { class: 'nv-btn nv-btn-primary' }, 'Save')
// Outline/secondary action
Novoid.h('button', { class: 'nv-btn nv-btn-outline' }, 'Cancel')
```

### Cards
Use cards to group content.
```js
Novoid.h('div', { class: 'nv-card nv-card-hoverable' }, 
  Novoid.h('div', { class: 'nv-card-body nv-stack nv-gap-4' },
    Novoid.h('h3', { class: 'nv-h3' }, 'Title'),
    Novoid.h('p', { class: 'nv-text-muted' }, 'Content...')
  )
)
```

### Inputs & Forms
Always wrap inputs in `.nv-field` and labels in `.nv-label`.
```js
Novoid.h('div', { class: 'nv-field nv-stack nv-gap-2' },
  Novoid.h('label', { class: 'nv-label' }, 'Email'),
  Novoid.h('input', { type: 'email', class: 'nv-input nv-w-full' })
)
```

## 4. Interaction States (Toggle)
Many components (modals, dropdowns, tabs) are shown/hidden by toggling the `.nv-active` class via standard JS UI logic.

```js
// Example: showing a modal
const [showModal, setShowModal] = Novoid.signal(false, 'modal');

Novoid.h('div', { 
  class: () => 'nv-modal-overlay' + (showModal() ? ' nv-active' : '') 
}, ...)
```

## Do Not Do This
- **Do not write inline styles `style="margin: 20px"`**. Use spacing classes (`nv-m-4`, `nv-p-2`, `nv-gap-6`).
- **Do not hardcode hex colors**. Use semantic colors (`nv-text-success`, `nv-text-danger`, etc) so dark mode auto-inverts correctly.
