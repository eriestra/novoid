# novoid-motion

Codified knowledge for Motion (motion.dev) animations in no∅ — animate, scroll, stagger, timeline, inView.

## Setup

### CDN (in any novoid app)
```html
<script src="https://cdn.jsdelivr.net/npm/motion@11/dist/motion.js"></script>
<script>
  const { animate, scroll, stagger, timeline, inView, spring } = Motion;
</script>
```

### ES Module
```html
<script type="module">
  import { animate, scroll, stagger, timeline, inView, spring } from "https://cdn.jsdelivr.net/npm/motion@11/+esm";
</script>
```

### Mini (2.3kb — animate only)
```html
<script type="module">
  import { animate } from "https://cdn.jsdelivr.net/npm/motion@11/mini/+esm";
</script>
```

Mini supports only WAAPI-native properties. No independent transforms (`x`, `y`), no springs, no CSS variables, no timeline. Use full version unless size is critical.

---

## animate()

```js
animate(target, keyframes, options?) → controls
```

**Target:** CSS selector, Element, Element[], NodeList.

```js
animate('.nv-card', { opacity: [0, 1], y: [20, 0] })
animate(el, { scale: 1.2 }, { duration: 0.3 })
```

### Keyframes

Single value (animate to):
```js
animate(el, { opacity: 0, x: 100 })
```

Array (sequence through values):
```js
animate(el, { opacity: [0, 1, 0] })
```

