# no∅ (novoid)

> The agent-native frontend framework. Describe it, it's live.

CSS component library + reactive JS framework served from Convex. One spec file, one HTML file, instant deployment.

```
Human: "Build me a kanban board with drag-and-drop and dark mode"

Agent: reads skills/ (codified knowledge, always in context)
       generates src/app/kanban.html
       runs sh publish.sh kanban src/app/kanban.html
       → live URL, globally accessible, verified
```

---

## Why

| | React/Next.js | no∅ |
|---|---|---|
| **Files to generate** | 10-50+ | 1 |
| **Config files** | 3-8 | 0 |
| **Build step** | Required (3-45s) | None |
| **Deploy** | CI/CD (30-120s) | `sh publish.sh` (2s) |
| **API surface** | 500+ symbols | ~145 symbols |
| **Error surface** | Import resolution, SSR hydration, types | Virtually none |

---

## How it works

```
GitHub Pages                        Convex Cloud
────────────                        ────────────
index.html (redirect)
  │ 302 → convex.site/platform ──→  HTTP route serves landing page

                                    pages table:  { slug, html }
                                    assets table: { novoid CSS/JS }
```

The entire platform — including itself — lives in a Convex database. GitHub hosts only a redirect. No CI/CD. No build server. Write HTML to a database and it's live.

---

## Quick start

### Prerequisites

