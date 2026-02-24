# fragment.sh — Region-Based File Fragments

Read, write, or list named `#region` blocks in large single-file apps.

# fragment.sh — Region-Based File Fragments

Read, write, or list named `#region` blocks in large single-file apps.

> **Rule:** Use `fragment.sh` to extract or replace regions instead of loading a 1000-line file into context just to edit 50 lines.

## 1. Marker Convention
Regions are defined using comment blocks that match the file type. Regions cannot nest.

```html
<!-- #region styles -->
...
<!-- #endregion styles -->
```

```javascript
// #region store
...
// #endregion store
```

## 2. Reading a Region
To see what regions exist:
```sh
sh fragment.sh src/app/<slug>.html --list
```

To read a specific region into your context or a temp file:
```sh
sh fragment.sh src/app/<slug>.html store > /tmp/store.js
```

## 3. Writing to a Region
After editing the temp file, replace the region in the source file:
```sh
sh fragment.sh src/app/<slug>.html store /tmp/store.js
```
