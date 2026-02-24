# novoid-motion

# novoid-motion

Codified knowledge for Motion (motion.dev) animations in no∅.

> **Rule:** Use `Novoid.effect` to trigger animations reactively based on signal changes.

## 1. Setup
Import the script via CDN in your no∅ app:
```html
<script src="https://cdn.jsdelivr.net/npm/motion@11/dist/motion.js"></script>
<script>
  const { animate, scroll, stagger, timeline, inView, spring } = Motion;
</script>
```

## 2. Basic Animations
Animate elements using CSS selectors or DOM nodes.
```js
// Animate a single element (opacity and Y-axis translation)
animate('.nv-card', { opacity: [0, 1], y: [20, 0] }, { duration: 0.3 });
```

## 3. Stagger Animations (Lists / Grids)
Use stagger to add a delay between multiple elements.
```js
animate('.list-item', { opacity: [0, 1], y: [20, 0] }, { delay: stagger(0.1) });
```

## 4. Scroll-Triggered (Entrance)
Trigger an animation when an element scrolls into view.
```js
inView('.nv-card', (el) => {
  animate(el, { opacity: [0, 1], y: [30, 0] }, { delay: stagger(0.08) });
});
```

## 5. Reactive Animations (no∅ integration)
Hook animations to state changes using `Novoid.effect`.
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

## Gotchas
- **Time is in Seconds:** `duration: 0.5` means 500ms.
- **Independent transforms:** `x`, `y`, `rotate`, `scale` map directly to CSS transforms.
