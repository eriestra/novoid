# no∅ — Agent Skills

> **Machine mnemonic.** Agents see `no∅` and know: CSS prefix `nv-`, CSS vars `--nv-`, JS global `Novoid`. Humans never touch the code — agents generate it.

---

## Identity

| Key | Value |
|---|---|
| Name | no∅ |
| CSS class prefix | `nv-` |
| CSS variable prefix | `--nv-` |
| JS global | `Novoid` |
| Build tools | None — zero compilation |
| Fonts | DM Sans (body), Outfit (display/headings), JetBrains Mono (code) via Google Fonts |
| Breakpoints | 640px (sm), 768px (md), 1024px (lg), 1280px (xl) |
| Dark mode | `[data-theme="dark"]` or `.nv-dark` on ancestor |
| Reactivity | Fine-grained signals — no virtual DOM |
| Router | Hash-based (`#/path`) |

---

## Quick Start

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="nv.css">
</head>
<body>
  <div id="app"></div>
  <script src="nv.js"></script>
  <script>
    const { signal, effect, h, mount } = Novoid;

    mount('#app', () => {
      const [count, setCount] = signal(0);
      return h('div', { class: 'nv-container nv-py-8' },
        h('h1', { class: 'nv-h2 nv-mb-4' }, 'Hello no∅'),
        h('p', { class: 'nv-text-lg nv-mb-4' }, () => `Count: ${count()}`),
        h('button', { class: 'nv-btn nv-btn-primary', onClick: () => setCount(n => n + 1) }, 'Increment')
      );
    });
  </script>
</body>
</html>
```

---

## CSS

### Design Tokens

All tokens are CSS custom properties on `:root`. Dark theme overrides surface tokens automatically.

#### Colors

**Primary** (indigo scale):

| Token | Value |
|---|---|
| `--nv-primary-50` | `#eef2ff` |
| `--nv-primary-100` | `#dbe4ff` |
| `--nv-primary-200` | `#bac8ff` |
| `--nv-primary-300` | `#91a7ff` |
| `--nv-primary-400` | `#748ffc` |
| `--nv-primary-500` | `#5c7cfa` |
| `--nv-primary-600` | `#4c6ef5` |
| `--nv-primary-700` | `#4263eb` |
| `--nv-primary-800` | `#3b5bdb` |
| `--nv-primary-900` | `#364fc7` |

**Neutral** (gray scale):

| Token | Value |
|---|---|
| `--nv-gray-50` | `#f8f9fa` |
| `--nv-gray-100` | `#f1f3f5` |
| `--nv-gray-200` | `#e9ecef` |
| `--nv-gray-300` | `#dee2e6` |
| `--nv-gray-400` | `#ced4da` |
| `--nv-gray-500` | `#adb5bd` |
| `--nv-gray-600` | `#868e96` |
| `--nv-gray-700` | `#495057` |
| `--nv-gray-800` | `#343a40` |
| `--nv-gray-900` | `#212529` |

**Semantic** (each has -50, -500, -700):

| Scale | -50 | -500 | -700 |
|---|---|---|---|
| `--nv-success-*` | `#ebfbee` | `#40c057` | `#2b8a3e` |
| `--nv-warning-*` | `#fff9db` | `#fab005` | `#e67700` |
| `--nv-danger-*` | `#fff5f5` | `#fa5252` | `#c92a2a` |
| `--nv-info-*` | `#e7f5ff` | `#339af0` | `#1971c2` |

**Theme Surfaces** (auto-switch in dark mode):

| Token | Light | Dark |
|---|---|---|
| `--nv-bg` | `#ffffff` | `#0f1117` |
| `--nv-bg-subtle` | `gray-50` | `#1a1d27` |
| `--nv-bg-muted` | `gray-100` | `#252833` |
| `--nv-text` | `gray-900` | `#e4e5e9` |
| `--nv-text-muted` | `gray-600` | `#9ca0ab` |
| `--nv-text-subtle` | `gray-400` | `#5c6170` |
| `--nv-border` | `gray-200` | `#2e3140` |
| `--nv-border-strong` | `gray-300` | `#3d4155` |
| `--nv-ring` | `primary-500` | `primary-500` |

#### Typography

| Token | Value |
|---|---|
| `--nv-font-sans` | `'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |
| `--nv-font-mono` | `'JetBrains Mono', 'Fira Code', 'Consolas', monospace` |
| `--nv-font-display` | `'Outfit', var(--nv-font-sans)` |

**Font Sizes:**

| Token | Value |
|---|---|
| `--nv-text-xs` | `0.75rem` |
| `--nv-text-sm` | `0.875rem` |
| `--nv-text-base` | `1rem` |
| `--nv-text-lg` | `1.125rem` |
| `--nv-text-xl` | `1.25rem` |
| `--nv-text-2xl` | `1.5rem` |
| `--nv-text-3xl` | `1.875rem` |
| `--nv-text-4xl` | `2.25rem` |
| `--nv-text-5xl` | `3rem` |
| `--nv-text-6xl` | `3.75rem` |

**Font Weights:**

| Token | Value |
|---|---|
| `--nv-font-light` | `300` |
| `--nv-font-normal` | `400` |
| `--nv-font-medium` | `500` |
| `--nv-font-semibold` | `600` |
| `--nv-font-bold` | `700` |
| `--nv-font-black` | `900` |

#### Spacing

| Token | Value |
|---|---|
| `--nv-space-0` | `0` |
| `--nv-space-1` | `0.25rem` |
| `--nv-space-2` | `0.5rem` |
| `--nv-space-3` | `0.75rem` |
| `--nv-space-4` | `1rem` |
| `--nv-space-5` | `1.25rem` |
| `--nv-space-6` | `1.5rem` |
| `--nv-space-8` | `2rem` |
| `--nv-space-10` | `2.5rem` |
| `--nv-space-12` | `3rem` |
| `--nv-space-16` | `4rem` |
| `--nv-space-20` | `5rem` |
| `--nv-space-24` | `6rem` |

#### Radius / Shadows / Transitions / Z-index

**Border Radius:**

| Token | Value |
|---|---|
| `--nv-radius-none` | `0` |
| `--nv-radius-sm` | `0.25rem` |
| `--nv-radius-md` | `0.5rem` |
| `--nv-radius-lg` | `0.75rem` |
| `--nv-radius-xl` | `1rem` |
| `--nv-radius-2xl` | `1.5rem` |
| `--nv-radius-full` | `9999px` |

**Shadows:**

| Token | Value |
|---|---|
| `--nv-shadow-xs` | `0 1px 2px rgba(0,0,0,0.05)` |
| `--nv-shadow-sm` | `0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)` |
| `--nv-shadow-md` | `0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06)` |
| `--nv-shadow-lg` | `0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)` |
| `--nv-shadow-xl` | `0 20px 25px rgba(0,0,0,0.1), 0 8px 10px rgba(0,0,0,0.04)` |
| `--nv-shadow-2xl` | `0 25px 50px rgba(0,0,0,0.15)` |

**Transitions:**

| Token | Value |
|---|---|
| `--nv-ease` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `--nv-ease-in` | `cubic-bezier(0.4, 0, 1, 1)` |
| `--nv-ease-out` | `cubic-bezier(0, 0, 0.2, 1)` |
| `--nv-duration-fast` | `150ms` |
| `--nv-duration-normal` | `250ms` |
| `--nv-duration-slow` | `400ms` |

**Z-Index:**

| Token | Value |
|---|---|
| `--nv-z-base` | `0` |
| `--nv-z-dropdown` | `100` |
| `--nv-z-sticky` | `200` |
| `--nv-z-overlay` | `300` |
| `--nv-z-modal` | `400` |
| `--nv-z-popover` | `500` |
| `--nv-z-toast` | `600` |

---

### Dark Theme

Apply `data-theme="dark"` on `<html>` or add `nv-dark` class to any ancestor. Surface tokens remap automatically.

```html
<!-- Whole page dark -->
<html data-theme="dark">

<!-- Section-level dark -->
<div class="nv-dark">
  <div class="nv-card"><div class="nv-card-body">Dark card</div></div>
</div>
```

Toggle via JS:

```js
document.documentElement.setAttribute('data-theme',
  document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
);
```

---

### Layout

#### Container

| Class | Description |
|---|---|
| `nv-container` | Centered container, responsive `max-width` at each breakpoint (640/768/1024/1280) |
| `nv-container-fluid` | Full width with horizontal padding |
| `nv-section` | Vertical padding (`--nv-space-16`) for page sections |

```html
<div class="nv-container">
  <div class="nv-section">
    <h2 class="nv-h2">Section Title</h2>
  </div>
</div>
```

#### Grid

| Class | Description |
|---|---|
| `nv-grid` | CSS Grid container with `gap: --nv-space-4` |
| `nv-cols-{1,2,3,4,5,6,12}` | Column count |
| `nv-col-span-{1,2,3,4,6,8,12}` | Column span |
| `nv-col-span-full` | Span all columns (`1 / -1`) |

**Responsive grid:**

| Class | Description |
|---|---|
| `nv-sm-cols-{2,3}` | Columns at ≥640px |
| `nv-md-cols-{2,3,4}` | Columns at ≥768px |
| `nv-lg-cols-{2,3,4,5,6}` | Columns at ≥1024px |

```html
<div class="nv-grid nv-cols-1 nv-md-cols-2 nv-lg-cols-3 nv-gap-4">
  <div class="nv-card"><div class="nv-card-body">A</div></div>
  <div class="nv-card"><div class="nv-card-body">B</div></div>
  <div class="nv-card"><div class="nv-card-body">C</div></div>
</div>
```

#### Flexbox

| Class | Description |
|---|---|
| `nv-flex` | `display: flex` |
| `nv-inline-flex` | `display: inline-flex` |
| `nv-flex-row` | `flex-direction: row` |
| `nv-flex-col` | `flex-direction: column` |
| `nv-flex-wrap` | `flex-wrap: wrap` |
| `nv-flex-nowrap` | `flex-wrap: nowrap` |
| `nv-flex-1` | `flex: 1 1 0%` |
| `nv-flex-auto` | `flex: 1 1 auto` |
| `nv-flex-none` | `flex: none` |
| `nv-grow` | `flex-grow: 1` |
| `nv-shrink-0` | `flex-shrink: 0` |

**Alignment:**

| Class | Description |
|---|---|
| `nv-items-start` | `align-items: flex-start` |
| `nv-items-center` | `align-items: center` |
| `nv-items-end` | `align-items: flex-end` |
| `nv-items-stretch` | `align-items: stretch` |
| `nv-items-baseline` | `align-items: baseline` |
| `nv-justify-start` | `justify-content: flex-start` |
| `nv-justify-center` | `justify-content: center` |
| `nv-justify-end` | `justify-content: flex-end` |
| `nv-justify-between` | `justify-content: space-between` |
| `nv-justify-around` | `justify-content: space-around` |
| `nv-justify-evenly` | `justify-content: space-evenly` |
| `nv-self-start` | `align-self: flex-start` |
| `nv-self-center` | `align-self: center` |
| `nv-self-end` | `align-self: flex-end` |

```html
<div class="nv-flex nv-items-center nv-justify-between nv-gap-4">
  <span>Left</span>
  <span>Right</span>