- Node.js
- A [Convex](https://convex.dev) account (free tier)

### Setup

```sh
git clone https://github.com/eriestra/novoid
cd novoid
npm install
npx convex dev                # creates your Convex project
```

In a second terminal:

```sh
# Set the publish secret
npx convex run seed:seedSecret '{"name":"PUBLISH_SECRET","value":"pick-a-secret"}'

# Seed framework assets + platform page
sh seed.sh <your-cloud-url> pick-a-secret
```

Create `.env.local` (see `.env.local.example`):

```
CONVEX_URL=https://<deployment>.convex.cloud
CONVEX_SITE_URL=https://<deployment>.convex.site
PUBLISH_SECRET=pick-a-secret
```

Visit your platform at `https://<deployment>.convex.site/platform`.

### Verification pipeline (optional but recommended)

The full publish pipeline includes Nous (static analysis) and Qed (headless execution). Without these, `publish.sh` still works but skips verification phases.

```sh
# Build framework assets (creates dist/ and src/js, src/css symlinks)
sh build.sh

# Nous — static verification (TypeScript)
cd nous && npm install && cd ..

# Qed — headless verifier + MCP test harness (Rust, requires cargo)
cd browser && cargo build && cd ..
```

After this, `publish.sh` runs all three verification phases automatically.

### Build and publish

```sh
# Generate your app as src/app/<slug>.html
# Generate test spec as src/app/<slug>.test.json (always — runs automatically on publish)
# Then publish (runs verification + E2E tests automatically):
sh publish.sh <slug> src/app/<slug>.html

# Look up URLs anytime:
sh url.sh <slug>
```

### For AI agents

1. Check `.env.local` — if it exists, the platform is set up
2. Read `AGENTS.md` (architecture + quick reference) or `skills/` (codified knowledge)
3. Read `CLAUDE.md` (operating manual for Claude Code)
4. Generate HTML in `src/app/<slug>.html`
5. Generate test spec in `src/app/<slug>.test.json`
6. Publish with `sh publish.sh` (runs tests automatically)

---

## What's in the box

### Novoid.js — reactive core + plugins

Fine-grained reactivity, no virtual DOM. Signal getters are function calls: `count()`.

| API | Purpose |
|---|---|
| `signal(initial, name?)` | Reactive state |
| `computed(fn)` | Derived values |
| `effect(fn)` | Side effects |
| `h(tag, attrs, ...children)` | DOM creation |
| `list(container, items, keyFn, renderFn)` | Keyed lists |
| `when(cond, thenFn, elseFn?)` | Conditional rendering |
| `match(value, cases)` | Switch rendering |
| `mount(selector, appFn)` | App entry point |
| `createStore(state, actions?)` | Global state (partial returns auto-merged) |
| `createForm(schema)` | Form handling |
| `component(name, renderFn)` | Named components |
| `portal(target, content)` | Render elsewhere |
| `errorBoundary(renderFn, fallbackFn)` | Error catching |
| `suspense(asyncFn, fallback)` | Async loading |
| `useAsync(asyncFn)` | Async data |
| `createContext(default)` | Scoped state |
| `batch(fn)` | Batched updates |
| `bus` | Event bus |
| `transition(el, opts)` | Animations |
| `template(html, data)` | Template strings |

**Plugins** (self-registering, load only what you need):

- **render.js** — declarative UI: describe sections (metrics, tables, cards, forms, charts), renderer owns all DOM/CSS/layout. Zero `h()` calls.
- **router.js** — hash-based routing with guards and dynamic params
- **convex.js** — `createClient`, `useQuery`, `useMutation`, `useAction`, `useAI`
- **auth.js** — `useNovoidAuth`, `useOrg` (PBKDF2 passwords, 7-day sessions, org management)
- **toast.js** — `toast.info/success/danger/warning`

### no∅ CSS — 25 component groups

All `nv-` prefixed, dark mode built in (`[data-theme="dark"]` / `.nv-dark`):

Buttons, cards, forms, inputs, selects, toggles, checkboxes, tables, badges, alerts, navbar, tabs, modals, drawers, dropdowns, tooltips, popovers, avatars, progress bars, spinners, skeletons, breadcrumbs, pagination, dividers, tags, toasts, accordions, code blocks, prose.

Plus ~200 utility classes for typography, layout, spacing, colors, borders, shadows, transitions, animations, and responsive helpers.

### CSS/JS imports for published pages

```html
<link rel="stylesheet" href="../css/core.min.css">
<link rel="stylesheet" href="../css/components.min.css">
<script src="../js/core.min.js"></script>
<script src="../js/router.min.js"></script>
<script src="../js/convex.min.js"></script>
<script src="../js/auth.min.js"></script>
<script src="../js/toast.min.js"></script>
<script src="../js/render.min.js"></script>  <!-- declarative UI -->
```

---

## Convex backend

| File | Purpose |
|---|---|
| `schema.ts` | Tables: pages, assets, keys, users, sessions, organizations, orgMemberships, orgInvitations, plans, fragments, errors, notes, jobs |
| `http.ts` | HTTP routes: `/app/:slug`, `/raw/:slug`, `/platform`, `/css/:name`, `/js/:name`, `/errors/:slug`, `/publish/:slug`, `/collab/:slug`, `/llms.txt`, `/robots.txt` |
| `pages.ts` | Page CRUD (publish, remove, list, get) — auth-gated writes |
| `assets.ts` | Asset storage (set, get) — auth-gated writes |
| `auth.ts` | User auth (register, login, logout, me, changePassword) — PBKDF2 |
| `orgs.ts` | Organization management (create, invite, members, roles) |
| `collab.ts` | Multi-agent coordination (plans, fragments, compose) |
| `errors.ts` | Runtime error tracking (log, recent, clear) — rate-limited |
| `jobs.ts` | Job queue (create, pending, claim, update) |
| `notes.ts` | User notes CRUD |
| `keys.ts` | Internal secret management (never exposed to clients) |
| `seed.ts` | Internal mutations for initial setup |
| `lib.ts` | Shared utilities (password hashing, token generation, auth helpers) |
| `crons.ts` | Hourly session cleanup |

### Security model

| Operation | Auth | How |
|---|---|---|
| Read pages, CSS, JS | Public | HTTP GET, no auth |
| Publish/remove pages | Secret required | `secret` arg checked against `keys` table |
| Update assets | Secret required | `secret` arg checked against `keys` table |
| User auth | Public | PBKDF2 (100K iterations), SHA-256 session tokens |
| Org management | Session required | Role-based (owner > admin > member) |
| Set/rotate secret | CLI only | `npx convex run seed:seedSecret` (internal mutation) |

---

## Verification

Every publish runs a full verification pipeline — pre-flight and post-publish:

```
sh publish.sh <slug> src/app/<slug>.html

┌─ verify ───────────────────────────────────────────┐
│ nous    ✓ SOUND  47 nodes, 6 signals               │
│ browser ✓ clean  1 stores, 5 actions               │
│ ✓ 104/104 passed (8ms)                              │
├─────────────────────────────────────────────────────┤
│ ✓ verified                                          │
└─────────────────────────────────────────────────────┘

┌─ post-publish ─────────────────────────────────────────┐
│ live     ✓ https://...convex.site/app/<slug> (200)     │
│ mcp      ✓ 3 tools, 5 resources                       │
│ sentinel ✓ no runtime errors                           │
├────────────────────────────────────────────────────────┤
│ ✓ e2e passed                                           │
└────────────────────────────────────────────────────────┘
```

Three verification layers:

- **[Nous](NOUS.md)** (static) — formal verification engine (TypeScript). Proves structural contracts, layout feasibility, reactive dataflow acyclicity, dead signals, taint analysis, state machine reachability, cascade conflicts, accessibility. 87 tests.
- **[Qed](BROWSER.md)** (empirical) — headless app verifier + MCP test harness (Rust/QuickJS). Executes apps in ~200ms, catches JS errors, introspects signals/stores/actions, supports behavioral test specs.
- **Lux** (runtime) — post-publish sentinel. Injected server-side into every published page. Runtime errors flow from browsers back to Convex automatically.

---

## MCP endpoint

Every published app with a browser schema automatically gets an MCP (Model Context Protocol) interface:

```
GET  /mcp/:slug   → JSON manifest (tools, resources, state)
POST /mcp/:slug   → MCP JSON-RPC (Streamable HTTP transport)
```

- **Tools** — Convex mutations/actions and store actions become executable MCP tools
- **Resources** — signals/stores become snapshot resources, Convex queries become live-readable
- **Entities** — array collections get inferred schemas at `novoid://<slug>/entity/<path>`
- **Zero config** — derived from novoid-browser's BrowseSchema at publish time

---

## Multi-agent collaboration

Coordinate multiple agents on the same page using Convex as the distributed coordination layer:

```
Agent 1: claim("header")  → atomic mutex in fragments table
Agent 2: claim("sidebar") → atomic mutex in fragments table
                             ↓
Agent 1: publishFragment(html)
Agent 2: publishFragment(html)
                             ↓
                          compose("dashboard")
                             ↓
                          live at /app/dashboard
```

Atomic claims, 10-minute stale timeout, optimistic concurrency, cross-machine support.

---

## Project structure

```
novoid/
├── CLAUDE.md           # agent operating manual
├── spec.md             # API reference (<300 lines)
├── index.html          # redirect to Convex-hosted landing page
├── src/
│   ├── core.js         # reactive core (~600 lines)
│   ├── core.css        # CSS foundations (variables, reset, utilities)
│   ├── components.css  # CSS components (25 groups)
│   ├── plugins/        # self-registering plugins
│   │   ├── render.js   # declarative UI renderer
│   │   ├── router.js   # hash-based routing
│   │   ├── convex.js   # Convex client + reactive queries
│   │   ├── auth.js     # auth + organizations
│   │   └── toast.js    # toast notifications
│   └── app/            # generated apps (gitignored, published to Convex)
├── dist/               # minified output (run sh build.sh)
├── convex/             # Convex backend
├── nous/               # formal verification engine (TypeScript)
│   ├── src/morphe/     # Pillar I: structure
│   ├── src/thesis/     # Pillar II: presentation
│   ├── src/kinesis/    # Pillar III: behavior
│   └── src/cross/      # cross-pillar analysis
├── browser/            # headless verifier + MCP test harness (Rust/QuickJS)
├── verify.sh           # runs Nous + novoid-browser + test specs
├── publish.sh          # verify + publish + post-publish E2E
├── url.sh              # look up URLs for any slug
├── build.sh            # esbuild minification (23ms)
├── seed.sh             # one-time setup script
└── package.json        # convex dependency only
```

---

## Documentation

| File | Contents |
|---|---|
| `CLAUDE.md` | Agent operating manual — conventions, workflows, skills index |
| `AGENTS.md` | Model-agnostic agent instructions — architecture, quick reference |
| `skills/` | Codified knowledge — 8 skills replacing source file reading |
| `spec.md` | API specification (human reference) |
| `render.md` | Render plugin specification (human reference) |
| `NOUS.md` | Nous verification engine — architecture, three pillars, contracts |
| `BROWSER.md` | Qed headless verifier — CLI, MCP test harness, BrowseSchema |

---

## License

[MIT](LICENSE)
