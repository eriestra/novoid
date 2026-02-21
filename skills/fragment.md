# fragment.sh — Region-Based File Fragments

Read, write, or list named `#region` blocks in large single-file apps.

## Why

Single-file no∅ apps can grow past 1000 lines. Reading the full file to edit 50 lines wastes context. Wrap sections in `#region`/`#endregion` markers and use `fragment.sh` to extract or replace just the region you need.

## Commands

```sh
# List all regions with line numbers
sh fragment.sh src/app/<slug>.html --list

# Read a region to stdout
sh fragment.sh src/app/<slug>.html store

# Read into a file for editing
sh fragment.sh src/app/<slug>.html render > /tmp/render.js

# Replace a region from a file
sh fragment.sh src/app/<slug>.html render /tmp/render.js
```

## Marker Convention

Two comment styles, matching the surrounding context:

```html
<!-- #region styles -->
...
<!-- #endregion styles -->
```

```js
// #region store
...
// #endregion store
```

Region names: lowercase, may contain colons (e.g. `block:flip`, `block:poll`).

## When to Use

- Editing any single-file app with `#region` markers — use fragment.sh instead of reading the full file
- Round-trip workflow: read region, edit, write back
- Any file over ~500 lines that has logical sections