</div>
```

---

### Spacing Classes

**Padding:**

| Pattern | Sizes |
|---|---|
| `nv-p-{0,1,2,3,4,5,6,8,10,12}` | All sides |
| `nv-px-{0,1,2,3,4,6,8}` | Horizontal (inline) |
| `nv-py-{0,1,2,3,4,6,8}` | Vertical (block) |

**Margin:**

| Pattern | Sizes |
|---|---|
| `nv-m-{0,1,2,3,4,auto}` | All sides |
| `nv-mx-auto` | Horizontal auto (centering) |
| `nv-my-{0,2,4,6,8}` | Vertical |
| `nv-mt-{0,1,2,3,4,6,8}` | Top |
| `nv-mb-{0,1,2,3,4,6,8}` | Bottom |
| `nv-ml-auto` | Left auto |
| `nv-mr-auto` | Right auto |

**Gap:**

| Pattern | Sizes |
|---|---|
| `nv-gap-{0,1,2,3,4,6,8}` | Flex/grid gap |

---

### Sizing

| Class | Description |
|---|---|
| `nv-w-full` | `width: 100%` |
| `nv-w-auto` | `width: auto` |
| `nv-w-screen` | `width: 100vw` |
| `nv-h-full` | `height: 100%` |
| `nv-h-screen` | `height: 100vh` |
| `nv-min-h-screen` | `min-height: 100vh` |
| `nv-max-w-xs` | `max-width: 20rem` |
| `nv-max-w-sm` | `max-width: 24rem` |
| `nv-max-w-md` | `max-width: 28rem` |
| `nv-max-w-lg` | `max-width: 32rem` |
| `nv-max-w-xl` | `max-width: 36rem` |
| `nv-max-w-2xl` | `max-width: 42rem` |
| `nv-max-w-3xl` | `max-width: 48rem` |
| `nv-max-w-4xl` | `max-width: 56rem` |
| `nv-max-w-prose` | `max-width: 65ch` |

---

### Display & Position

| Class | Description |
|---|---|
| `nv-block` | `display: block` |
| `nv-inline-block` | `display: inline-block` |
| `nv-inline` | `display: inline` |
| `nv-hidden` | `display: none` |
| `nv-relative` | `position: relative` |
| `nv-absolute` | `position: absolute` |
| `nv-fixed` | `position: fixed` |
| `nv-sticky` | `position: sticky; top: 0` |
| `nv-top-0` | `top: 0` |
| `nv-right-0` | `right: 0` |
| `nv-bottom-0` | `bottom: 0` |
| `nv-left-0` | `left: 0` |
| `nv-inset-0` | `inset: 0` |
| `nv-overflow-hidden` | `overflow: hidden` |
| `nv-overflow-auto` | `overflow: auto` |
| `nv-overflow-x-auto` | `overflow-x: auto` |
| `nv-overflow-y-auto` | `overflow-y: auto` |
| `nv-z-0` | `z-index: 0` |
| `nv-z-10` | `z-index: 10` |
| `nv-z-20` | `z-index: 20` |
| `nv-z-dropdown` | `z-index: var(--nv-z-dropdown)` |
| `nv-z-modal` | `z-index: var(--nv-z-modal)` |
| `nv-z-toast` | `z-index: var(--nv-z-toast)` |

---

### Borders & Radius

| Class | Description |
|---|---|
| `nv-border` | `1px solid var(--nv-border)` |
| `nv-border-strong` | `1px solid var(--nv-border-strong)` |
| `nv-border-t` | Top border |
| `nv-border-b` | Bottom border |
| `nv-border-l` | Left border |
| `nv-border-r` | Right border |
| `nv-border-none` | No border |
| `nv-border-primary` | `border-color: var(--nv-primary-500)` |
| `nv-border-danger` | `border-color: var(--nv-danger-500)` |
| `nv-border-2` | `border-width: 2px` |
| `nv-rounded-none` | `border-radius: 0` |
| `nv-rounded-sm` | `border-radius: 0.25rem` |
| `nv-rounded` | `border-radius: 0.5rem` |
| `nv-rounded-lg` | `border-radius: 0.75rem` |
| `nv-rounded-xl` | `border-radius: 1rem` |
| `nv-rounded-2xl` | `border-radius: 1.5rem` |
| `nv-rounded-full` | `border-radius: 9999px` |

---

### Shadows & Opacity

**Shadows:**

| Class | Description |
|---|---|
| `nv-shadow-xs` | Extra-small shadow |
| `nv-shadow-sm` | Small shadow |
| `nv-shadow` | Medium shadow (default) |
| `nv-shadow-lg` | Large shadow |
| `nv-shadow-xl` | Extra-large shadow |
| `nv-shadow-2xl` | 2XL shadow |
| `nv-shadow-none` | No shadow |

**Opacity:**

| Class | Value |
|---|---|
| `nv-opacity-0` | `0` |
| `nv-opacity-25` | `0.25` |
| `nv-opacity-50` | `0.5` |
| `nv-opacity-75` | `0.75` |
| `nv-opacity-100` | `1` |

---

### Typography Classes

**Headings** (use `--nv-font-display`, bold, tight line-height):

| Class | Size |
|---|---|
| `nv-h1` | `--nv-text-5xl` (3rem) |
| `nv-h2` | `--nv-text-4xl` (2.25rem) |
| `nv-h3` | `--nv-text-3xl` (1.875rem) |
| `nv-h4` | `--nv-text-2xl` (1.5rem) |
| `nv-h5` | `--nv-text-xl` (1.25rem) |
| `nv-h6` | `--nv-text-lg` (1.125rem) |

**Text sizes:** `nv-text-xs`, `nv-text-sm`, `nv-text-base`, `nv-text-lg`, `nv-text-xl`, `nv-text-2xl`, `nv-text-3xl`, `nv-text-4xl`, `nv-text-5xl`, `nv-text-6xl`

**Font weights:** `nv-font-light`, `nv-font-normal`, `nv-font-medium`, `nv-font-semibold`, `nv-font-bold`, `nv-font-black`

**Font families:** `nv-font-sans`, `nv-font-mono`, `nv-font-display`

**Alignment:** `nv-text-left`, `nv-text-center`, `nv-text-right`, `nv-text-justify`

**Transform:** `nv-uppercase`, `nv-lowercase`, `nv-capitalize`

**Tracking:** `nv-tracking-tight` (-0.025em), `nv-tracking-wide` (0.05em), `nv-tracking-wider` (0.1em)

**Leading:** `nv-leading-tight` (1.25), `nv-leading-normal` (1.6), `nv-leading-relaxed` (1.75)

**Truncation:** `nv-truncate` (single line ellipsis), `nv-line-clamp-2`, `nv-line-clamp-3`

---

### Color Classes

**Text colors:**

| Class | Description |
|---|---|
| `nv-text-primary` | `--nv-primary-600` |
| `nv-text-muted` | `--nv-text-muted` |
| `nv-text-subtle` | `--nv-text-subtle` |
| `nv-text-success` | `--nv-success-700` |
| `nv-text-warning` | `--nv-warning-700` |
| `nv-text-danger` | `--nv-danger-700` |
| `nv-text-info` | `--nv-info-700` |
| `nv-text-white` | `#fff` |

**Background colors:**

| Class | Description |
|---|---|
| `nv-bg-primary` | `--nv-primary-600` |
| `nv-bg-subtle` | `--nv-bg-subtle` |
| `nv-bg-muted` | `--nv-bg-muted` |
| `nv-bg-success` | `--nv-success-500` |
| `nv-bg-warning` | `--nv-warning-500` |
| `nv-bg-danger` | `--nv-danger-500` |
| `nv-bg-info` | `--nv-info-500` |
| `nv-bg-white` | `#fff` |

---

### Transitions & Animations

**Transition classes:**

| Class | Description |
|---|---|
| `nv-transition` | All properties, normal duration |
| `nv-transition-fast` | All properties, fast (150ms) |
| `nv-transition-slow` | All properties, slow (400ms) |
| `nv-transition-colors` | Color, background-color, border-color |
| `nv-transition-transform` | Transform only |
| `nv-transition-opacity` | Opacity only |

**Transform classes:**

| Class | Description |
|---|---|
| `nv-scale-95` | `scale(0.95)` |
| `nv-scale-100` | `scale(1)` |
| `nv-scale-105` | `scale(1.05)` |
| `nv-translate-y-1` | `translateY(0.25rem)` |
| `nv-translate-y-0` | `translateY(0)` |
| `nv--translate-y-1` | `translateY(-0.25rem)` |

**Animation classes:**

| Class | Animation |
|---|---|
| `nv-animate-fade-in` | Fade in |
| `nv-animate-fade-up` | Fade in + slide up |
| `nv-animate-fade-down` | Fade in + slide down |
| `nv-animate-scale-in` | Fade in + scale from 0.95 |
| `nv-animate-slide-right` | Fade in + slide from right |
| `nv-animate-slide-left` | Fade in + slide from left |
| `nv-animate-bounce` | Continuous bounce |
| `nv-animate-pulse` | Continuous pulse (opacity) |

**Delay modifiers:** `nv-delay-100`, `nv-delay-200`, `nv-delay-300`, `nv-delay-400`, `nv-delay-500`

```html
<div class="nv-animate-fade-up nv-delay-200">Appears with staggered animation</div>
```

**Available keyframes (for custom use):** `nv-fade-in`, `nv-fade-up`, `nv-fade-down`, `nv-scale-in`, `nv-slide-in-right`, `nv-slide-in-left`, `nv-bounce`, `nv-pulse`, `nv-spin`, `nv-shimmer`, `nv-progress-stripe`, `nv-toast-in`, `nv-toast-out`

---

### Cursor & Interaction

| Class | Description |
|---|---|
| `nv-cursor-pointer` | `cursor: pointer` |
| `nv-cursor-default` | `cursor: default` |
| `nv-cursor-not-allowed` | `cursor: not-allowed` |
| `nv-select-none` | `user-select: none` |
| `nv-select-all` | `user-select: all` |
| `nv-pointer-events-none` | `pointer-events: none` |

### Accessibility

| Class | Description |
|---|---|
| `nv-sr-only` | Screen reader only (visually hidden, 1px clipped) |
| `nv-focus-ring` | Adds `outline: 2px solid var(--nv-ring)` + 2px offset on `:focus-visible` |

```html
<button class="nv-btn nv-focus-ring">Accessible Button</button>
<a href="#" class="nv-focus-ring">Focusable Link</a>
```

---

### Components

#### Button

Base class: `nv-btn`

**Variants:**

| Class | Description |
|---|---|
| `nv-btn-primary` | Solid primary (indigo bg, white text) |
| `nv-btn-secondary` | Muted bg with border |
| `nv-btn-success` | Green solid |
| `nv-btn-danger` | Red solid |
| `nv-btn-warning` | Yellow solid |
| `nv-btn-ghost` | Transparent, hover muted bg |
| `nv-btn-outline` | Transparent with primary border, fills on hover |
| `nv-btn-link` | Looks like a link (no padding, underline on hover) |

**Sizes:**

| Class | Description |
|---|---|
| `nv-btn-sm` | Small |
| `nv-btn-lg` | Large |
| `nv-btn-xl` | Extra-large |

**Modifiers:**

| Class | Description |
|---|---|
| `nv-btn-icon` | Square icon button |
| `nv-btn-block` | Full width |
| `nv-btn-pill` | Fully rounded |

**States:** `:focus-visible` shows ring. `:active` scales to 0.97. `:disabled` or `[disabled]` dims to 50% opacity and prevents interaction.

**Button Group:**

```html
<div class="nv-btn-group">
  <button class="nv-btn nv-btn-secondary">Left</button>
  <button class="nv-btn nv-btn-secondary">Center</button>
  <button class="nv-btn nv-btn-secondary">Right</button>
</div>
```

**Full example:**

```html
<button class="nv-btn nv-btn-primary nv-btn-lg nv-btn-pill">Get Started</button>
<button class="nv-btn nv-btn-ghost nv-btn-icon nv-btn-sm">✕</button>
<button class="nv-btn nv-btn-danger" disabled>Disabled</button>
```

---

#### Card

Base class: `nv-card`

| Class | Description |
|---|---|
| `nv-card` | Base card (border, rounded-lg, bg) |
| `nv-card-elevated` | Shadow instead of border (`nv-shadow-md`, no border) |
| `nv-card-hoverable` | Add to `nv-card` — lifts (`translateY(-2px)`) + shadow-lg on hover |
| `nv-card-header` | Header section with bottom border |
| `nv-card-body` | Body section with padding (`--nv-space-6`) |
| `nv-card-footer` | Footer section with top border |
| `nv-card-img` | Full-width image (100% width, auto height) |

```html
<div class="nv-card nv-card-hoverable">
  <img src="hero.jpg" class="nv-card-img" alt="">
  <div class="nv-card-header">
    <h3 class="nv-h5">Card Title</h3>
  </div>
  <div class="nv-card-body">
    <p class="nv-text-muted">Card content goes here.</p>
  </div>
  <div class="nv-card-footer nv-flex nv-justify-end nv-gap-2">
    <button class="nv-btn nv-btn-secondary nv-btn-sm">Cancel</button>
    <button class="nv-btn nv-btn-primary nv-btn-sm">Save</button>
  </div>
</div>
```

---

#### Forms

**Labels & Inputs:**

| Class | Description |
|---|---|
| `nv-label` | Block label with semibold text |
| `nv-input` | Text input (full width, border, focus ring) |
| `nv-textarea` | Textarea (resizable, min-height 5rem) |
| `nv-select` | Custom select with chevron |
| `nv-checkbox` | Styled checkbox |
| `nv-radio` | Styled radio |

**Input modifiers:**

| Class | Description |
|---|---|
| `nv-input-error` | Red border + red focus ring |
| `nv-input-success` | Green border |
| `nv-input-sm` | Small input |
| `nv-input-lg` | Large input |

**Layout helpers:**

| Class | Description |
|---|---|
| `nv-field` | Form field wrapper (margin-bottom) |
| `nv-field-inline` | Flex row with gap (for checkbox + label) |
| `nv-helper` | Small muted helper text |
| `nv-error-text` | Small red error text |

**Input Group:**

| Class | Description |
|---|---|
| `nv-input-group` | Flex container for input + addon combinations |
| `nv-input-addon` | Attached label/icon section (muted bg, border, small text) |

```html
<div class="nv-input-group">
  <span class="nv-input-addon">https://</span>
  <input class="nv-input" placeholder="example.com">
</div>
```

**Toggle Switch:**

| Class | Description |
|---|---|
| `nv-toggle` | Toggle wrapper (relative, inline-block, 2.75rem × 1.5rem) |
| `nv-toggle-slider` | Slider track (absolute, rounded-full, transitions on checked) |

The `<input type="checkbox">` inside is visually hidden (`opacity: 0`). When checked, the slider turns primary and the knob slides right.

```html
<label class="nv-toggle">
  <input type="checkbox">
  <span class="nv-toggle-slider"></span>
</label>
```

**Complete form example:**

```html
<form>
  <div class="nv-field">
    <label class="nv-label">Email</label>
    <input class="nv-input" type="email" placeholder="you@example.com">
    <p class="nv-helper">We'll never share your email.</p>
  </div>
  <div class="nv-field">
    <label class="nv-label">Password</label>
    <input class="nv-input nv-input-error" type="password">
    <p class="nv-error-text">Password must be at least 8 characters.</p>
  </div>
  <div class="nv-field-inline">
    <input type="checkbox" class="nv-checkbox" id="terms">
    <label for="terms" class="nv-text-sm">I agree to the terms</label>
  </div>
  <button class="nv-btn nv-btn-primary nv-btn-block">Submit</button>
</form>
```

