# novoid-css

Codified knowledge for the no∅ design system. This file replaces reading `src/core.css` and `src/components.css`.

> **Render apps don't need this skill.** The render plugin owns all DOM and CSS. This skill is for classic apps using `h()` calls.

## Loading

```html
<link rel="stylesheet" href="../css/core.min.css">
```

Fonts: DM Sans (body), Outfit (headings), JetBrains Mono (code). Load via Google Fonts or self-host.

---

## Theme Variables

### Colors — Primary
`--nv-primary-{50-900}` — indigo scale (50=lightest, 900=darkest).

### Colors — Neutral
`--nv-gray-{50-900}` — neutral scale.

### Colors — Semantic
`--nv-success-{50,500,700}`, `--nv-warning-{50,500,700}`, `--nv-danger-{50,500,700}`, `--nv-info-{50,500,700}`.

### Surfaces
| Variable | Light | Dark |
|---|---|---|
| `--nv-bg` | `#ffffff` | `#0f1117` |
| `--nv-bg-subtle` | gray-50 | `#1a1d27` |
| `--nv-bg-muted` | gray-100 | `#252833` |
| `--nv-text` | gray-900 | `#e4e5e9` |
| `--nv-text-muted` | gray-600 | `#9ca0ab` |
| `--nv-text-subtle` | gray-400 | `#5c6170` |
| `--nv-border` | gray-200 | `#2e3140` |
| `--nv-border-strong` | gray-300 | `#3d4155` |
| `--nv-ring` | primary-500 | primary-500 |

### Typography
`--nv-font-sans` (DM Sans), `--nv-font-mono` (JetBrains Mono), `--nv-font-display` (Outfit).
`--nv-text-{xs,sm,base,lg,xl,2xl,3xl,4xl,5xl,6xl}` — 0.75rem to 3.75rem.
`--nv-font-{light,normal,medium,semibold,bold,black}` — 300 to 900.

### Spacing
`--nv-space-{0,1,2,3,4,5,6,8,10,12,16,20,24}` — 0 to 6rem.

### Borders
`--nv-radius-{none,sm,md,lg,xl,2xl,full}` — 0 to 9999px.

### Shadows
`--nv-shadow-{xs,sm,md,lg,xl,2xl}`.

### Z-Index
`--nv-z-{base,dropdown,sticky,overlay,drawer,modal,popover,toast}` — 0 to 600.

### Transitions
`--nv-ease`, `--nv-ease-in`, `--nv-ease-out`. `--nv-duration-{fast,normal,slow}` — 150ms, 250ms, 400ms.

---

## Dark Mode

Toggle with `[data-theme="dark"]` on `<html>` or `.nv-dark` on any container. All `--nv-*` variables auto-invert. No class changes needed on components.

```js
document.documentElement.setAttribute('data-theme', 'dark');
```

---

## Typography Classes

| Class | Effect |
|---|---|
| `.nv-h1`–`.nv-h6` | Headings (Outfit font, bold, tight line-height) |
| `.nv-text-{xs,sm,base,lg,xl,2xl,3xl,4xl,5xl,6xl}` | Font sizes |
| `.nv-font-{light,normal,medium,semibold,bold,black}` | Weights |
| `.nv-font-{sans,mono,display}` | Font families |
| `.nv-text-{left,center,right,justify}` | Alignment |
| `.nv-uppercase`, `.nv-lowercase`, `.nv-capitalize` | Transform |
| `.nv-tracking-{tight,wide,wider}` | Letter spacing |
| `.nv-leading-{tight,normal,relaxed}` | Line height |
| `.nv-truncate` | Ellipsis overflow |
| `.nv-line-clamp-{2,3}` | Multi-line truncation |

## Color Classes

| Class | Effect |
|---|---|
| `.nv-text-{primary,muted,subtle,success,warning,danger,info,white}` | Text color |
| `.nv-bg-{primary,subtle,muted,success,warning,danger,info,white}` | Background |

---

## Layout

### Container
`.nv-container` — centered, responsive max-width (640→768→1024→1280px).
`.nv-container-fluid` — full width with padding.
`.nv-section` — vertical padding (4rem).

### Grid
`.nv-grid` — CSS grid with `--nv-space-4` gap.
`.nv-cols-{1,2,3,4,5,6,12}` — column count.
`.nv-col-span-{1,2,3,4,6,8,12,full}` — column span.

**Responsive grid:**
`.nv-sm-cols-{2,3}` (640px+), `.nv-md-cols-{2,3,4}` (768px+), `.nv-lg-cols-{2,3,4,5,6}` (1024px+).

