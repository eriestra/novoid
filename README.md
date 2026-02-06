# no∅ (novoid)

A complete frontend platform in 15KB. CSS component library + reactive JS framework. Zero build tools. Optimized for AI-driven development.

```sh
git clone https://github.com/user/novoid
cd novoid
claude
> Build me a dashboard with a sidebar, user table, and dark mode toggle
```

Claude reads `CLAUDE.md` and `skills.md` — it already knows every component, signal, and pattern. Just describe what you want.

---

## Why no∅

Traditional frameworks require you to learn the framework, pick an ecosystem, configure a build pipeline, and write the code yourself. no∅ flips this: **the AI agent already knows the entire platform from a single spec file and generates production code in one shot.**

No transpilers. No bundlers. No node_modules. No configuration. No learning curve — because you're not the one writing the code.

---

## Size comparison (min + gzip)

| Framework | Core | + Router | + Forms | + Store | + UI Kit | **Total** |
|---|---|---|---|---|---|---|
| **no∅** | **15 KB** | **included** | **included** | **included** | **included** | **15 KB** |
| Svelte 5 | ~3 KB | +5 KB | +8 KB | +2 KB | +40 KB+ | ~58 KB |
| SolidJS | ~6 KB | +5 KB | +10 KB | +3 KB | +40 KB+ | ~64 KB |
| Preact | ~4 KB | +3 KB | +10 KB | +3 KB | +40 KB+ | ~60 KB |
| Vue 3 | ~34 KB | +10 KB | +12 KB | +2 KB | +50 KB+ | ~108 KB |
| React 19 | ~55 KB | +12 KB | +15 KB | +12 KB | +60 KB+ | **~154 KB** |
| Angular | ~130 KB | included | +15 KB | included | +80 KB+ | **~225 KB** |

no∅ ships everything — signals, router, forms, store, portals, suspense, toasts, and a full CSS component library — in what React ships for just the virtual DOM.

## Build time

| Framework | Cold start | Rebuild |
|---|---|---|
| **no∅** | **23ms** (`sh build.sh`) | **23ms** |
| Svelte | ~2-4s | ~200ms |
| Vite + React | ~3-8s | ~100-300ms |
| Webpack + React | ~15-45s | ~1-5s |
| Angular | ~20-60s | ~2-8s |

## Setup time (clone to first render)

| Framework | Steps | Time |
|---|---|---|
| **no∅** | `clone` &#8594; `claude` &#8594; describe what you want | **seconds** |
| Svelte | create-svelte &#8594; npm install &#8594; configure &#8594; write code | 5-10 min |
| React | create-react-app &#8594; npm install &#8594; pick router, state, forms, UI &#8594; configure &#8594; write code | 15-30 min |
| Angular | ng new &#8594; wait &#8594; configure modules &#8594; write code | 10-20 min |

## Dependency risk

| | no∅ | React | Vue | Svelte |
|---|---|---|---|---|
| **node_modules** | 0 | 200-800 MB | 100-400 MB | 50-200 MB |
| **Dependencies** | 0 | 50-200+ packages | 30-100+ packages | 20-80+ packages |
| **Supply chain surface** | none | every transitive dep | every transitive dep | every transitive dep |
| **Breaking updates** | never (you own the source) | frequent | occasional | occasional |

---

## What's included

**no∅ CSS** — 28 component types, all prefixed `nv-`:

Buttons, cards, forms, inputs, selects, toggles, checkboxes, tables, badges, alerts, navbar, tabs, modals, dropdowns, tooltips, avatars, progress bars, spinners, skeletons, breadcrumbs, pagination, dividers, tags, toasts, accordions, code blocks, prose. Dark mode built in.

**Novoid.js** — every React pattern, zero virtual DOM:

| API | React equivalent |
|---|---|
| `signal(initial)` | useState |
| `computed(fn)` | useMemo |
| `effect(fn)` | useEffect |
| `createStore(state, actions)` | Redux / Zustand |
| `createRouter(routes)` | React Router |
| `createForm(schema)` | React Hook Form |
| `h(tag, attrs, ...children)` | createElement / JSX |
| `list(container, items, key, render)` | .map() with keys |
| `portal(target, content)` | createPortal |
| `errorBoundary(render, fallback)` | Error Boundary |
| `suspense(asyncFn, fallback)` | Suspense / lazy |
| `useAsync(fn)` | React Query / SWR |
| `createContext(default)` | useContext |
| `mount(selector, appFn)` | createRoot().render() |
| `bus.on/emit/off` | Custom events |
| `toast.success/danger/info/warning` | Toast library |

**Convex integration** (optional) — `createClient`, `useQuery`, `useMutation`, `useAction`, `useAuth`.

---

## Project structure

```
novoid/
├── CLAUDE.md          # agent instructions (read first)
├── skills.md          # full API spec (agent reads this)
├── index.html         # demo / showcase
├── src/               # source (readable, agent edits these)
│   ├── novoid.css     # CSS component library (52 KB)
│   ├── novoid.js      # reactive framework (28 KB)
│   └── app/           # your app goes here
├── dist/              # production (minified, never edit)
│   ├── novoid.min.css # 9.5 KB gzipped
│   └── novoid.min.js  # 5.7 KB gzipped
└── build.sh           # instant minification (23ms)
```

## Get started

```sh
git clone https://github.com/user/novoid
cd novoid
claude
```

That's it. No npm install. No configuration. Just tell Claude what to build.

---

## Fair comparison

Svelte and SolidJS are faster at raw rendering — they compile away the framework. no∅ doesn't try to beat them at benchmarks.

What no∅ does differently:

- **15KB total payload** with everything included — others need an ecosystem of packages to match
- **Zero dependency risk** — no node_modules, no supply chain attacks, no breaking updates
- **23ms builds** — sed, not webpack
- **Optimized for AI agents** — the entire platform is described in a single spec file that Claude masters instantly

no∅ is a complete platform in 15KB that an AI agent can generate production code from in one shot. That's a different category.