---

#### Table

Base class: `nv-table`

| Class | Description |
|---|---|
| `nv-table` | Base table styling |
| `nv-table-striped` | Alternating row backgrounds |
| `nv-table-hover` | Row highlight on hover |
| `nv-table-compact` | Reduced padding |

```html
<table class="nv-table nv-table-striped nv-table-hover">
  <thead>
    <tr><th>Name</th><th>Role</th><th>Status</th></tr>
  </thead>
  <tbody>
    <tr><td>Alice</td><td>Admin</td><td><span class="nv-badge nv-badge-success">Active</span></td></tr>
    <tr><td>Bob</td><td>Editor</td><td><span class="nv-badge nv-badge-warning">Pending</span></td></tr>
  </tbody>
</table>
```

---

#### Badge

Base class: `nv-badge`

**Variants:**

| Class | Description |
|---|---|
| `nv-badge-primary` | Light primary bg, dark primary text |
| `nv-badge-success` | Light green bg |
| `nv-badge-warning` | Light yellow bg |
| `nv-badge-danger` | Light red bg |
| `nv-badge-info` | Light blue bg |
| `nv-badge-neutral` | Gray bg |
| `nv-badge-solid-primary` | Solid primary bg, white text |

**Modifiers:**

| Class | Description |
|---|---|
| `nv-badge-dot` | Prepends a small dot (uses `currentColor`) |
| `nv-badge-lg` | Larger badge |

```html
<span class="nv-badge nv-badge-success nv-badge-dot">Online</span>
<span class="nv-badge nv-badge-danger nv-badge-lg">Critical</span>
```

---

#### Alert

Base class: `nv-alert`

| Class | Description |
|---|---|
| `nv-alert-info` | Blue left border, blue tint |
| `nv-alert-success` | Green |
| `nv-alert-warning` | Yellow |
| `nv-alert-danger` | Red |

**Sub-element:** `nv-alert-title` — bold title inside the alert.

```html
<div class="nv-alert nv-alert-info">
  <div class="nv-alert-title">Heads up</div>
  This is an informational message.
</div>
```

---

#### Navbar

| Class | Description |
|---|---|
| `nv-navbar` | Flex container with padding and bottom border |
| `nv-navbar-brand` | Brand text (xl, bold, display font) |
| `nv-navbar-nav` | Flex row for nav links |
| `nv-navbar-link` | Nav link (muted, hover: text + bg) |
| `nv-navbar-link.active` | Active link (primary color + tint bg) |
| `nv-navbar-sticky` | Sticky with blur backdrop |

```html
<nav class="nv-navbar nv-navbar-sticky">
  <span class="nv-navbar-brand">MyApp</span>
  <div class="nv-navbar-nav">
    <a href="#" class="nv-navbar-link active">Home</a>
    <a href="#" class="nv-navbar-link">About</a>
    <a href="#" class="nv-navbar-link">Contact</a>
  </div>
  <button class="nv-btn nv-btn-primary nv-btn-sm">Sign In</button>
</nav>
```

---

#### Tabs

**Standard Tabs:**

| Class | Description |
|---|---|
| `nv-tabs` | Tab bar (flex, bottom border) |
| `nv-tab` | Individual tab |
| `nv-tab.active` | Active tab (primary underline) |
| `nv-tab-panel` | Tab content area |
| `nv-tab-panel[hidden]` | Hidden panel |

**Pill Tabs:**

| Class | Description |
|---|---|
| `nv-tabs-pill` | Pill-style tab bar (muted bg, rounded) |

```html
<!-- Standard -->
<div class="nv-tabs">
  <button class="nv-tab active" data-tab="tab-1">Tab 1</button>
  <button class="nv-tab" data-tab="tab-2">Tab 2</button>
</div>
<div class="nv-tab-panel" id="tab-1">Content 1</div>
<div class="nv-tab-panel" id="tab-2" hidden>Content 2</div>

<!-- Pill -->
<div class="nv-tabs nv-tabs-pill">
  <button class="nv-tab active">Option A</button>
  <button class="nv-tab">Option B</button>
</div>
```

---

#### Modal

| Class | Description |
|---|---|
| `nv-modal-overlay` | Fixed full-screen overlay (blur backdrop) |
| `nv-modal-overlay.active` | Visible state |
| `nv-modal` | Modal dialog box |
| `nv-modal-header` | Header area |
| `nv-modal-title` | Title text |
| `nv-modal-body` | Body content |
| `nv-modal-footer` | Footer with action buttons |
| `nv-modal-close` | Close button (absolute positioned) |
| `nv-modal-sm` | Small modal (24rem) |
| `nv-modal-lg` | Large modal (42rem) |
| `nv-modal-xl` | Extra-large modal (56rem) |

```html
<div class="nv-modal-overlay" id="my-modal">
  <div class="nv-modal">
    <div class="nv-modal-header nv-relative">
      <h3 class="nv-modal-title">Confirm Action</h3>
      <button class="nv-modal-close" onclick="document.getElementById('my-modal').classList.remove('active')">✕</button>
    </div>
    <div class="nv-modal-body">
      <p class="nv-text-muted">Are you sure you want to proceed?</p>
    </div>
    <div class="nv-modal-footer">
      <button class="nv-btn nv-btn-secondary">Cancel</button>
      <button class="nv-btn nv-btn-primary">Confirm</button>
    </div>
  </div>
</div>
```

Open/close: toggle `active` class on `nv-modal-overlay`.

---

#### Dropdown

| Class | Description |
|---|---|
| `nv-dropdown` | Wrapper (relative, inline-block) |
| `nv-dropdown-menu` | Dropdown panel (absolute, hidden) |
| `nv-dropdown.active .nv-dropdown-menu` | Visible state |
| `nv-dropdown-item` | Menu item |
| `nv-dropdown-divider` | Separator line |
| `nv-dropdown-right` | Align menu to right edge |

```html
<div class="nv-dropdown" id="dd">
  <button class="nv-btn nv-btn-secondary" onclick="this.parentElement.classList.toggle('active')">
    Options ▾
  </button>
  <div class="nv-dropdown-menu">
    <a class="nv-dropdown-item">Edit</a>
    <a class="nv-dropdown-item">Duplicate</a>
    <div class="nv-dropdown-divider"></div>
    <a class="nv-dropdown-item nv-text-danger">Delete</a>
  </div>
</div>
```

---

#### Tooltip

| Class | Description |
|---|---|
| `nv-tooltip` | Wrapper element |
| `data-tooltip="..."` | Tooltip text content |

Tooltip appears above element on hover via `::after` pseudo-element.

```html
<span class="nv-tooltip" data-tooltip="This is a tooltip">Hover me</span>
```

---

#### Avatar

Base class: `nv-avatar`

| Class | Description |
|---|---|
| `nv-avatar` | Default size (2.5rem) |
| `nv-avatar-sm` | Small (2rem) |
| `nv-avatar-lg` | Large (3.5rem) |
| `nv-avatar-xl` | Extra-large (5rem) |
| `nv-avatar-group` | Overlapping avatar row |

```html
<!-- Text avatar -->
<div class="nv-avatar">AB</div>

<!-- Image avatar -->
<div class="nv-avatar nv-avatar-lg">
  <img src="photo.jpg" alt="User">
</div>

<!-- Avatar group -->
<div class="nv-avatar-group">
  <div class="nv-avatar">A</div>
  <div class="nv-avatar">B</div>
  <div class="nv-avatar">C</div>
  <div class="nv-avatar">+3</div>
</div>
```

---

#### Progress

| Class | Description |
|---|---|
| `nv-progress` | Track (outer container) |
| `nv-progress-bar` | Fill bar (set `width` via style) |
| `nv-progress-success` | Green bar |
| `nv-progress-danger` | Red bar |
| `nv-progress-striped` | Striped pattern |
| `nv-progress-animated` | Animated stripes |
| `nv-progress-lg` | Taller track (0.75rem) |

```html
<div class="nv-progress">
  <div class="nv-progress-bar" style="width: 65%"></div>
</div>

<div class="nv-progress nv-progress-striped nv-progress-animated">
  <div class="nv-progress-bar" style="width: 40%"></div>
</div>
```

---

#### Spinner

| Class | Description |
|---|---|
| `nv-spinner` | Default spinner (1.5rem) |
| `nv-spinner-sm` | Small (1rem) |
| `nv-spinner-lg` | Large (2.5rem) |

```html
<div class="nv-spinner"></div>
<div class="nv-spinner nv-spinner-lg"></div>
```

---

#### Skeleton

| Class | Description |
|---|---|
| `nv-skeleton` | Base shimmer animation |
| `nv-skeleton-text` | Text placeholder (1rem height) — last child auto-narrows to 60% |
| `nv-skeleton-circle` | Circular skeleton |

```html
<div class="nv-flex nv-gap-4 nv-items-center">
  <div class="nv-skeleton nv-skeleton-circle" style="width:3rem;height:3rem"></div>
  <div class="nv-flex-1">
    <div class="nv-skeleton nv-skeleton-text"></div>
    <div class="nv-skeleton nv-skeleton-text"></div>
    <div class="nv-skeleton nv-skeleton-text"></div>
  </div>
</div>
```

---

#### Breadcrumb

| Class | Description |
|---|---|
| `nv-breadcrumb` | Flex container |
| `nv-breadcrumb-item` | Breadcrumb link (muted) |
| `nv-breadcrumb-item.active` | Current page (bold, default color) |
| `nv-breadcrumb-sep` | Separator (subtle color) |

```html
<nav class="nv-breadcrumb">
  <a class="nv-breadcrumb-item">Home</a>
  <span class="nv-breadcrumb-sep">/</span>
  <a class="nv-breadcrumb-item">Products</a>
  <span class="nv-breadcrumb-sep">/</span>
  <span class="nv-breadcrumb-item active">Widget</span>
</nav>
```

---

#### Pagination

| Class | Description |
|---|---|
| `nv-pagination` | Flex container |
| `nv-page-item` | Page button |
| `nv-page-item.active` | Active page (primary bg) |
| `nv-page-item.disabled` | Disabled (dimmed, no interaction) |

```html
<nav class="nv-pagination">
  <span class="nv-page-item disabled">‹</span>
  <span class="nv-page-item active">1</span>
  <span class="nv-page-item">2</span>
  <span class="nv-page-item">3</span>
  <span class="nv-page-item">›</span>
</nav>
```

---

#### Divider

| Class | Description |
|---|---|
| `nv-divider` | Horizontal rule |
| `nv-divider-text` | Divider with centered text |

```html
<hr class="nv-divider">

<div class="nv-divider-text">or continue with</div>
```

---

#### Tag/Chip

| Class | Description |
|---|---|
| `nv-tag` | Tag with muted bg, border, small text |
| `nv-tag-remove` | Removable close button inside tag |

```html
<span class="nv-tag">
  JavaScript
  <span class="nv-tag-remove">✕</span>
</span>
```

---

#### Toast (CSS)

CSS classes for toast notifications. Usually driven by the JS `Novoid.toast` API, but the CSS classes are:

| Class | Description |
|---|---|
| `nv-toast-container` | Fixed bottom-right container |
| `nv-toast` | Individual toast (dark bg, white text) |
| `nv-toast-success` | Green toast |
| `nv-toast-danger` | Red toast |
| `nv-toast-warning` | Yellow toast |
| `nv-toast-exit` | Exit animation class |

---

#### Accordion

| Class | Description |
|---|---|
| `nv-accordion` | Outer container (border, rounded) |
| `nv-accordion-item` | Individual item (border-bottom) |
| `nv-accordion-item.active` | Open state |
| `nv-accordion-trigger` | Clickable header (flex, between) |
| `nv-accordion-icon` | Arrow icon (rotates when active) |
| `nv-accordion-content` | Collapsible wrapper (max-height transition) |
| `nv-accordion-body` | Inner content padding |

```html
<div class="nv-accordion">
  <div class="nv-accordion-item active">
    <button class="nv-accordion-trigger">
      <span>What is no∅?</span>
      <span class="nv-accordion-icon">▾</span>
    </button>
    <div class="nv-accordion-content">
      <div class="nv-accordion-body">
        A zero-build-tool frontend platform.
      </div>
    </div>
  </div>
  <div class="nv-accordion-item">
    <button class="nv-accordion-trigger">
      <span>Do I need Node.js?</span>
      <span class="nv-accordion-icon">▾</span>
    </button>
    <div class="nv-accordion-content">
      <div class="nv-accordion-body">No.</div>
    </div>
  </div>
</div>
```

Toggle: add/remove `active` class on `nv-accordion-item`.

---

#### Code/Pre

| Class | Description |
|---|---|
| `nv-code` | Inline code (muted bg, mono font, danger-colored text) |
| `nv-pre` | Code block (dark bg, light text, scrollable) |

```html
<p>Use <code class="nv-code">Novoid.signal()</code> for reactive state.</p>

<pre class="nv-pre"><code>const [count, setCount] = Novoid.signal(0);
Novoid.effect(() => console.log(count()));</code></pre>
```

---

#### Prose

Class: `nv-prose` — rich-text container that auto-styles child elements.

Styled children: `h1`–`h4`, `p`, `a`, `strong`, `ul`, `ol`, `li`, `blockquote`, `code`, `pre`, `hr`, `img`.

```html
<div class="nv-prose">
  <h2>Getting Started</h2>
  <p>no∅ is a zero-build framework. Just include the CSS and JS files.</p>
  <ul>
    <li>No Node.js required</li>
    <li>No build step</li>
  </ul>
  <blockquote>Ship code, not configuration.</blockquote>
</div>
```

