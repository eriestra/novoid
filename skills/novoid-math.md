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

## TeX Notation

- **Display math:** `$$F = ma$$` — centered, block-level
- **Inline math:** `$E = mc^2$` — within text flow
- One formula = one representation. TeX only, no Unicode/ASCII fallback alongside.

### Common syntax
| Syntax | Output |
|---|---|
| `\frac{a}{b}` | Fraction |
| `x^2`, `x_1` | Superscript, subscript |
| `\alpha`, `\beta`, `\nabla` | Greek letters |
| `\sqrt{x}` | Square root |
| `\sum_{i=1}^{n}` | Summation |
| `\int_0^\infty` | Integral |
| `\,` | Thin space |
| `\quad` | Wide space |
| `\\` | Newline (in aligned environments) |

---

## In Markdown Responses (nex.html)

The `renderMarkdown()` function converts `$$...$$` and `$...$` to `<span>` elements with `data-tex` attributes. Then `renderMath()` calls `katex.render()` on each span.

```
$$\nabla \cdot E = \frac{\rho}{\epsilon_0}$$
  → <span class="nex-math-block" data-tex="..."></span>
  → katex.render(tex, span, { displayMode: true })
```

The parent page must have the `.katex-mathml` hiding CSS inline in its `<style>` block.

---

## Conventions

1. Always inline `.katex-mathml` hiding CSS — CDN-only is fragile in iframes.
2. One formula, one representation: TeX only.
3. Give formula containers a stable `id` to survive reactive re-renders.
4. Use `throwOnError: false` for graceful degradation.
5. KaTeX version: `0.16.11`.