### Flexbox
`.nv-flex`, `.nv-inline-flex`, `.nv-flex-row`, `.nv-flex-col`, `.nv-flex-wrap`, `.nv-flex-nowrap`.
`.nv-flex-1`, `.nv-flex-auto`, `.nv-flex-none`, `.nv-grow`, `.nv-shrink-0`.
`.nv-stack` — flex column shorthand.

**Alignment:**
`.nv-items-{start,center,end,stretch,baseline}`.
`.nv-justify-{start,center,end,between,around,evenly}`.
`.nv-self-{start,center,end}`.

---

## Spacing

| Pattern | Values |
|---|---|
| `.nv-p-{0,1,2,3,4,5,6,8,10,12}` | Padding all sides |
| `.nv-px-{0,1,2,3,4,6,8}` | Padding inline |
| `.nv-py-{0,1,2,3,4,6,8}` | Padding block |
| `.nv-m-{0,1,2,3,4,auto}` | Margin all sides |
| `.nv-mx-auto` | Center horizontally |
| `.nv-my-{0,2,4,6,8}` | Margin block |
| `.nv-mt-{0,1,2,3,4,6,8}` | Margin top |
| `.nv-mb-{0,1,2,3,4,6,8}` | Margin bottom |
| `.nv-ml-auto`, `.nv-mr-auto` | Push left/right |
| `.nv-gap-{0,1,2,3,4,6,8}` | Flex/grid gap |

---

## Sizing

`.nv-w-{full,auto,screen}`, `.nv-h-{full,screen,1,2,3,4,6,8,10,12,16}`, `.nv-min-h-screen`.
`.nv-max-w-{xs,sm,md,lg,xl,2xl,3xl,4xl,prose}` — 20rem to 56rem (prose=65ch).

## Display & Position

`.nv-block`, `.nv-inline-block`, `.nv-inline`, `.nv-hidden`.
`.nv-relative`, `.nv-absolute`, `.nv-fixed`, `.nv-sticky`.
`.nv-top-0`, `.nv-right-0`, `.nv-bottom-0`, `.nv-left-0`, `.nv-inset-0`.
`.nv-overflow-{hidden,auto}`, `.nv-overflow-{x,y}-auto`.

## Borders

`.nv-border`, `.nv-border-strong`, `.nv-border-{t,b,l,r}`, `.nv-border-none`.
`.nv-border-{primary,danger}`, `.nv-border-2`.
`.nv-rounded-{none,sm}`, `.nv-rounded`, `.nv-rounded-{lg,xl,2xl,full}`.

## Shadows

`.nv-shadow-{xs,sm}`, `.nv-shadow`, `.nv-shadow-{lg,xl,2xl,none}`.

## Misc

`.nv-opacity-{0,25,50,75,100}`.
`.nv-transition`, `.nv-transition-{fast,slow,colors,transform,opacity}`.
`.nv-scale-{95,100,105}`, `.nv-translate-y-{0,1}`, `.nv--translate-y-1`.
`.nv-cursor-{pointer,default,not-allowed}`, `.nv-select-{none,all}`, `.nv-pointer-events-none`.
`.nv-sr-only` — screen reader only.
`.nv-focus-ring` — 2px outline on `:focus-visible`.

---

## Components

### Button
```
.nv-btn                                    Base button
.nv-btn-{primary,secondary,success,danger,warning,ghost,outline,link}  Variants
.nv-btn-{sm,lg,xl,icon,block,pill}         Sizes/shapes
.nv-btn-group                              Joined buttons (first/last get rounded corners)
```
States: `:hover` (auto), `:active` (scale 0.97), `:disabled` (opacity 0.5), `:focus-visible` (ring).

### Card
```
.nv-card                  Border + bg + rounded-lg
.nv-card-elevated         Shadow, no border
.nv-card-header           Top section with border-bottom
.nv-card-body             Padded content
.nv-card-footer           Bottom section with border-top
.nv-card-hoverable        Lifts on hover (shadow-lg + translateY)
```

### Forms
```
.nv-label                 Block label (sm, medium weight)
.nv-input                 Text input (full width, border, focus ring)
.nv-select                Dropdown (custom arrow)
.nv-textarea              Multi-line (resizable, min 5rem)
.nv-checkbox, .nv-radio   Accent-colored checks
.nv-field                 Wrapper with mb-4
.nv-field-inline          Flex row for inline label+input
.nv-helper                Help text (xs, muted)
.nv-error-text            Error text (xs, danger)
.nv-input-{sm,lg}         Size variants
.nv-input-{error,success} Validation border colors
.nv-input-group           Joined input + addon
.nv-input-addon           Prefix/suffix (muted bg)
.nv-toggle                Switch toggle (checkbox + slider)
```