---

### Responsive Helpers

| Class | Description |
|---|---|
| `nv-hide-sm` | Hidden below 640px |
| `nv-hide-md` | Hidden between 640px–767px |
| `nv-show-sm-only` | Visible only below 768px |
| `nv-hide-below-lg` | Hidden below 1024px |
| `nv-show-below-lg-only` | Visible only below 1024px |

---

### Print

| Class | Description |
|---|---|
| `nv-no-print` | Hidden when printing |

Print stylesheet also resets body colors and card shadows.

---

## JavaScript Framework

All APIs are on the `Novoid` global. Destructure for convenience:

```js
const { signal, computed, effect, batch, h, mount } = Novoid;
```

---

### Reactivity

#### signal()

Creates reactive state. Returns `[getter, setter]`. Getter is called as a function.

```js
const [count, setCount] = Novoid.signal(0);

// Read
count();       // 0

// Write (direct value)
setCount(5);

// Write (updater function)
setCount(n => n + 1);

// Peek without subscribing
count.peek();  // 6

// Manual subscribe
const unsub = count.subscribe(fn);
unsub(); // unsubscribe
```

---

#### computed()

Derived reactive value. Auto-tracks signal dependencies. Returns a getter function.

```js
const [first, setFirst] = Novoid.signal('Jane');
const [last, setLast] = Novoid.signal('Doe');

const fullName = Novoid.computed(() => `${first()} ${last()}`);

fullName(); // "Jane Doe"
setFirst('John');
fullName(); // "John Doe"
```

---

#### effect()

Runs a side-effect whenever tracked signals change. Auto-tracks dependencies. Returns a dispose function.

```js
const [count, setCount] = Novoid.signal(0);

// Auto-tracking
const dispose = Novoid.effect(() => {
  console.log('Count is', count());
});

// With explicit deps
Novoid.effect(() => {
  document.title = `Count: ${count()}`;
}, () => [count()]);

// Cleanup function (returned from effect body)
Novoid.effect(() => {
  const id = setInterval(() => setCount(n => n + 1), 1000);
  return () => clearInterval(id); // cleanup
});

// Dispose the effect manually
dispose();
```

---

#### batch()

Groups multiple signal updates into a single flush. Prevents intermediate re-renders.

```js
const [a, setA] = Novoid.signal(1);
const [b, setB] = Novoid.signal(2);

Novoid.batch(() => {
  setA(10);
  setB(20);
  // effects run once after batch, not twice
});
```

---

#### memo()

Prevents unnecessary recalculation with explicit dependency tracking.

```js
const [count, setCount] = Novoid.signal(0);

const expensive = Novoid.memo(
  () => heavyComputation(count()),
  () => [count()]
);

expensive(); // recalculates only when count changes
```

---

#### ref()

Creates a mutable reference object (like `useRef`). Not reactive.

```js
const myRef = Novoid.ref(null);
myRef.current; // null

// Commonly used with h() to get a DOM reference
const inputRef = Novoid.ref();
h('input', { ref: inputRef, class: 'nv-input' });
// After mount: inputRef.current is the <input> element
inputRef.current.focus();
```

---

### State Management

#### createContext()

Shared state through Provider/use pattern.

```js
const ThemeCtx = Novoid.createContext('light');

// Provide a value
ThemeCtx.Provider('dark', () => {
  const theme = ThemeCtx.use(); // "dark"
  return h('div', { class: `nv-p-4 ${theme === 'dark' ? 'nv-dark' : ''}` },
    h('p', {}, `Theme: ${theme}`)
  );
});

// Use outside provider returns default
ThemeCtx.use(); // "light"
```

**API:**

| Method | Description |
|---|---|
| `ctx.Provider(value, children)` | Set context value for children |
| `ctx.use()` | Read current context value |

---

#### createStore()

Global state with named action reducers. Built on `signal()`.

```js
const store = Novoid.createStore(
  // Initial state
  { todos: [], filter: 'all' },
  // Actions — each receives (currentState, ...args) → newState
  {
    addTodo: (state, text) => ({
      ...state,
      todos: [...state.todos, { id: Date.now(), text, done: false }]
    }),
    toggleTodo: (state, id) => ({
      ...state,
      todos: state.todos.map(t => t.id === id ? { ...t, done: !t.done } : t)
    }),
    setFilter: (state, filter) => ({ ...state, filter }),
  }
);

// Read state (reactive getter)
store.get(); // { todos: [], filter: 'all' }

// Dispatch actions
store.actions.addTodo('Buy milk');
store.actions.toggleTodo(123);

// Direct set
store.set(prev => ({ ...prev, filter: 'done' }));

// Subscribe to changes
const unsub = store.subscribe(newState => console.log(newState));
unsub();
```

---

### Components & DOM

#### component()

Named reusable component. Registers in the component registry. Returns a factory function.

```js
const Card = Novoid.component('Card', (props) => {
  return h('div', { class: 'nv-card' },
    h('div', { class: 'nv-card-body' },
      h('h3', { class: 'nv-h5' }, props.title),
      h('p', { class: 'nv-text-muted' }, props.description)
    )
  );
});

// Usage — call the returned factory
const el = Card({ title: 'Hello', description: 'World' });
```

Components auto-receive `_id` in props. The rendered element gets `data-nv-component` and `data-nv-id` attributes.

---

#### h() — Element Creation

Creates DOM elements with reactive bindings. Core function — equivalent to JSX.

```js
Novoid.h(tag, attrs?, ...children)
```

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `tag` | `string` | HTML tag name |
| `attrs` | `object \| null` | Attributes and special bindings |
| `children` | `...any` | Child nodes, strings, functions (reactive), arrays |

**Basic usage:**

```js
const { h } = Novoid;

// Simple element
h('div', { class: 'nv-p-4' }, 'Hello');

// Nested
h('div', { class: 'nv-card' },
  h('div', { class: 'nv-card-body' },
    h('h2', { class: 'nv-h4' }, 'Title'),
    h('p', {}, 'Content')
  )
);

// Reactive text child
const [name, setName] = Novoid.signal('World');
h('p', {}, () => `Hello, ${name()}!`);
```

##### Special Attributes

**`ref`** — Assign a ref to capture the DOM element:

```js
const myRef = Novoid.ref();
h('input', { ref: myRef, class: 'nv-input' });
// myRef.current → the <input> element
```

**`class`** — Static string or reactive function:

```js
// Static
h('div', { class: 'nv-btn nv-btn-primary' });

// Reactive
const [active, setActive] = Novoid.signal(false);
h('div', { class: () => `nv-tab ${active() ? 'active' : ''}` });
```

**`style`** — Object (static or reactive):

```js
// Static object
h('div', { style: { color: 'red', fontSize: '1.5rem' } });

// Reactive (function returning object)
const [size, setSize] = Novoid.signal(16);
h('div', { style: () => ({ fontSize: `${size()}px` }) });
```

**`on*`** — Event listeners (prefix with `on`, camelCase):

```js
h('button', { onClick: () => alert('clicked') }, 'Click');
h('input', { onInput: (e) => setValue(e.target.value) });
h('form', { onSubmit: (e) => { e.preventDefault(); handleSubmit(); } });
```

**`html`** — Set innerHTML (static or reactive):

```js
h('div', { html: '<strong>Bold</strong>' });
h('div', { html: () => renderMarkdown(content()) });
```

**`show`** — Toggle `display: none` (reactive):

```js
const [visible, setVisible] = Novoid.signal(true);
h('div', { show: visible }, 'I can be hidden');
h('div', { show: () => count() > 0 }, 'Count is positive');
```

**`bind`** — Two-way binding with `[getter, setter]`:

```js
const [text, setText] = Novoid.signal('');
h('input', { class: 'nv-input', bind: [text, setText], placeholder: 'Type here...' });
// Input value syncs with signal automatically
```

**Any other attribute** — Set as HTML attribute (reactive if function):

```js
h('a', { href: 'https://example.com', target: '_blank' }, 'Link');
h('input', { disabled: () => isSubmitting(), class: 'nv-input' });
```

---

#### list()

Keyed list rendering with efficient DOM reconciliation.

```js
Novoid.list(container, items, keyFn, renderFn)
```

| Param | Type | Description |
|---|---|---|
| `container` | `HTMLElement` | Parent DOM node |
| `items` | `function \| array` | Signal getter or static array |
| `keyFn` | `(item) => string` | Unique key extractor |
| `renderFn` | `(item, index) => HTMLElement` | Render each item |

```js
const { signal, h, list } = Novoid;
const [todos, setTodos] = signal([
  { id: 1, text: 'Buy milk' },
  { id: 2, text: 'Walk dog' },
]);

const ul = h('ul', { class: 'nv-flex nv-flex-col nv-gap-2' });

list(ul, todos, t => t.id, (todo) =>
  h('li', { class: 'nv-flex nv-items-center nv-gap-2' },
    h('span', {}, todo.text),
    h('button', {
      class: 'nv-btn nv-btn-danger nv-btn-sm',
      onClick: () => setTodos(prev => prev.filter(t => t.id !== todo.id))
    }, '✕')
  )
);
```

---

#### Conditional Rendering (when, show, match)

**`when(condition, thenFn, elseFn?)`** — Returns a reactive function that renders one branch or the other.

```js
const [loggedIn, setLoggedIn] = Novoid.signal(false);

h('div', {},
  Novoid.when(loggedIn,
    () => h('p', {}, 'Welcome back!'),
    () => h('button', { class: 'nv-btn nv-btn-primary', onClick: () => setLoggedIn(true) }, 'Log In')
  )
);
```

**`show(condition, content)`** — Like `when` but no else branch. Returns null when falsy.

```js
h('div', {},
  Novoid.show(() => errors().length > 0,
    () => h('div', { class: 'nv-alert nv-alert-danger' }, 'There are errors')
  )
);
```

**`match(value, cases)`** — Switch-like conditional rendering.

```js
const [tab, setTab] = Novoid.signal('home');

h('div', {},
  Novoid.match(tab, {
    home:    () => h('div', {}, 'Home content'),
    about:   () => h('div', {}, 'About content'),
    contact: () => h('div', {}, 'Contact content'),
    default: () => h('div', {}, '404'),
  })
);
```

---

#### template()

Simple string template rendering with `{{key}}` interpolation.

```js
Novoid.template(htmlString, data)
```

```js
const card = Novoid.template(
  '<div class="nv-card"><div class="nv-card-body"><h3 class="nv-h5">{{title}}</h3><p>{{body}}</p></div></div>',
  { title: 'Hello', body: 'World' }
);
// Returns a DOM element
```

Values in `data` can be static or functions (getters — resolved on call).

---

### Advanced

#### portal()

Render content into a different DOM node (like React `createPortal`).

```js
Novoid.portal(target, content)
```

| Param | Type | Description |
|---|---|---|
| `target` | `string \| HTMLElement` | CSS selector or DOM element |
| `content` | `Node \| function` | Static node or reactive function |

Returns a cleanup function.

```js
const cleanup = Novoid.portal('#modal-root', () =>
  h('div', { class: 'nv-modal-overlay active' },
    h('div', { class: 'nv-modal' },
      h('div', { class: 'nv-modal-body' }, 'Portal content!')
    )
  )
);

// Remove portal
cleanup();
```

---

#### errorBoundary()

Catch and display render errors gracefully.

```js
Novoid.errorBoundary(renderFn, fallbackFn)
```

```js
const safe = Novoid.errorBoundary(
  () => RiskyComponent({ data }),
  (error) => h('div', { class: 'nv-alert nv-alert-danger' },
    h('div', { class: 'nv-alert-title' }, 'Something went wrong'),
    h('p', {}, error.message)
  )
);
```

---

#### suspense()

Show fallback UI while async content loads.

```js
Novoid.suspense(asyncFn, fallback?)
```

```js
const content = Novoid.suspense(
  async () => {
    const res = await fetch('/api/data');
    const data = await res.json();
    return h('div', {}, JSON.stringify(data));
  },
  () => h('div', { class: 'nv-flex nv-justify-center nv-p-8' },
    h('div', { class: 'nv-spinner nv-spinner-lg' })
  )
);
```

---

#### lazy()

Lazy-load a component. Shows a spinner fallback automatically.

```js
const HeavyChart = Novoid.lazy(() => import('./chart.js'));

// Usage — call like a component
const el = HeavyChart({ data: myData });
```

---

#### createRouter()

Hash-based client-side router.

```js
Novoid.createRouter(routes, container)
```

**Route definition:**

```js
const routes = [
  { path: '/', component: HomePage },
  { path: '/about', component: AboutPage },
  { path: '/users/:id', component: UserPage },
  { path: '/admin', component: AdminPage, guard: () => isLoggedIn(), redirect: '/login' },
  { path: '*', component: NotFoundPage },
];
```

| Route field | Description |
|---|---|
| `path` | URL pattern. `:param` for dynamic segments. `*` for catch-all. |
| `component` | `({ params, navigate }) => HTMLElement` |
| `guard` | Optional `() => boolean`. If false, prevents rendering. |
| `redirect` | Path to redirect to if guard fails. |

**Usage:**

```js
const appContainer = document.getElementById('app');
const { navigate, currentRoute } = Novoid.createRouter(routes, appContainer);

// Programmatic navigation
navigate('/users/42');

// Read current route (reactive signal)
currentRoute(); // "/users/42"
```

