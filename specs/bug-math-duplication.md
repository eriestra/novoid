# Bug Report: Duplicated Math Rendering in Nex Chat

**Component:** `src/app/nex.html` — `renderMarkdown()` + `renderMath()`
**Severity:** Medium (cosmetic, affects readability)
**Status:** Open

## Summary

When Nex posts messages containing `$$...$$` (display math) or `$...$` (inline math), each formula renders **twice** — once as a properly rendered KaTeX formula, and once as plain Unicode text below it.

## Steps to Reproduce

1. Open Nex chat at `/app/nex`
2. Ask Nex to display any math formula (e.g. "Show me Maxwell's equations")
3. Observe each equation appears twice: KaTeX-rendered + plain text

## Expected Behavior

Each formula appears once, rendered by KaTeX.

## Actual Behavior

Each formula appears twice:
- **Line 1:** KaTeX-rendered (proper fractions, symbols, formatting)
- **Line 2:** Unicode/plain text version (e.g. `∇ × B = μ₀J + μ₀ε₀∂t∂E`)

## Root Cause Analysis

Two contributing factors have been identified:

### 1. Response content contains both TeX and Unicode versions

When Claude generates math responses, the output sometimes includes **both** `$$\nabla \cdot \mathbf{E} = ...$$` (TeX notation) AND a Unicode fallback like `∇ · E = ρ/ε₀` on a separate line. The `renderMarkdown` function correctly converts the `$$...$$` block to a KaTeX `<span>`, but the Unicode line passes through as a regular `<p>` paragraph.

This is the **primary cause** — the stored message content in the Nex messages table literally contains both representations.

### 2. Paragraph wrapper regex doesn't exclude `<span>` tags

In `renderMarkdown()` at line ~648:

```js
.replace(/^(?!<[hupoblt]|<li|<hr|<bl|<ta)(.+)$/gm, '<p>$1</p>')
```

The negative lookahead `<[hupoblt]` does **not** include `s` (for `<span>`). This means `<span class="nex-math-block" ...></span>` gets wrapped in `<p>...</p>`. While this doesn't cause duplication by itself (KaTeX still renders into the span), it could cause unexpected layout issues with block-level math inside inline `<p>` elements.

## Proposed Fix

### Fix 1 — Filter Unicode duplicates from stored responses (recommended)

In `nex-watch.js` or the message storage path, strip lines that are pure Unicode math symbols when an adjacent line contains `$$...$$` TeX notation. Alternatively, instruct the Claude agent prompt to only output TeX notation without Unicode fallbacks.

### Fix 2 — Add `<s` to paragraph exclusion regex

```js
// Before
.replace(/^(?!<[hupoblt]|<li|<hr|<bl|<ta)(.+)$/gm, '<p>$1</p>')

// After
.replace(/^(?!<[hupoblts]|<li|<hr|<bl|<ta|<sp)(.+)$/gm, '<p>$1</p>')
```

This prevents math `<span>` elements from being wrapped in `<p>` tags.

### Fix 3 — Post-process renderMarkdown output

After `renderMarkdown()` returns, scan for adjacent lines where one is a `nex-math-block` span and the next is a `<p>` containing only math-like Unicode characters (∇, ∂, ε, μ, ×, ·, etc.) and remove the duplicate `<p>`.

## Files Involved

| File | Lines | Role |
|---|---|---|
| `src/app/nex.html` | 589–648 | `renderMarkdown()` — converts `$$` to `<span>`, wraps paragraphs |
| `src/app/nex.html` | 575–585 | `renderMath()` — calls `katex.render()` on data-tex spans |
| `src/app/nex.html` | 854–861 | Message rendering — calls renderMarkdown then renderMath |
| `nex-watch.js` | — | Stores Claude response as message content |
