# novoid-math

Codified knowledge for math rendering in no∅ — KaTeX integration, TeX notation, MathML visibility.

## KaTeX Setup

### In standalone apps
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
```

### In inline apps (iframes with srcdoc)
Same CDN links, plus **always inline the MathML hiding CSS** as a fallback:
```html
<style>.katex-mathml{position:absolute!important;clip:rect(1px,1px,1px,1px)!important;width:1px!important;height:1px!important;overflow:hidden!important;}</style>
```

The `nex-watch.js` worker injects this CSS automatically into every inline app.

---

## The MathML Visibility Issue

KaTeX renders every formula as two siblings:
- `<span class="katex-html">` — visual rendering (what users see)
- `<span class="katex-mathml">` — MathML annotation (screen readers, invisible)

The MathML span is hidden by KaTeX's CSS. If that CSS fails to load (CDN failure, CORS, iframe sandbox), the MathML renders as visible plain text — appearing as duplicate formulas.

**Fix:** Always inline the hiding CSS above. CDN-only is fragile in iframes.

---

## katex.render() API

```js
katex.render(texString, domElement, {
  displayMode: true,      // block (true) or inline (false)
  throwOnError: false,     // graceful degradation on syntax errors
  trust: false,            // don't trust input (default)
});
```

- Render into an empty container element — KaTeX replaces its contents.
- Use `onMount` or `setTimeout` to ensure DOM element exists before rendering.
- For multiple formulas: query all `[data-tex]` elements and render each.

---

# novoid-math

Codified knowledge for math rendering in no∅ — KaTeX integration, TeX notation, MathML visibility.

## 1. Setup KaTeX
If the app renders math, load the CDN scripts and ALWAYS inline the MathML hiding CSS to prevent accessibility-layer duplication bugs.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>

<!-- Critical: Always inline this fallback to hide duplicate screen-reader text -->
<style>.katex-mathml{position:absolute!important;clip:rect(1px,1px,1px,1px)!important;width:1px!important;height:1px!important;overflow:hidden!important;}</style>
```

## 2. Rendering Mathematical Strings
Use the `katex.render()` API targeting a DOM node.

```js
// The target container should be empty. KaTeX replaces its contents.
const container = document.getElementById('math-container');

katex.render("E = mc^2", container, {
  displayMode: true,       // Block (true) or inline (false)
  throwOnError: false,     // Graceful degradation on syntax errors
});
```
*Note: Use `setTimeout` or `onMount` in components to ensure the container exists before rendering.*

## 3. TeX Standard Syntax
- **Display math:** `$$F = ma$$` — centered, block-level
- **Inline math:** `$E = mc^2$` — within text flow
- Use standard commands: `\frac{a}{b}`, `\sqrt{x}`, `\sum_{i=1}^{n}`, `\alpha`