**Component receives:**

```js
function UserPage({ params, navigate }) {
  return h('div', { class: 'nv-container nv-py-8' },
    h('h1', { class: 'nv-h2' }, `User ${params.id}`),
    h('button', { class: 'nv-btn nv-btn-secondary', onClick: () => navigate('/') }, 'Back')
  );
}
```

---

#### link()

Create a navigation link element.

```js
Novoid.link(text, path, className?)
```

```js
Novoid.link('Home', '/', 'nv-navbar-link');
// → <a href="#/" class="nv-navbar-link">Home</a>
```

---

#### transition()

Programmatic enter/leave animations on an element.

```js
Novoid.transition(element, { enter, leave, duration? })
```

Returns `{ in(), out() }`. `out()` returns a Promise.

```js
const el = h('div', { class: 'nv-card nv-card-body' }, 'Animated');

const anim = Novoid.transition(el, {
  enter: { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
  leave: { to: { opacity: '0', transform: 'translateY(10px)' } },
  duration: 300,
});

anim.in();                    // animate in
await anim.out();             // animate out (returns promise)
el.remove();
```

---

### Utilities

#### bus (Event Bus)

Global publish/subscribe event bus.

```js
// Subscribe
const unsub = Novoid.bus.on('user:login', (user) => {
  console.log('Logged in:', user.name);
});

// Emit
Novoid.bus.emit('user:login', { name: 'Alice' });

// Unsubscribe (specific handler)
Novoid.bus.off('user:login', myHandler);

// Unsubscribe (all handlers for event)
Novoid.bus.off('user:login');

// Unsubscribe (via return value)
unsub();
```

| Method | Description |
|---|---|
| `bus.on(event, fn)` | Subscribe. Returns unsubscribe function. |
| `bus.emit(event, data)` | Emit event with data. |
| `bus.off(event, fn?)` | Remove specific handler, or all handlers if fn omitted. |

---

#### createForm()

Form state management with validation.

```js
Novoid.createForm(schema)
```

**Schema per field:**

| Key | Type | Description |
|---|---|---|
| `initial` | `string` | Initial value (default `''`) |
| `required` | `boolean` | Required validation |
| `minLength` | `number` | Minimum character length |
| `maxLength` | `number` | Maximum character length |
| `pattern` | `RegExp` | Regex pattern validation |
| `message` | `string` | Custom error message for pattern |
| `validate` | `(value) => string` | Custom validator — return error string or `''` |

**Returns:**

| Key | Type | Description |
|---|---|---|
| `fields` | `{ [name]: { get, set } }` | Signal pairs for each field |
| `errors` | `{ [name]: { get, set } }` | Error signal pairs |
| `isValid` | `getter` | Reactive validity flag |
| `isSubmitting` | `getter` | Reactive submitting flag |
| `validate()` | `function` | Run all validators, return boolean |
| `handleSubmit(onSubmit)` | `async function` | Validate then call `onSubmit(data)` |
| `reset()` | `function` | Reset all fields and errors |

```js
const form = Novoid.createForm({
  email: {
    initial: '',
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: 'Invalid email format',
  },
  password: {
    initial: '',
    required: true,
    minLength: 8,
  },
});

// Build form UI
h('form', { onSubmit: (e) => { e.preventDefault(); form.handleSubmit(submitToAPI); } },
  h('div', { class: 'nv-field' },
    h('label', { class: 'nv-label' }, 'Email'),
    h('input', {
      class: () => `nv-input ${form.errors.email.get() ? 'nv-input-error' : ''}`,
      bind: [form.fields.email.get, form.fields.email.set],
    }),
    h('p', { class: 'nv-error-text', show: () => form.errors.email.get() },
      () => form.errors.email.get()
    ),
  ),
  h('div', { class: 'nv-field' },
    h('label', { class: 'nv-label' }, 'Password'),
    h('input', {
      class: () => `nv-input ${form.errors.password.get() ? 'nv-input-error' : ''}`,
      type: 'password',
      bind: [form.fields.password.get, form.fields.password.set],
    }),
    h('p', { class: 'nv-error-text', show: () => form.errors.password.get() },
      () => form.errors.password.get()
    ),
  ),
  h('button', {
    class: 'nv-btn nv-btn-primary nv-btn-block',
    disabled: () => form.isSubmitting(),
  }, () => form.isSubmitting() ? 'Submitting...' : 'Sign In')
);
```

---

#### useAsync()

Async data fetching with loading/error states.

```js
Novoid.useAsync(asyncFn, deps?)
```

Returns `{ data, loading, error, refetch }` — all are signal getters.

```js
const { data, loading, error, refetch } = Novoid.useAsync(async () => {
  const res = await fetch('https://api.example.com/users');
  return res.json();
});

h('div', {},
  Novoid.when(loading,
    () => h('div', { class: 'nv-spinner' }),
    () => Novoid.when(error,
      () => h('div', { class: 'nv-alert nv-alert-danger' }, () => error().message),
      () => h('div', {},
        () => JSON.stringify(data())
      )
    )
  ),
  h('button', { class: 'nv-btn nv-btn-secondary nv-mt-4', onClick: refetch }, 'Refresh')
);
```

---

#### toast

Global toast notification system. Creates a `nv-toast-container` automatically.

```js
Novoid.toast.info('This is an info message');
Novoid.toast.success('Saved successfully!');
Novoid.toast.danger('Something went wrong');
Novoid.toast.warning('Please check your input');

// Custom duration (ms) — default is 3000
Novoid.toast.success('Done!', 5000);
```

| Method | Description |
|---|---|
| `toast.info(msg, duration?)` | Default dark toast |
| `toast.success(msg, duration?)` | Green toast |
| `toast.danger(msg, duration?)` | Red toast |
| `toast.warning(msg, duration?)` | Yellow toast |

---

#### onMount / onUnmount

Lifecycle hooks.

```js
// Run after mount() completes
Novoid.onMount(() => {
  console.log('App mounted');
});

// Register cleanup for a component ID
Novoid.onUnmount('my-component-id', () => {
  console.log('Component unmounted');
});
```

---

#### onError

Global error handler.

```js
Novoid.onError((error, componentName) => {
  console.error(`Error in ${componentName}:`, error);
  trackError(error);
});
```

---

#### mount()

Mount an application to a DOM node. Clears the container, calls the app function, and fires onMount callbacks.

```js
Novoid.mount(selector, appFn)
```

| Param | Type | Description |
|---|---|---|
| `selector` | `string \| HTMLElement` | CSS selector or DOM element |
| `appFn` | `() => HTMLElement` | Function that returns the root element |

```js
Novoid.mount('#app', () => {
  return h('div', { class: 'nv-container nv-py-8' },
    h('h1', { class: 'nv-h1' }, 'My App')
  );
});
```

---

### Convex Integration

Optional real-time backend integration. Convex pushes updates via WebSocket subscriptions; no∅ consumes them via signals. The bridge is automatic: Convex `onUpdate` → no∅ signal setter → UI updates.

**Dependency:** Load Convex's CDN bundle before your app script. All Convex functions throw a clear error if `window.convex` is missing.

```html
<script src="https://unpkg.com/convex@latest/dist/browser.bundle.js"></script>
```

---

#### createClient()

Initialize a Convex client connection.

```js
Novoid.createClient(url)
```

| Param | Type | Description |
|---|---|---|
| `url` | `string` | Convex deployment URL (e.g. `'https://your-deployment.convex.cloud'`) |

**Returns:** A `ConvexClient` instance.

```js
const db = Novoid.createClient('https://happy-animal-123.convex.cloud');
```

---

#### useQuery()

Subscribe to a Convex query with reactive signals. Automatically re-subscribes when reactive args change.

```js
Novoid.useQuery(client, queryRef, args?)
```

| Param | Type | Description |
|---|---|---|
| `client` | `ConvexClient` | Client from `createClient()` |
| `queryRef` | `FunctionReference` | Convex query reference (e.g. `api.messages.list`) |
| `args` | `object \| () => object \| 'skip'` | Static args, reactive args function, or `'skip'` sentinel |

**Returns:** `{ data, loading, error }` — all signal getters.

```js
// Static args
const { data, loading, error } = Novoid.useQuery(db, api.messages.list, { limit: 10 });

// Reactive args (re-subscribes when userId signal changes)
const { data } = Novoid.useQuery(db, api.users.get, () => ({ id: userId() }));

// Skip query conditionally
const { data } = Novoid.useQuery(db, api.users.get, () => userId() ? { id: userId() } : 'skip');
```

**Usage in UI:**

```js
const { data: messages, loading } = Novoid.useQuery(db, api.messages.list);

h('div', {},
  Novoid.when(loading,
    () => h('div', { class: 'nv-skeleton nv-h-8 nv-w-full' }),
    () => Novoid.list(
      h('ul', { class: 'nv-flex nv-flex-col nv-gap-2' }),
      messages,
      (msg) => msg._id,
      (msg) => h('li', { class: 'nv-card nv-card-body' }, msg.body)
    )
  )
);
```

---

#### useMutation()

Create a callable mutation with loading/error state.

```js
Novoid.useMutation(client, mutationRef)
```

| Param | Type | Description |
|---|---|---|
| `client` | `ConvexClient` | Client from `createClient()` |
| `mutationRef` | `FunctionReference` | Convex mutation reference (e.g. `api.messages.send`) |

**Returns:** Async callable function with `.isLoading` and `.error` signal getters.

```js
const sendMessage = Novoid.useMutation(db, api.messages.send);

// Call it
await sendMessage({ body: 'Hello!' });

// Check state
sendMessage.isLoading(); // boolean signal getter
sendMessage.error();     // error or undefined signal getter
```

**Usage in UI:**

```js
const sendMessage = Novoid.useMutation(db, api.messages.send);
const [body, setBody] = Novoid.signal('');

h('form', {
  onSubmit: async (e) => {
    e.preventDefault();
    await sendMessage({ body: body() });
    setBody('');
  },
},
  h('input', { class: 'nv-input', bind: [body, setBody], placeholder: 'Type a message...' }),
  h('button', {
    class: 'nv-btn nv-btn-primary',
    disabled: () => sendMessage.isLoading(),
  }, () => sendMessage.isLoading() ? 'Sending...' : 'Send')
);
```

---

#### useAction()

Create a callable action with loading/error state. Same shape as `useMutation` but wraps `client.action()`.

```js
Novoid.useAction(client, actionRef)
```

| Param | Type | Description |
|---|---|---|
| `client` | `ConvexClient` | Client from `createClient()` |
| `actionRef` | `FunctionReference` | Convex action reference (e.g. `api.ai.generate`) |

**Returns:** Async callable function with `.isLoading` and `.error` signal getters.

```js
const generateText = Novoid.useAction(db, api.ai.generate);
const result = await generateText({ prompt: 'Hello' });

generateText.isLoading(); // boolean
generateText.error();     // error or undefined
```

---

#### useAuth()

Manage Convex authentication state with reactive signals.

```js
Novoid.useAuth(client, fetchToken)
```

| Param | Type | Description |
|---|---|---|
| `client` | `ConvexClient` | Client from `createClient()` |
| `fetchToken` | `async ({ forceRefreshToken }) => string \| null` | Token fetcher — return JWT string or `null` |

**Returns:** `{ isAuthenticated, isLoading, logout }`

| Key | Type | Description |
|---|---|---|
| `isAuthenticated` | `getter` | Signal — `true` when token was returned |
| `isLoading` | `getter` | Signal — `true` while token is being fetched |
| `logout` | `function` | Clears auth state and disconnects auth from client |

```js
const { isAuthenticated, isLoading, logout } = Novoid.useAuth(db, async ({ forceRefreshToken }) => {
  const res = await fetch('/api/auth/token');
  return res.ok ? (await res.json()).token : null;
});

// Conditional UI
Novoid.when(isAuthenticated,
  () => h('button', { class: 'nv-btn nv-btn-danger', onClick: logout }, 'Log Out'),
  () => h('a', { class: 'nv-btn nv-btn-primary', href: '/login' }, 'Sign In')
);
```

---

#### useConnectionState()

Monitor the Convex WebSocket connection state.

```js
Novoid.useConnectionState(client)
```

| Param | Type | Description |
|---|---|---|
| `client` | `ConvexClient` | Client from `createClient()` |

**Returns:** Signal getter — `'connecting'` | `'connected'` | `'disconnected'`.

```js
const connState = Novoid.useConnectionState(db);

h('span', {
  class: () => `nv-badge ${connState() === 'connected' ? 'nv-badge-success' : 'nv-badge-warning'}`,
}, () => connState());
```

---

#### useAI()

AI-oriented action caller with response persistence and conversation history. Wraps the OpenRouter-via-Convex pattern where API keys live in the Convex DB and actions call OpenRouter server-side.

```js
Novoid.useAI(client, actionRef)
```

| Param | Type | Description |
|---|---|---|
| `client` | `ConvexClient` | Client from `createClient()` |
| `actionRef` | `FunctionReference` | Convex action that calls OpenRouter (e.g. `api.ai.chat`) |

**Returns:** Async `send(args)` function with attached signal getters:

| Key | Type | Description |
|---|---|---|
| `send.response` | `getter` | Signal — last successful result (persists across calls) |
| `send.isLoading` | `getter` | Signal — `true` while action is in flight |
| `send.error` | `getter` | Signal — last error or `undefined` |
| `send.history` | `getter` | Signal — array of `{ args, result, ts }` for all past calls |
| `send.clear()` | `function` | Reset response, history, and error |