### Table
```
.nv-table                 Full width, sm font, styled th/td
.nv-table-striped         Alternating row bg
.nv-table-hover           Row hover bg
.nv-table-compact         Tighter padding
```

### Badge
```
.nv-badge                              Base (pill, xs, semibold)
.nv-badge-{primary,success,warning,danger,info,neutral}  Color variants
.nv-badge-solid-primary                Solid bg
.nv-badge-dot                          Dot prefix
.nv-badge-lg                           Larger size
```

### Alert
```
.nv-alert                              Base (padded, rounded, left border)
.nv-alert-{info,success,warning,danger}  Color variants
.nv-alert-title                         Bold title inside alert
```

### Navbar
```
.nv-navbar                 Flex between, padded, border-bottom
.nv-navbar-brand           XL bold display font
.nv-navbar-nav             Flex row with gap
.nv-navbar-link            Muted link, hover bg
.nv-navbar-sticky          Sticky + backdrop blur
```
Active link: `.nv-navbar-link.nv-active` — primary color + primary bg.

### Tabs
```
.nv-tabs                   Flex row, border-bottom
.nv-tab                    Muted text, underline on active
.nv-tab-panel              Content area (hidden when not active)
.nv-tabs-pill              Pill variant (muted bg, rounded)
```
Active: `.nv-tab.nv-active` — primary color + border/bg.

### Modal
```
.nv-modal-overlay          Fixed backdrop (blur, hidden by default)
.nv-modal                  Centered card (max 32rem, scale animation)
.nv-modal-{header,title,body,footer,close}  Sections
.nv-modal-{sm,lg,xl}       Size overrides
```
Show: add `.nv-active` to `.nv-modal-overlay`.

### Drawer
```
.nv-drawer-overlay         Fixed backdrop
.nv-drawer                 Fixed panel (20rem, shadow)
.nv-drawer-{left,right}    Slide direction
.nv-drawer-{header,title,body,footer,close}  Sections
.nv-drawer-{sm,lg,xl}      Size overrides
```
Show: add `.nv-active` to `.nv-drawer-overlay`.

### Dropdown
```
.nv-dropdown               Relative container
.nv-dropdown-menu          Absolute menu (hidden by default)
.nv-dropdown-item          Menu item (hover bg)
.nv-dropdown-divider       Separator line
.nv-dropdown-right         Right-aligned menu
```
Show: add `.nv-active` to `.nv-dropdown`.

### Toast
```
.nv-toast-container        Fixed bottom-right stack
.nv-toast                  Dark bg, slide-in animation
.nv-toast-{success,danger,warning}  Color variants
.nv-toast-exit             Slide-out animation
```

### Other Components

| Component | Classes |
|---|---|
| Tooltip | `.nv-tooltip` + `data-tooltip="text"` (shows on hover) |
| Popover | `.nv-popover` + `.nv-popover-content` + `.nv-active` (positions: default/bottom/left/right) |
| Avatar | `.nv-avatar`, `.nv-avatar-{sm,lg,xl}`, `.nv-avatar-group` |
| Progress | `.nv-progress` + `.nv-progress-bar` (set width%), `.nv-progress-{success,danger,striped,animated,lg}` |
| Spinner | `.nv-spinner`, `.nv-spinner-{sm,lg}` |
| Skeleton | `.nv-skeleton`, `.nv-skeleton-text`, `.nv-skeleton-circle` |
| Breadcrumb | `.nv-breadcrumb` + `.nv-breadcrumb-item` + `.nv-breadcrumb-sep` |
| Pagination | `.nv-pagination` + `.nv-page-item` (`.nv-active`, `.nv-disabled`) |
| Divider | `.nv-divider`, `.nv-divider-text` (with label) |
| Tag | `.nv-tag`, `.nv-tag-remove` |
| Accordion | `.nv-accordion` + `.nv-accordion-item` + `.nv-accordion-trigger` + `.nv-accordion-content` + `.nv-accordion-body` |
| Code | `.nv-code` (inline), `.nv-pre` (block) |
| Prose | `.nv-prose` (rich text container with styled headings, lists, links, blockquotes) |

---

## State Toggle

`.nv-active` toggles visibility/state on: modals, drawers, dropdowns, tabs, navbar links, accordion items, popovers.

---

## Animations

```
.nv-animate-{fade-in,fade-up,fade-down,scale-in,slide-right,slide-left,bounce,pulse}
.nv-delay-{100,200,300,400,500}
```

---

## Responsive Helpers

```
.nv-hide-sm              Hidden below 640px
.nv-hide-md              Hidden 640-767px
.nv-hide-below-lg        Hidden below 1024px
.nv-show-sm-only         Visible only below 768px
.nv-show-below-lg-only   Visible only below 1024px
.nv-no-print             Hidden in print
```