`null` first value (from current):
```js
animate(el, { opacity: [null, 1] })
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `duration` | number | 0.3 | Seconds (not ms) |
| `delay` | number | 0 | Seconds before start |
| `ease` | string/array/fn | `"easeOut"` | Easing function |
| `repeat` | number | 0 | Repeat count (`Infinity` for loop) |
| `repeatType` | `"loop"` / `"mirror"` / `"reverse"` | `"loop"` | Repeat behavior |
| `type` | `"keyframes"` / `"spring"` | `"keyframes"` | Animation engine |
| `onComplete` | fn | — | Fires when done |

### Controls

```js
const anim = animate(el, { opacity: 0 })
anim.pause()
anim.play()
anim.stop()        // commits final styles to element.style
anim.cancel()      // reverts to initial state
anim.time = 0.5    // seek
anim.speed = 2     // playback rate
await anim         // promise — resolves on completion
```

### Independent transforms

Full version only. These map to CSS transforms:
```js
animate(el, { x: 100, y: 50, rotate: 45, scale: 1.2, skewX: 10 })
```

Mini must use raw transform strings:
```js
animate(el, { transform: 'translateX(100px) rotate(45deg)' })
```

---

## scroll()

Link animation progress to scroll position. Uses ScrollTimeline API where supported (hardware-accelerated).

### Animation-linked
```js
const anim = animate('.hero-title', { opacity: [1, 0], scale: [1, 0.95] }, { ease: 'linear' })
scroll(anim)
```

Always use `ease: 'linear'` — scroll position maps directly to progress.

### Callback
```js
scroll((progress) => {
  // progress: 0 to 1
  el.style.opacity = 1 - progress
})
```

### Options

| Option | Default | Description |
|---|---|---|
| `target` | container | Element whose position to track |
| `container` | window | Scrollable container |
| `axis` | `"y"` | `"x"` or `"y"` |
| `offset` | `["start end", "end start"]` | When keyframes trigger |

### Offset syntax

`"<target-edge> <container-edge>"` — order matters.

```js
scroll(anim, { target: el, offset: ['start end', 'end start'] })   // as element traverses viewport
scroll(anim, { target: el, offset: ['start center', 'end center'] }) // centered trigger
```

Edges: `"start"`, `"center"`, `"end"`, pixels (`"100px"`), viewport units (`"0vh"`).

### Cleanup
```js
const stop = scroll(anim)
stop()
```

---

## stagger()

Distribute delay across multiple elements.

```js
animate('li', { opacity: [0, 1], y: [20, 0] }, { delay: stagger(0.1) })
// li[0]: 0s, li[1]: 0.1s, li[2]: 0.2s ...
```

### Options
```js
stagger(0.1, { from: 'center' })   // radiate from center
stagger(0.1, { from: 'last' })     // reverse order
stagger(0.1, { from: 2 })          // from index 2
stagger(0.1, { startDelay: 0.3 })  // wait before first
stagger(0.1, { ease: 'easeIn' })   // redistribute through curve
```

Only meaningful when targeting multiple elements.

---

## timeline()

Sequence multiple animations with precise timing.

```js
timeline([
  ['h1',     { opacity: [0, 1], y: [20, 0] }, { duration: 0.5 }],
  ['p',      { opacity: [0, 1] },              { at: '<+0.2' }],
  ['button', { scale: [0, 1] },                { type: 'spring', at: '+0.1' }],
])
```

### `at` — timing control

| Value | Meaning |
|---|---|
| (omitted) | After previous ends |
| `"<"` | Same time as previous starts |
| `"+0.5"` | 0.5s after previous ends |
| `"-0.2"` | 0.2s before previous ends |
| `"<+0.5"` | 0.5s after previous starts |
| number | Absolute time from timeline start |

Returns `AnimationPlaybackControls` — fully controllable.

Timeline is immutable after creation.

---

## inView()

Intersection Observer wrapper. Fires when element enters viewport.

```js
inView('.nv-card', (element) => {
  animate(element, { opacity: [0, 1], y: [20, 0] })
})
```

### With exit callback
```js
inView('.nv-card', (element) => {
  animate(element, { opacity: 1 })
  return () => animate(element, { opacity: 0 })  // on exit
})
```

### Options

| Option | Default | Description |
|---|---|---|
| `root` | viewport | Custom scroll container |
| `margin` | `"0px"` | Expand/contract detection area |
| `amount` | `"some"` | `"some"`, `"all"`, or number 0–1 |

### One-shot
```js
const stop = inView('.nv-card', (el) => {
  animate(el, { opacity: 1 })
  stop()
})
```

### Cleanup
```js
const stop = inView('.nv-card', handler)
stop()  // disconnect observer
```

---

## spring()

Spring physics easing. Duration-based or physics-based.

### As easing option
```js
animate(el, { y: 100 }, { type: 'spring', bounce: 0.3, duration: 0.8 })
```

### Physics-based
```js
animate(el, { y: 100 }, { type: 'spring', stiffness: 300, damping: 20, mass: 1 })
```

| Param | Default | Description |
|---|---|---|
| `stiffness` | 1 | Higher = faster, snappier |
| `damping` | 10 | Resistance; 0 = infinite oscillation |
| `mass` | 1 | Higher = more lethargic |
| `bounce` | 0.25 | 0–1, duration-based mode only |

Do not use springs with `scroll()` — scroll maps position directly, springs add conflicting physics.

---

## Easing

### Named
`"linear"`, `"easeIn"`, `"easeOut"`, `"easeInOut"`, `"circIn"`, `"circOut"`, `"circInOut"`, `"backIn"`, `"backOut"`, `"backInOut"`, `"anticipate"`

### Cubic bezier
```js
ease: [0.17, 0.67, 0.83, 0.67]
```

### Per-keyframe
```js
animate(el, { x: [0, 100, 50] }, { ease: ['easeIn', 'easeOut'] })
```

### Custom function
```js
ease: (t) => t * t
```

---

## Integration with novoid signals

Trigger animations reactively via `effect()`:

```js
const { signal, effect } = Novoid;
const visible = signal(false);

effect(() => {
  if (visible()) {
    animate('.panel', { opacity: [0, 1], y: [20, 0] }, { duration: 0.3 });
  } else {
    animate('.panel', { opacity: 0, y: 20 }, { duration: 0.2 });
  }
});
```

### Scroll-triggered entrance (common pattern)
```js
// After mount
inView('.nv-card', (el) => {
  animate(el, { opacity: [0, 1], y: [30, 0] }, { delay: stagger(0.08) });
});
```

### Route transition
```js
effect(() => {
  const route = currentRoute();
  animate('#app > *', { opacity: [0, 1] }, { duration: 0.2 });
});
```

---

## Gotchas

- **Seconds, not milliseconds.** `duration: 0.5` = 500ms.
- **CSS variables** need `@property` registration for cross-browser animation. Without it, they snap instantly.
- **`fill: "forwards"` avoided.** Motion commits styles to `element.style` via `.stop()`. Don't rely on WAAPI fill.
- **Mini has no independent transforms.** Use `transform: "..."` strings.
- **`scroll()` offset order** is `"target-edge container-edge"`. Swapping them is a common mistake.
- **Springs + scroll don't mix.** Use `ease: "linear"` with scroll-linked animations.
- **`stagger()` on single element** is just a plain delay number — no effect.