**How it differs from `useAction`:**
- **`response`** persists the last successful result — show AI output while making a new request
- **`history`** accumulates all interactions — forward conversation context to your Convex action
- **`clear()`** resets conversation state for a new thread

```js
const chat = Novoid.useAI(db, api.ai.chat);

// Send a message
const reply = await chat({ messages: [{ role: 'user', content: 'Hello' }] });

// Signals
chat.response();  // last AI response
chat.isLoading(); // true while generating
chat.history();   // [{ args: {...}, result: '...', ts: 1706... }]

// Reset for new conversation
chat.clear();
```

**Usage in UI:**

```js
const chat = Novoid.useAI(db, api.ai.chat);
const [input, setInput] = Novoid.signal('');

h('div', { class: 'nv-flex nv-flex-col nv-gap-4' },
  // Response
  Novoid.when(() => chat.response(),
    () => h('div', { class: 'nv-card nv-card-body nv-prose' }, () => chat.response()),
  ),

  // Loading indicator
  Novoid.when(chat.isLoading,
    () => h('div', { class: 'nv-skeleton nv-h-16 nv-w-full nv-rounded-lg' }),
  ),

  // Input
  h('form', {
    class: 'nv-flex nv-gap-2',
    onSubmit: async (e) => {
      e.preventDefault();
      await chat({ prompt: input() });
      setInput('');
    },
  },
    h('input', { class: 'nv-input nv-flex-1', bind: [input, setInput], placeholder: 'Ask anything...' }),
    h('button', {
      class: 'nv-btn nv-btn-primary',
      disabled: chat.isLoading,
    }, () => chat.isLoading() ? 'Thinking...' : 'Send'),
  ),
);
```

---

### Multi-Agent Collaboration

Multiple agents can work on the same page in parallel — on one machine or across remote machines. Convex coordinates everything: atomic claims, real-time status, optimistic concurrency.

```
Machine A (local)                         Convex Cloud
─────────────────                         ────────────
Agent 1: claim("header")  ──────────→  atomic mutex in fragments table
Agent 2: claim("sidebar") ──────────→  atomic mutex in fragments table
                                         ↓
Agent 1: publishFragment(html) ──────→  write to fragments table
Agent 2: publishFragment(html) ──────→  write to fragments table
                                         ↓
Either agent: compose("dashboard") ──→  assemble all fragments
                                         ↓
                                       write to pages table
                                         ↓
Machine B (remote)                     live at /app/dashboard
─────────────────
Agent 3: claim("main") ─────────────→  same fragments table
Agent 3: publishFragment(html) ──────→  same coordination
Agent 3: compose("dashboard") ───────→  re-compose with all fragments
```

**Agent ID convention** — generate a unique ID per session:

```sh
AGENT_ID="claude-$(date +%s | tail -c 5)"
```

---

#### collab:createPlan

Define a page's fragment structure and template. Creates the plan and all fragment records.

```sh
npx convex run collab:createPlan '{...}'
```

| Parameter | Type | Description |
|---|---|---|
| `slug` | `string` | Page slug (matches the URL: `/app/<slug>`) |
| `description` | `string` | Human-readable description of the page |
| `fragments` | `Array<{ name, order, description }>` | Fragment definitions |
| `template` | `string` | HTML template with `{{fragment-name}}` placeholders |
| `secret` | `string` | Publish secret |

**Returns:** Plan ID.

If a plan already exists for this slug, it and all its fragments are replaced.

```sh
source .env.local
npx convex run collab:createPlan '{
  "slug": "dashboard",
  "description": "Admin dashboard with header, sidebar, and main content",
  "fragments": [
    { "name": "header", "order": 1, "description": "Top navigation bar" },
    { "name": "sidebar", "order": 2, "description": "Left sidebar with nav links" },
    { "name": "main", "order": 3, "description": "Main content area with charts" }
  ],
  "template": "<!DOCTYPE html><html><head><title>Dashboard</title><link rel=\"stylesheet\" href=\"../css/novoid.min.css\"></head><body>{{header}}{{sidebar}}{{main}}<script src=\"../js/novoid.min.js\"></''"''"'script></body></html>",
  "secret": "'$PUBLISH_SECRET'"
}'
```

---

#### collab:claim

Atomically claim a fragment for this agent. Two agents cannot claim the same fragment — Convex mutations are transactional. Claims older than 10 minutes are considered stale and can be overridden.

```sh
npx convex run collab:claim '{...}'
```

| Parameter | Type | Description |
|---|---|---|
| `slug` | `string` | Page slug |
| `name` | `string` | Fragment name to claim |
| `agentId` | `string` | Unique agent identifier |
| `secret` | `string` | Publish secret |

**Returns:** `{ version: number }` — use this version number in `publishFragment`.

```sh
source .env.local
npx convex run collab:claim '{
  "slug": "dashboard",
  "name": "header",
  "agentId": "'$AGENT_ID'",
  "secret": "'$PUBLISH_SECRET'"
}'
```

Throws if the fragment is already claimed by another agent and the claim is less than 10 minutes old.

---

#### collab:publishFragment

Write HTML to a claimed fragment. Checks that the calling agent holds the claim and that the version matches (optimistic concurrency).

```sh
npx convex run collab:publishFragment '{...}'
```

| Parameter | Type | Description |
|---|---|---|
| `slug` | `string` | Page slug |
| `name` | `string` | Fragment name |
| `html` | `string` | The HTML content for this fragment |
| `expectedVersion` | `number` | Version from `claim` or previous `publishFragment` |
| `agentId` | `string` | Agent identifier (must match claim) |
| `secret` | `string` | Publish secret |

**Returns:** `{ version: number }` — the new version after publish.

```sh
source .env.local
HTML_JSON=$(python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" < src/app/fragments/dashboard-header.html)
npx convex run collab:publishFragment '{
  "slug": "dashboard",
  "name": "header",
  "html": '$HTML_JSON',
  "expectedVersion": 0,
  "agentId": "'$AGENT_ID'",
  "secret": "'$PUBLISH_SECRET'"
}'
```

Throws on version conflict or if the fragment is not claimed by this agent.

---

#### collab:release

Release a claim without publishing. Returns the fragment to "open" status so another agent can claim it.

```sh
npx convex run collab:release '{...}'
```

| Parameter | Type | Description |
|---|---|---|
| `slug` | `string` | Page slug |
| `name` | `string` | Fragment name |
| `agentId` | `string` | Agent identifier (must match claim) |
| `secret` | `string` | Publish secret |

```sh
source .env.local
npx convex run collab:release '{
  "slug": "dashboard",
  "name": "header",
  "agentId": "'$AGENT_ID'",
  "secret": "'$PUBLISH_SECRET'"
}'
```

---

#### collab:compose

Assemble all published fragments into the final page. Replaces each `{{fragment-name}}` in the template with the fragment's HTML and writes the result to the `pages` table. The page is immediately live at `/app/<slug>`.

```sh
npx convex run collab:compose '{...}'
```

| Parameter | Type | Description |
|---|---|---|
| `slug` | `string` | Page slug |
| `secret` | `string` | Publish secret |

```sh
source .env.local
npx convex run collab:compose '{
  "slug": "dashboard",
  "secret": "'$PUBLISH_SECRET'"
}'
```

Marks the plan status as "complete" after composition.

---

#### collab:status

See all fragments for a page — their status, who claimed them, and version numbers. This is a public query (no secret required) and can also be accessed via HTTP at `GET /collab/<slug>`.

```sh
npx convex run collab:status '{"slug": "dashboard"}'
```

| Parameter | Type | Description |
|---|---|---|
| `slug` | `string` | Page slug |

**Returns:**
```json
{
  "plan": {
    "slug": "dashboard",
    "description": "Admin dashboard",
    "status": "active",
    "template": "...",
    "fragments": [{ "name": "header", "order": 1, "description": "..." }, ...]
  },
  "fragments": [
    { "name": "header", "status": "published", "claimedBy": "claude-12345", "version": 1, "order": 1 },
    { "name": "sidebar", "status": "claimed", "claimedBy": "claude-67890", "version": 0, "order": 2 },
    { "name": "main", "status": "open", "claimedBy": null, "version": 0, "order": 3 }
  ]
}
```

Returns `null` if no plan exists for the slug.

**HTTP endpoint:** `GET https://<deployment>.convex.site/collab/<slug>` — returns the same JSON. Any agent on any machine can check status without Convex CLI.

---

#### collab:myWork

See what fragments this agent currently has claimed across all pages. Public query (no secret required).

```sh
npx convex run collab:myWork '{"agentId": "claude-12345"}'
```

| Parameter | Type | Description |
|---|---|---|
| `agentId` | `string` | Agent identifier |

**Returns:**
```json
[
  { "slug": "dashboard", "name": "header", "status": "claimed", "claimedAt": 1707235200000 },
  { "slug": "landing", "name": "hero", "status": "published", "claimedAt": 1707235100000 }
]
```

---

#### Multi-Agent Workflow Example

Complete sequence from plan creation through composition:

```sh
# 1. Generate agent ID
AGENT_ID="claude-$(date +%s | tail -c 5)"
source .env.local

# 2. Create a plan
npx convex run collab:createPlan '{
  "slug": "dashboard",
  "description": "Admin dashboard",
  "fragments": [
    { "name": "header", "order": 1, "description": "Top nav" },
    { "name": "sidebar", "order": 2, "description": "Side nav" },
    { "name": "main", "order": 3, "description": "Content" }
  ],
  "template": "<!DOCTYPE html><html><body>{{header}}<div style=\"display:flex\">{{sidebar}}{{main}}</div></body></html>",
  "secret": "'$PUBLISH_SECRET'"
}'

# 3. Check status
npx convex run collab:status '{"slug": "dashboard"}'

# 4. Claim a fragment
npx convex run collab:claim '{
  "slug": "dashboard",
  "name": "header",
  "agentId": "'$AGENT_ID'",
  "secret": "'$PUBLISH_SECRET'"
}'
# Returns: { version: 0 }

# 5. Generate the fragment HTML locally
# (write to src/app/fragments/dashboard-header.html)

# 6. Publish the fragment
HTML_JSON=$(python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" < src/app/fragments/dashboard-header.html)
npx convex run collab:publishFragment '{
  "slug": "dashboard",
  "name": "header",
  "html": '$HTML_JSON',
  "expectedVersion": 0,
  "agentId": "'$AGENT_ID'",
  "secret": "'$PUBLISH_SECRET'"
}'
# Returns: { version: 1 }

# 7. Once all fragments are published, compose
npx convex run collab:compose '{
  "slug": "dashboard",
  "secret": "'$PUBLISH_SECRET'"
}'
# Page is now live at /app/dashboard
```

---

### OpenRouter via Convex — Bootstrap Pattern

no∅ projects use **Convex as the single source of truth**. The OpenRouter API key is stored in a Convex `keys` table at project setup. All AI calls go through Convex actions — no API keys in the client.

#### Architecture

```
Browser (no∅)          Convex Cloud           OpenRouter
─────────────          ────────────           ──────────
  useAI(send) ──────→  action:ai.chat
                        │ read key from DB
                        │ fetch OpenRouter ──→ /chat/completions
                        │ ◄──────────────────  response
  response() ◄────────  return result
```

#### 1. Store the key (one-time setup)

Create a `keys` table in your Convex schema:

```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  keys: defineTable({
    name: v.string(),
    value: v.string(),
  }).index("by_name", ["name"]),
});
```

Seed the key via a mutation (run once from dashboard or a setup script):

```ts
// convex/keys.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const set = mutation({
  args: { name: v.string(), value: v.string() },
  handler: async (ctx, { name, value }) => {
    const existing = await ctx.db.query("keys").withIndex("by_name", q => q.eq("name", name)).first();
    if (existing) {
      await ctx.db.patch(existing._id, { value });
    } else {
      await ctx.db.insert("keys", { name, value });
    }
  },
});

export const get = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const key = await ctx.db.query("keys").withIndex("by_name", q => q.eq("name", name)).first();
    return key?.value ?? null;
  },
});
```

#### 2. Convex action calls OpenRouter

```ts
// convex/ai.ts
import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const chat = action({
  args: {
    prompt: v.optional(v.string()),
    messages: v.optional(v.array(v.object({
      role: v.string(),
      content: v.string(),
    }))),
    model: v.optional(v.string()),
  },
  handler: async (ctx, { prompt, messages, model }) => {
    // Read key from DB
    const apiKey = await ctx.runQuery(internal.keys.get, { name: "OPENROUTER_API_KEY" });
    if (!apiKey) throw new Error("OpenRouter API key not configured");

    const body = {
      model: model || "openai/gpt-4o",
      messages: messages || [{ role: "user", content: prompt }],
    };

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);
    const data = await res.json();
    return data.choices[0].message.content;
  },
});
```

#### 3. Frontend consumes with useAI

