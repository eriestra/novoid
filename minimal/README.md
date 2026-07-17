# no∅ minimal tier

The smaller-footprint no∅: a single self-contained HTML file, **zero build, zero
CDN, zero framework fetch** — that is still testable with the standard `.test.json`
harness. This is the "default tier" proposed in the footprint review: novoidmicro's
inline core kept observer-compatible so the testability story survives.

## What's here

| File | Role |
|---|---|
| `nv-core.js` | The inline reactive core (~120 lines, ~2.5 KB min). Copy into a `<script>`. |
| `nv-min.css` | Minimal design tokens + essentials (~2 KB), light & dark. |
| `counter.html` | **Fully self-contained** single file (inline core + inline CSS). |
| `todos.html` | Multi-local-file variant (`<script src="nv-core.js">` + `<link nv-min.css>`). |
| `*.test.json` | Behavioral specs — run with `test-runner/novoid-test.mjs`. |
| `shake-css.mjs` | Emit a per-app CSS subset from the full system. |
| `sync-skill.mjs` | Embed `nv-core.js`/`nv-min.css` into the skill docs (source of truth). |

## The core surface

Six primitives plus a store — the whole API an agent must know:

```js
const [get, set] = Novoid.signal(0, 'count');   // reactive value; get.peek(), named
Novoid.computed(() => get() * 2);                // derived
Novoid.effect(() => { ... });                    // reaction (auto-cleans stale deps)
Novoid.h(tag, attrs, ...children);               // element; fn children/attrs are reactive
Novoid.mount('#app', () => h(...));              // attach to DOM
Novoid.createStore(state, actions);              // the testable unit ↓
```

`createStore` is the key: each action becomes an **MCP tool and a test verb** at
once. It exposes exactly what the observer reads (`store.get.peek`,
`store.actions.<name>`), so minimal-tier apps need no special harness:

```js
const store = Novoid.createStore({ count: 0 }, {
  increment: (s) => ({ count: s.count + 1 }),   // action(state, ...args) → partial (merged)
});
store.actions.increment();     // in the app
// { "action": "call", "tool": "increment", "then": { "read": "count", "assert": { "eq": 1 } } }
```

## Authoring a minimal-tier app

1. Copy `nv-core.js` into a `<script>` (or link it locally) and `nv-min.css` into
   `<style>` (or link it). One file, or three local files — no bundler either way.
2. `createStore` for state + actions; `mount` + `h` for UI. Keep the **core in its
   own `<script>`, separate from the app `<script>`** so the test harness can
   observe it.
3. Write a `<slug>.test.json` (read / call / push over the store).
4. Test: `node ../test-runner/novoid-test.mjs --test <slug>.test.json <slug>.html --peek`

## Verified

Both examples pass the same runner used for mainline apps:

```
counter.html  →  5/5 passed   (self-contained, inline core)
todos.html    →  8/8 passed   (external-local core, eq_path assertions)
```

## Footprint

| | Bytes |
|---|---|
| `counter.html` self-contained (raw) | ~6.3 KB |
| `counter.html` **gzipped** | **~2.4 KB** |
| mainline full render app (minified) | ~89 KB |

A ~37× reduction, in one file that opens directly in a browser with no server.

## Tree-shaking the CSS

`shake-css.mjs` keeps design tokens + only the rules whose selectors reference an
`nv-` class present in the app source:

```sh
node shake-css.mjs --stats src/app/*.html    # corpus: 187/436 used → 43% smaller
node shake-css.mjs counter.html > counter.css # per-app subset
```

Caveat: static shaking sees classes written in the source. Imperative `h()` apps
write `nv-` classes directly, so they shake accurately. **Render apps apply classes
at runtime inside `render.js`**, so a static shake undercounts them — those need the
fuller sheet or a render-aware pass. This is another reason the minimal tier favors
direct `h()` over the heavy declarative renderer for the default path.

## Distribution — the skill is the package

The whole minimal runtime is ~9.7 KB of text, so it ships **inside the skill**, not
via npm/CDN/clone. `minimal/nv-core.js` + `minimal/nv-min.css` are the single source
of truth; `sync-skill.mjs` embeds them verbatim into the skill docs between
`<!-- embed:… -->` markers:

```sh
node minimal/sync-skill.mjs          # re-embed after editing the source
node minimal/sync-skill.mjs --check  # verify in sync (exit 1 on drift; run by build.sh)
```

Embed targets: `skills/novoid-minimal.md` (repo skill, in the skills index) and
`SKILL.md` (repo-root Claude Code manifest — self-contained; copy to
`~/.claude/skills/novoid/SKILL.md` to install). An agent that has the skill has the
framework: it reads the embedded block and inlines it — zero install, zero runtime
dependency. Editing the embedded block by hand is a mistake; edit the source and sync.

## Not included (by design)

The declarative renderer (`render.js`), the 41 KB component sheet, Convex client,
router/auth/toast plugins. Add them back only when an app needs them — they are the
opt-in "full tier", not the entry tax.