```js
const { h, signal, mount, createClient, useAI, when } = Novoid;

const db = createClient('https://your-deployment.convex.cloud');

mount('#app', () => {
  const chat = useAI(db, api.ai.chat);
  const [input, setInput] = signal('');

  return h('div', { class: 'nv-container nv-py-8', style: 'max-width: 640px' },
    h('h1', { class: 'nv-h3 nv-mb-4' }, 'AI Chat'),

    // Conversation history
    h('div', { class: 'nv-flex nv-flex-col nv-gap-3 nv-mb-4' },
      () => (chat.history() || []).map(entry =>
        h('div', { class: 'nv-flex nv-flex-col nv-gap-2' },
          h('div', { class: 'nv-card nv-bg-subtle' },
            h('div', { class: 'nv-card-body nv-py-2 nv-px-3 nv-text-sm' }, entry.args.prompt),
          ),
          h('div', { class: 'nv-card' },
            h('div', { class: 'nv-card-body nv-py-2 nv-px-3 nv-prose' }, entry.result),
          ),
        )
      ),
    ),

    // Loading
    when(chat.isLoading,
      () => h('div', { class: 'nv-skeleton nv-h-16 nv-w-full nv-rounded-lg nv-mb-4' }),
    ),

    // Input
    h('form', {
      class: 'nv-flex nv-gap-2',
      onSubmit: async (e) => {
        e.preventDefault();
        if (!input()) return;
        await chat({ prompt: input() });
        setInput('');
      },
    },
      h('input', { class: 'nv-input nv-flex-1', bind: [input, setInput], placeholder: 'Ask anything...' }),
      h('button', {
        class: 'nv-btn nv-btn-primary',
        disabled: chat.isLoading,
      }, () => chat.isLoading() ? 'Thinking...' : 'Ask'),
    ),
  );
});
```

---

### Self-Hosting Platform

no∅ is self-hosting: GitHub has only a minimal bootstrapper, and the actual platform is stored in and served from Convex. The platform admin UI is itself a page in the database — it can edit itself.

#### Convex Schema

```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  pages: defineTable({
    slug: v.string(),
    html: v.string(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  assets: defineTable({
    name: v.string(),
    content: v.string(),
    contentType: v.string(),
  }).index("by_name", ["name"]),

  keys: defineTable({
    name: v.string(),
    value: v.string(),
  }).index("by_name", ["name"]),
});
```

#### Pages API (`convex/pages.ts`)

| Function | Type | Auth | Purpose |
|---|---|---|---|
| `publish` | mutation | `secret` required | Upsert a page by slug |
| `remove` | mutation | `secret` required | Delete a page by slug |
| `list` | query | public | List all pages (slug + updatedAt) |
| `get` | query | public | Get full page by slug |

#### Assets API (`convex/assets.ts`)

| Function | Type | Auth | Purpose |
|---|---|---|---|
| `set` | mutation | `secret` required | Upsert an asset (CSS/JS) |
| `get` | query | public | Get asset by name |

#### Keys API (`convex/keys.ts`)

| Function | Type | Purpose |
|---|---|---|
| `set` | internalMutation | Set a key (CLI only) |
| `get` | internalQuery | Read a key (server-side only) |

#### HTTP Routes (`convex/http.ts`)

| Route | Response |
|---|---|
| `GET /platform` | Platform admin UI (HTML) |
| `GET /app/:slug` | Any published page (HTML) |
| `GET /css/:name` | CSS asset (e.g. novoid.min.css) |
| `GET /js/:name` | JS asset (e.g. novoid.min.js) |

#### Auth Model

All write mutations require a `secret` argument verified against `PUBLISH_SECRET` in the `keys` table. The secret is set via `npx convex run seed:seedSecret` (CLI only — never callable from a browser). Read operations and HTTP routes are public.

#### Publishing a Page

From the platform UI or via Convex mutation:
```js
const client = Novoid.createClient(CONVEX_URL);
const publish = Novoid.useMutation(client, "pages:publish");
await publish({ slug: "my-page", html: "<h1>Hello</h1>", secret: PUBLISH_SECRET });
// Live at: https://DEPLOYMENT.convex.site/app/my-page
```

#### Seed Script

```sh
# One-time setup after `npx convex dev`:
npx convex run seed:seedSecret '{"name":"PUBLISH_SECRET","value":"your-secret"}'
sh seed.sh https://YOUR-DEPLOYMENT.convex.cloud your-secret
```

---

## Tutorials

### Tutorial 1: Counter App

A minimal reactive counter.

```html
<div id="app"></div>
<script>
const { signal, h, mount } = Novoid;

mount('#app', () => {
  const [count, setCount] = signal(0);

  return h('div', { class: 'nv-container nv-py-8 nv-text-center' },
    h('h1', { class: 'nv-h2 nv-mb-4' }, 'Counter'),
    h('p', { class: 'nv-text-4xl nv-font-bold nv-mb-6' }, () => count()),
    h('div', { class: 'nv-flex nv-justify-center nv-gap-3' },
      h('button', {
        class: 'nv-btn nv-btn-secondary nv-btn-lg',
        onClick: () => setCount(n => n - 1),
      }, '−'),
      h('button', {
        class: 'nv-btn nv-btn-primary nv-btn-lg',
        onClick: () => setCount(n => n + 1),
      }, '+'),
      h('button', {
        class: 'nv-btn nv-btn-ghost',
        onClick: () => setCount(0),
      }, 'Reset'),
    )
  );
});
</script>
```

---

### Tutorial 2: Todo App with Store

Full todo app using `createStore`.

```html
<div id="app"></div>
<script>
const { signal, computed, h, list, mount, createStore } = Novoid;

const store = createStore(
  { todos: [], nextId: 1 },
  {
    add: (s, text) => ({
      ...s,
      todos: [...s.todos, { id: s.nextId, text, done: false }],
      nextId: s.nextId + 1,
    }),
    toggle: (s, id) => ({
      ...s,
      todos: s.todos.map(t => t.id === id ? { ...t, done: !t.done } : t),
    }),
    remove: (s, id) => ({
      ...s,
      todos: s.todos.filter(t => t.id !== id),
    }),
  }
);

mount('#app', () => {
  const [input, setInput] = signal('');
  const remaining = computed(() => store.get().todos.filter(t => !t.done).length);

  const addTodo = () => {
    const text = input().trim();
    if (!text) return;
    store.actions.add(text);
    setInput('');
  };

  const ul = h('div', { class: 'nv-flex nv-flex-col nv-gap-2' });

  list(ul, () => store.get().todos, t => t.id, (todo) =>
    h('div', { class: 'nv-flex nv-items-center nv-gap-3 nv-p-3 nv-border nv-rounded' },
      h('input', {
        type: 'checkbox',
        class: 'nv-checkbox',
        checked: todo.done ? 'checked' : undefined,
        onChange: () => store.actions.toggle(todo.id),
      }),
      h('span', {
        class: 'nv-flex-1',
        style: todo.done ? { textDecoration: 'line-through', opacity: '0.5' } : {},
      }, todo.text),
      h('button', {
        class: 'nv-btn nv-btn-ghost nv-btn-sm nv-text-danger',
        onClick: () => store.actions.remove(todo.id),
      }, '✕')
    )
  );

  return h('div', { class: 'nv-container nv-max-w-md nv-py-8' },
    h('h1', { class: 'nv-h3 nv-mb-4' }, 'Todo List'),
    h('div', { class: 'nv-flex nv-gap-2 nv-mb-4' },
      h('input', {
        class: 'nv-input',
        placeholder: 'What needs to be done?',
        bind: [input, setInput],
        onKeydown: (e) => { if (e.key === 'Enter') addTodo(); },
      }),
      h('button', { class: 'nv-btn nv-btn-primary', onClick: addTodo }, 'Add'),
    ),
    ul,
    h('p', { class: 'nv-text-sm nv-text-muted nv-mt-4' }, () => `${remaining()} remaining`)
  );
});
</script>
```

---

### Tutorial 3: Form with Validation

Using `createForm` for validated user input.

```html
<div id="app"></div>
<script>
const { h, mount, createForm, toast } = Novoid;

mount('#app', () => {
  const form = createForm({
    name: { initial: '', required: true, minLength: 2 },
    email: {
      initial: '',
      required: true,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: 'Enter a valid email',
    },
    message: { initial: '', required: true, minLength: 10 },
  });

  const onSubmit = async (data) => {
    // Simulate API call
    await new Promise(r => setTimeout(r, 1000));
    toast.success(`Thanks, ${data.name}! Message sent.`);
    form.reset();
  };

  const field = (name, label, type = 'text') =>
    h('div', { class: 'nv-field' },
      h('label', { class: 'nv-label' }, label),
      type === 'textarea'
        ? h('textarea', {
            class: () => `nv-textarea ${form.errors[name].get() ? 'nv-input-error' : ''}`,
            bind: [form.fields[name].get, form.fields[name].set],
          })
        : h('input', {
            class: () => `nv-input ${form.errors[name].get() ? 'nv-input-error' : ''}`,
            type,
            bind: [form.fields[name].get, form.fields[name].set],
          }),
      h('p', { class: 'nv-error-text', show: () => form.errors[name].get() },
        () => form.errors[name].get()
      ),
    );

  return h('div', { class: 'nv-container nv-max-w-md nv-py-8' },
    h('div', { class: 'nv-card' },
      h('div', { class: 'nv-card-header' },
        h('h2', { class: 'nv-h4' }, 'Contact Us')
      ),
      h('div', { class: 'nv-card-body' },
        h('form', { onSubmit: (e) => { e.preventDefault(); form.handleSubmit(onSubmit); } },
          field('name', 'Name'),
          field('email', 'Email', 'email'),
          field('message', 'Message', 'textarea'),
          h('button', {
            class: 'nv-btn nv-btn-primary nv-btn-block',
            disabled: () => form.isSubmitting(),
          }, () => form.isSubmitting() ? 'Sending...' : 'Send Message')
        )
      )
    )
  );
});
</script>
```

---

### Tutorial 4: Async Data Loading

Using `useAsync` to fetch and display data.

```html
<div id="app"></div>
<script>
const { h, mount, useAsync, when } = Novoid;

mount('#app', () => {
  const { data, loading, error, refetch } = useAsync(async () => {
    const res = await fetch('https://jsonplaceholder.typicode.com/users');
    if (!res.ok) throw new Error('Failed to fetch');
    return res.json();
  });

  return h('div', { class: 'nv-container nv-py-8' },
    h('div', { class: 'nv-flex nv-items-center nv-justify-between nv-mb-6' },
      h('h1', { class: 'nv-h3' }, 'Users'),
      h('button', { class: 'nv-btn nv-btn-secondary nv-btn-sm', onClick: refetch }, 'Refresh'),
    ),
    when(loading,
      () => h('div', { class: 'nv-flex nv-justify-center nv-p-12' },
        h('div', { class: 'nv-spinner nv-spinner-lg' })
      ),
      () => when(error,
        () => h('div', { class: 'nv-alert nv-alert-danger' }, () => error().message),
        () => h('div', { class: 'nv-grid nv-cols-1 nv-md-cols-2 nv-lg-cols-3 nv-gap-4' },
          () => (data() || []).map(user =>
            h('div', { class: 'nv-card nv-card-hoverable' },
              h('div', { class: 'nv-card-body' },
                h('div', { class: 'nv-flex nv-items-center nv-gap-3 nv-mb-3' },
                  h('div', { class: 'nv-avatar' }, user.name.charAt(0)),
                  h('div', {},
                    h('h3', { class: 'nv-h6' }, user.name),
                    h('p', { class: 'nv-text-sm nv-text-muted' }, user.email),
                  ),
                ),
                h('p', { class: 'nv-text-sm nv-text-muted' }, user.company.name),
              )
            )
          )
        )
      )
    )
  );
});
</script>
```

---

### Tutorial 5: SPA with Router

Multi-page SPA using `createRouter`.

```html
<div id="app"></div>
<script>
const { h, signal, createRouter, link, mount } = Novoid;

function Navbar(navigate) {
  return h('nav', { class: 'nv-navbar nv-navbar-sticky' },
    h('span', { class: 'nv-navbar-brand' }, 'MyApp'),
    h('div', { class: 'nv-navbar-nav' },
      link('Home', '/', 'nv-navbar-link'),
      link('About', '/about', 'nv-navbar-link'),
      link('Users', '/users', 'nv-navbar-link'),
    ),
  );
}

function HomePage({ navigate }) {
  return h('div', {},
    Navbar(navigate),
    h('div', { class: 'nv-container nv-py-8 nv-text-center' },
      h('h1', { class: 'nv-h1 nv-mb-4' }, 'Welcome'),
      h('p', { class: 'nv-text-lg nv-text-muted nv-mb-6' }, 'A no∅ single-page app.'),
      h('button', {
        class: 'nv-btn nv-btn-primary nv-btn-lg',
        onClick: () => navigate('/about'),
      }, 'Learn More'),
    )
  );
}

function AboutPage({ navigate }) {
  return h('div', {},
    Navbar(navigate),
    h('div', { class: 'nv-container nv-py-8' },
      h('nav', { class: 'nv-breadcrumb nv-mb-4' },
        h('a', { href: '#/', class: 'nv-breadcrumb-item' }, 'Home'),
        h('span', { class: 'nv-breadcrumb-sep' }, '/'),
        h('span', { class: 'nv-breadcrumb-item active' }, 'About'),
      ),
      h('h1', { class: 'nv-h2 nv-mb-4' }, 'About'),
      h('p', { class: 'nv-text-muted' }, 'Built with no∅ — zero build tools.'),
    )
  );
}

function UsersPage({ navigate }) {
  return h('div', {},
    Navbar(navigate),
    h('div', { class: 'nv-container nv-py-8' },
      h('h1', { class: 'nv-h2 nv-mb-4' }, 'Users'),
      h('div', { class: 'nv-grid nv-cols-1 nv-md-cols-3 nv-gap-4' },
        [1, 2, 3].map(id =>
          h('div', {
            class: 'nv-card nv-card-hoverable nv-cursor-pointer',
            onClick: () => navigate(`/users/${id}`),
          },
            h('div', { class: 'nv-card-body' },
              h('h3', { class: 'nv-h5' }, `User ${id}`),
              h('p', { class: 'nv-text-muted nv-text-sm' }, 'Click to view details'),
            )
          )
        )
      ),
    )
  );
}

function UserDetailPage({ params, navigate }) {
  return h('div', {},
    Navbar(navigate),
    h('div', { class: 'nv-container nv-py-8' },
      h('button', { class: 'nv-btn nv-btn-ghost nv-mb-4', onClick: () => navigate('/users') }, '← Back'),
      h('h1', { class: 'nv-h2 nv-mb-4' }, `User ${params.id}`),
      h('div', { class: 'nv-card' },
        h('div', { class: 'nv-card-body' },
          h('p', {}, `Viewing profile for user #${params.id}`),
        )
      ),
    )
  );
}

function NotFoundPage({ navigate }) {
  return h('div', {},
    Navbar(navigate),
    h('div', { class: 'nv-container nv-py-8 nv-text-center' },
      h('h1', { class: 'nv-h1 nv-mb-4' }, '404'),
      h('p', { class: 'nv-text-muted nv-mb-6' }, 'Page not found.'),
      h('button', { class: 'nv-btn nv-btn-primary', onClick: () => navigate('/') }, 'Go Home'),
    )
  );
}

mount('#app', () => {
  const container = h('div', {});

  createRouter([
    { path: '/', component: HomePage },
    { path: '/about', component: AboutPage },
    { path: '/users', component: UsersPage },
    { path: '/users/:id', component: UserDetailPage },
    { path: '*', component: NotFoundPage },
  ], container);

  return container;
});
</script>
```

---

### Tutorial 6: Full Page Layout

A complete page layout with navbar, sidebar, main content, and footer.

```html
<div id="app"></div>
<script>
const { h, signal, mount } = Novoid;

mount('#app', () => {
  const [sidebarOpen, setSidebarOpen] = signal(true);

  return h('div', { class: 'nv-min-h-screen nv-flex nv-flex-col' },
    // Navbar
    h('nav', { class: 'nv-navbar' },
      h('div', { class: 'nv-flex nv-items-center nv-gap-3' },
        h('button', {
          class: 'nv-btn nv-btn-ghost nv-btn-icon nv-btn-sm',
          onClick: () => setSidebarOpen(v => !v),
        }, '☰'),
        h('span', { class: 'nv-navbar-brand' }, 'Dashboard'),
      ),
      h('div', { class: 'nv-flex nv-items-center nv-gap-2' },
        h('div', { class: 'nv-avatar nv-avatar-sm' }, 'JD'),
      ),
    ),

    // Body
    h('div', { class: 'nv-flex nv-flex-1' },
      // Sidebar
      h('aside', {
        class: 'nv-border-r nv-bg-subtle nv-p-4 nv-flex nv-flex-col nv-gap-1',
        style: () => ({ width: sidebarOpen() ? '240px' : '0', overflow: 'hidden', transition: 'width 0.25s ease' }),
      },
        h('a', { class: 'nv-navbar-link active' }, 'Overview'),
        h('a', { class: 'nv-navbar-link' }, 'Analytics'),
        h('a', { class: 'nv-navbar-link' }, 'Settings'),
        h('div', { class: 'nv-flex-1' }),
        h('hr', { class: 'nv-divider' }),
        h('a', { class: 'nv-navbar-link nv-text-danger' }, 'Log Out'),
      ),

      // Main
      h('main', { class: 'nv-flex-1 nv-p-6' },
        h('h1', { class: 'nv-h3 nv-mb-6' }, 'Overview'),
        h('div', { class: 'nv-grid nv-cols-1 nv-md-cols-3 nv-gap-4 nv-mb-6' },
          ['Revenue', 'Users', 'Orders'].map(label =>
            h('div', { class: 'nv-card' },
              h('div', { class: 'nv-card-body' },
                h('p', { class: 'nv-text-sm nv-text-muted nv-mb-1' }, label),
                h('p', { class: 'nv-h3' }, '$12,345'),
                h('span', { class: 'nv-badge nv-badge-success nv-badge-dot nv-mt-2' }, '+12%'),
              )
            )
          ),
        ),
        h('div', { class: 'nv-card' },
          h('div', { class: 'nv-card-header' },
            h('h3', { class: 'nv-h5' }, 'Recent Orders'),
          ),
          h('div', { class: 'nv-card-body nv-p-0' },
            h('table', { class: 'nv-table nv-table-hover' },
              h('thead', {},
                h('tr', {},
                  h('th', {}, 'Order'),
                  h('th', {}, 'Customer'),
                  h('th', {}, 'Status'),
                  h('th', {}, 'Amount'),
                ),
              ),
              h('tbody', {},
                h('tr', {},
                  h('td', {}, '#1001'),
                  h('td', {}, 'Alice'),
                  h('td', {}, h('span', { class: 'nv-badge nv-badge-success' }, 'Paid')),
                  h('td', {}, '$250.00'),
                ),
                h('tr', {},
                  h('td', {}, '#1002'),
                  h('td', {}, 'Bob'),
                  h('td', {}, h('span', { class: 'nv-badge nv-badge-warning' }, 'Pending')),
                  h('td', {}, '$180.00'),
                ),
              ),
            ),
          ),
        ),
      ),
    ),

    // Footer
    h('footer', { class: 'nv-border-t nv-p-4 nv-text-center nv-text-sm nv-text-muted' },
      'Built with no∅'
    ),
  );
});
</script>
```

---

### Tutorial 7: AI Chat with Convex + OpenRouter

Full-stack AI chat: OpenRouter key stored in Convex DB, AI action calls OpenRouter server-side, real-time messages sync across clients, `useAI` manages conversation state.

**Convex schema** (`convex/schema.ts`):

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  keys: defineTable({
    name: v.string(),
    value: v.string(),
  }).index("by_name", ["name"]),
  messages: defineTable({
    role: v.string(),       // 'user' | 'assistant'
    content: v.string(),
    author: v.optional(v.string()),
  }),
});
```

**Key storage** (`convex/keys.ts`):

```ts
import { mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const set = mutation({
  args: { name: v.string(), value: v.string() },
  handler: async (ctx, { name, value }) => {
    const existing = await ctx.db.query("keys").withIndex("by_name", q => q.eq("name", name)).first();
    if (existing) await ctx.db.patch(existing._id, { value });
    else await ctx.db.insert("keys", { name, value });
  },
});

export const get = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const key = await ctx.db.query("keys").withIndex("by_name", q => q.eq("name", name)).first();
    return key?.value ?? null;
  },
});
```

**Messages + AI action** (`convex/chat.ts`):

```ts
import { query, mutation, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("messages").order("desc").take(50);
  },
});

export const send = mutation({
  args: { role: v.string(), content: v.string(), author: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", args);
  },
});

export const ask = action({
  args: { prompt: v.string(), author: v.optional(v.string()) },
  handler: async (ctx, { prompt, author }) => {
    // Read key from DB
    const apiKey = await ctx.runQuery(internal.keys.get, { name: "OPENROUTER_API_KEY" });
    if (!apiKey) throw new Error("OpenRouter API key not configured");

    // Save user message
    await ctx.runMutation(internal.chat.send, { role: "user", content: prompt, author });

    // Get recent context
    const history = await ctx.runQuery(internal.chat.list);
    const messages = history.reverse().map(m => ({ role: m.role, content: m.content }));

    // Call OpenRouter
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-4o", messages }),
    });

    if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);
    const data = await res.json();
    const reply = data.choices[0].message.content;

    // Save assistant reply
    await ctx.runMutation(internal.chat.send, { role: "assistant", content: reply });

    return reply;
  },
});
```

**Frontend** (`index.html`):

```html
<link rel="stylesheet" href="nv.css">
<script src="https://unpkg.com/convex@latest/dist/browser.bundle.js"></script>
<script src="nv.js"></script>

<div id="app"></div>
<script>
const { signal, h, mount, list, when, createClient, useQuery, useAI } = Novoid;

const db = createClient('https://your-deployment.convex.cloud');

mount('#app', () => {
  const [input, setInput] = signal('');
  const { data: messages, loading } = useQuery(db, api.chat.list);
  const ask = useAI(db, api.chat.ask);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input() || ask.isLoading()) return;
    const prompt = input();
    setInput('');
    await ask({ prompt });
  };

  return h('div', { class: 'nv-container nv-py-8 nv-mx-auto', style: 'max-width: 640px' },
    h('h1', { class: 'nv-h3 nv-mb-6' }, 'AI Chat'),

    // Messages (real-time from Convex)
    when(loading,
      () => h('div', { class: 'nv-flex nv-flex-col nv-gap-3' },
        h('div', { class: 'nv-skeleton nv-h-12 nv-w-full nv-rounded-lg' }),
        h('div', { class: 'nv-skeleton nv-h-12 nv-w-full nv-rounded-lg' }),
      ),
      () => list(
        h('div', { class: 'nv-flex nv-flex-col nv-gap-2 nv-mb-6' }),
        messages,
        (msg) => msg._id,
        (msg) => h('div', {
          class: () => `nv-card ${msg.role === 'user' ? 'nv-bg-subtle' : ''}`,
        },
          h('div', { class: 'nv-card-body nv-py-3 nv-px-4' },
            h('p', { class: 'nv-text-xs nv-text-muted nv-mb-1' },
              msg.role === 'user' ? (msg.author || 'You') : 'AI'),
            h('p', { class: 'nv-text-base' }, msg.content),
          )
        )
      )
    ),

    // Thinking indicator
    when(ask.isLoading,
      () => h('div', { class: 'nv-flex nv-items-center nv-gap-2 nv-mb-4 nv-text-sm nv-text-muted' },
        h('div', { class: 'nv-spinner nv-spinner-sm' }),
        'AI is thinking...',
      ),
    ),

    // Input
    h('form', { class: 'nv-flex nv-gap-2', onSubmit: handleSubmit },
      h('input', {
        class: 'nv-input nv-flex-1',
        bind: [input, setInput],
        placeholder: 'Ask anything...',
      }),
      h('button', {
        class: 'nv-btn nv-btn-primary',
        disabled: () => ask.isLoading() || !input(),
      }, () => ask.isLoading() ? 'Thinking...' : 'Send'),
    ),
  );
});
</script>
```

---

## Patterns & Conventions

1. **CSS prefix is `nv-`**. Every utility and component class starts with `nv-`. CSS variables start with `--nv-`.

2. **JS global is `Novoid`**. Destructure at the top of every script:
   ```js
   const { signal, effect, h, mount } = Novoid;
   ```

3. **Signal getters are called as functions**: `count()` not `count`. This triggers dependency tracking.

4. **No virtual DOM**. Effects auto-track signal reads and update the real DOM directly. This means:
   - No reconciliation overhead
   - No keys needed in `h()` (only in `list()`)
   - DOM updates are synchronous and fine-grained

5. **Use `batch()` for multiple signal writes** to prevent intermediate re-renders:
   ```js
   Novoid.batch(() => {
     setA(1);
     setB(2);
   });
   ```

6. **Reactive children in `h()`** must be functions:
   ```js
   // Reactive (re-evaluates when signal changes)
   h('p', {}, () => `Count: ${count()}`);

   // Static (never updates)
   h('p', {}, `Count: ${count()}`);
   ```

7. **Use `list()` for dynamic arrays**. It handles keyed reconciliation efficiently. Do not use `.map()` inside reactive children for large lists.

8. **Router is hash-based**. URLs look like `#/path`. Use `navigate()` for programmatic navigation, `Novoid.link()` for anchor elements.

9. **Dark mode** toggles surface tokens only. Component classes don't need to change — they reference token variables.

10. **No build tools**. Serve `nv.css` and `nv.js` as static files. Works with any static server, CDN, or `file://`.

11. **Form validation** is declarative via `createForm()` schema. Use `bind` for two-way input binding.

12. **Toast notifications** are fire-and-forget. Call `Novoid.toast.success('msg')` from anywhere.

13. **Error boundaries** wrap risky components. Always use for async or user-generated content.

14. **Component naming**: use PascalCase for component factories, lowercase for CSS classes:
    ```js
    const UserCard = Novoid.component('UserCard', (props) => { ... });
    // CSS: class="nv-card nv-card-hoverable"
    ```

15. **Keep text inputs outside signals.** When using `effect(render)` with full DOM rebuild, input signals trigger re-renders that destroy the input element mid-typing — losing focus and cursor position. Instead, create the input element once and read its `.value` directly:
    ```js
    // BAD — input re-created every keystroke, loses focus
    const [input, setInput] = signal("");
    function render() {
      var inp = h("input", { value: input() });
      inp.addEventListener("input", (e) => setInput(e.target.value));
    }
    effect(render);

    // GOOD — input persists across renders, never loses focus
    var inputEl = h("input", { placeholder: "Type here..." });
    inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    function submit() {
      var v = inputEl.value.trim();
      if (!v) return;
      doSomething(v);
      inputEl.value = "";
      inputEl.focus();
    }
    function render() {
      app.innerHTML = "";
      // ... rebuild list, but reuse inputEl
      row.appendChild(inputEl);
    }
    effect(render);
    ```

16. **`Novoid` has no `text()` helper.** Use `document.createTextNode(String(s))` directly, or define a local helper:
    ```js
    const t = (s) => document.createTextNode(String(s));
    ```
