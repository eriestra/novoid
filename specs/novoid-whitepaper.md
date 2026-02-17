# no∅ (novoid) — Whitepaper

> A frontend platform where describing an application is the same act as deploying it.

**Version 1.0 — February 2026**

---

## 1. Why novoid Exists

The modern frontend stack has become a gauntlet. A developer who wants a working web application must first navigate a maze of build tools, bundlers, transpilers, package managers, CI pipelines, container orchestration, and hosting providers — all before writing a single line of application logic. The gap between "I have an idea" and "someone can use it" has widened into months of infrastructure work.

AI agents face an even worse version of this problem. An LLM can reason about UI, generate HTML, and write business logic. But it cannot run `npm install`, configure Webpack, push to a Git remote, or wait for a CI pipeline. The existing deployment stack was designed for humans sitting at terminals, not for programmatic actors that think in text and operate through tool calls.

novoid exists to collapse that gap to zero.

The thesis is simple: if you can describe an application — its state, its sections, its behavior — that description should *be* the application, live and accessible, in seconds. No build step. No npm in the output. No Git push. No CI. No container. You write an HTML file, run one shell command, and the application is live on a URL with an MCP endpoint, error telemetry, live reload, and a programmatic interface for other agents to interact with it.

novoid is not a framework that happens to be simple. It is a platform designed from first principles around a single constraint: **the path from description to live application must be a single atomic operation.**

---

## 2. What Purpose It Serves

novoid serves three distinct audiences with one unified system:

### For AI Agents
novoid is the deployment target. An agent generates a single HTML file containing state, behavior, and UI declarations. It calls `publish.sh`, which verifies the output (static analysis + headless execution + behavioral tests), writes it to a database, and returns a live URL. The agent never touches npm, Git, Docker, or any infrastructure. Every published app automatically gets an MCP endpoint, making it programmatically readable and controllable by other agents.

### For Developers
novoid is a zero-configuration frontend framework with fine-grained reactivity, a complete CSS component library, and a declarative rendering language. It produces vanilla HTML/CSS/JS with no build tools, no transpilation, and no runtime dependencies beyond two files (~12 KB combined). The reactive core (`signal`, `computed`, `effect`) is familiar to anyone who has used Solid, Preact Signals, or Vue's composition API — but ships as a single `<script>` tag.

### For End Users
novoid applications load instantly (no JavaScript bundle to parse), work offline after first load, and automatically update in real-time when the source changes. Every app gets error telemetry, live reload, content negotiation (HTML for browsers, Markdown for agents), and a custom domain option — all without any configuration from the developer.

---

## 3. Architecture Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                        Agent or Developer                         │
│                                                                   │
│   write src/app/<slug>.html  +  src/app/<slug>.test.json          │
└──────────────────────────────┬────────────────────────────────────┘
                               │
                         sh publish.sh
                               │
              ┌────────────────┼────────────────┐
              │                │                │
         Phase 1          Phase 2          Phase 3
         Nous             novoid-browser   MCP test spec
         (static proof)   (headless exec)  (behavioral E2E)
              │                │                │
              └────────────────┼────────────────┘
                               │
                    Convex mutation: pages:publish
                               │
              ┌────────────────┼────────────────┐
              │                │                │
        /app/:slug       /mcp/:slug       /raw/:slug
        (live page)      (MCP endpoint)   (raw HTML)
```

The system has no CI pipeline, no build server, and no container runtime. Publishing is a database write. The Convex HTTP router serves pages, assets, and MCP endpoints directly from the database. The entire infrastructure is serverless — Convex handles persistence, real-time subscriptions, HTTP routing, and function execution.

---

## 4. The Reactive Core (`src/core.js`)

The core is ~680 lines of vanilla JavaScript exposed as `window.Novoid`. It implements a complete reactive system with no external dependencies.

### 4.1 Signals

The fundamental primitive. A signal holds a value and tracks its subscribers automatically.

```js
const [count, setCount] = Novoid.signal(0, 'count');
count();            // read (triggers tracking)
setCount(5);        // write (notifies subscribers)
setCount(n => n+1); // updater function
count.peek();       // read without tracking
```

Signals are named (`signal(0, 'count')`) so that tooling, debugging, and the MCP schema produce human-readable identifiers instead of `signal_0`. The static analyzer (Nous) warns on unnamed signals.

### 4.2 Computed

Derived values that automatically recompute when their dependencies change:

```js
const double = Novoid.computed(() => count() * 2);
```

Computed values are themselves signals — they can be read reactively and composed.

### 4.3 Effects

Side-effect runners that re-execute when tracked dependencies change:

```js
const dispose = Novoid.effect(() => {
  console.log(count()); // auto-tracks count
  return () => cleanup();
});
```

Effects are the bridge between reactive state and the real world (DOM, network, console). They support optional dependency arrays and return a dispose function.

### 4.4 Batch

Groups multiple state changes into a single notification pass:

```js
Novoid.batch(() => { setA(1); setB(2); }); // one re-render
```

### 4.5 Reactive DOM (`h`)

The `h` function creates real DOM elements with reactive bindings:

```js
Novoid.h('div', { class: 'nv-card' },
  Novoid.h('p', {}, () => count()),  // reactive text
);
```

It supports: reactive `class`, `style`, `show`, `html`, `bind` (two-way), boolean attributes (`disabled`, `checked`, `hidden`, `readonly`, `required`, `selected`, `open`), event handlers (`on*`), and `ref` for DOM references.

Focus preservation is built in — when reactive updates replace DOM nodes, the framework saves and restores the active element, cursor position, and input value.

### 4.6 List, When, Match

Standard rendering patterns for collections, conditionals, and multi-case branching:

```js
Novoid.list(ul, todos, t => t.id, t => Novoid.h('li', {}, t.text));
Novoid.when(() => loggedIn(), thenFn, elseFn);
Novoid.match(tab, { home: () => Home(), settings: () => Settings() });
```

### 4.7 Store (`createStore`)

A higher-level state container for structured applications. Actions receive current state and return **partial state** that is auto-merged:

```js
const store = Novoid.createStore(
  { count: 0, name: 'App' },
  { inc(s) { return { count: s.count + 1 }; } }  // only returns what changed
);
```

Stores are the testability boundary. Store actions become MCP-callable tools and are the targets of E2E test specs. Raw signals with DOM `onclick` handlers are not programmatically testable.

### 4.8 Other Core Primitives

| Primitive | Purpose |
|---|---|
| `ref(init?)` | DOM reference container |
| `createContext(default)` | Scoped dependency injection |
| `component(name, renderFn)` | Named component registration |
| `portal(target, content)` | Render into a different DOM location |
| `errorBoundary(renderFn, fallbackFn)` | Catch rendering errors |
| `suspense(asyncFn, fallback)` | Async loading with placeholder |
| `onMount(fn)` | Post-mount lifecycle hook (via `requestAnimationFrame`) |
| `transition(el, opts)` | CSS enter/leave animations |
| `bus` | Global event bus (`.on`, `.emit`, `.off`) |
| `createForm(schema)` | Form state with validation |
| `useAsync(asyncFn)` | Async data fetching |
| `template(html, data)` | HTML template interpolation |
| `mount(selector, appFn)` | Mount an application to a DOM node |

### 4.9 Introspection

The core exposes `Novoid.__introspect()` for programmatic schema extraction by novoid-browser. This returns the list of registered signals, stores, components, and active effects — enabling the MCP layer to auto-generate tools and resources without any configuration.

---

## 5. The CSS System (`src/core.css`, `src/components.css`)

novoid ships a complete CSS framework with two layers:

### 5.1 Design Tokens (`core.css`)

A system of CSS custom properties covering:

- **Color**: `--nv-primary-{50-900}`, `--nv-gray-{50-900}`, semantic colors (`--nv-success-500`, `--nv-danger-500`, etc.)
- **Typography**: Three font families (DM Sans body, Outfit headings, JetBrains Mono code), size scale from `--nv-text-xs` to `--nv-text-6xl`
- **Spacing**: `--nv-space-{0-24}`
- **Borders**: `--nv-radius-{none-full}`, `--nv-border`, `--nv-border-strong`
- **Shadows**: `--nv-shadow-{xs-2xl}`
- **Z-index**: Semantic layers (`--nv-z-dropdown`, `--nv-z-modal`, `--nv-z-toast`)

Dark mode is activated via `[data-theme="dark"]` or `.nv-dark` and inverts the entire token system.

### 5.2 Component Library (`components.css`)

Pre-built components with the `nv-` prefix:

| Category | Components |
|---|---|
| **Interactive** | Button (`.nv-btn` + 8 variants + 7 sizes), Toggle, Dropdown |
| **Data Display** | Card, Table (striped/hover/compact), Badge, Tag |
| **Feedback** | Alert, Toast, Spinner, Skeleton, Progress |
| **Navigation** | Navbar, Tabs, Breadcrumb, Pagination |
| **Overlay** | Modal, Drawer (left/right), Popover, Tooltip |
| **Form** | Input, Select, Textarea, Checkbox, Radio, Field groups |
| **Layout** | Container, Grid (1-12 columns), Flex, Stack |

Responsive breakpoints are built in: `.nv-{sm,md,lg}-cols-{2-6}`, `.nv-hide-sm`, `.nv-hide-below-lg`.

Animations: `.nv-animate-{fade-in,fade-up,scale-in,slide-right,bounce,pulse}` with delay classes.

---

## 6. Plugins

The core is minimal. Capabilities are added through plugins that extend the `Novoid` global.

### 6.1 Render Plugin (`src/plugins/render.js`)

The render plugin is the declarative UI layer. It replaces imperative `h()` calls with a data-driven vocabulary:

```js
Novoid.render('#app', store, {
  app: { name: 'My App', theme: 'dark', locale: 'es-MX' },
  sections: [
    { metrics: { columns: 4, items: [...] } },
    { table: { title: 'Items', source: '$items', columns: [...] } },
    { cards: { source: '$items', template: { title: '$item.name' } } }
  ]
});
```

The renderer owns all DOM, CSS, layout, transitions, and responsive behavior. Apps using the render plugin contain zero `h()` calls and zero CSS.

**Section vocabulary:** `metrics`, `table`, `cards`, `form`, `chart`, `stat`, `header`, `row`, `list`, `empty`, `divider`, `button`.

**Reactive expressions:** Any value prefixed with `$` is automatically resolved against the store (`$count`), computed values (`$totalSavings`), Convex queries (`$q.bills`), auth state (`$auth.user`), view parameters (`$params.id`), iteration context (`$row.key`, `$item.key`), or inline expressions (`"$price * $qty"`).

**Formatters:** `currency`, `kwh`, `rate`, `percent`, `number`, `date`, `datetime`, `timeAgo`, `bytes`, `duration`, and custom templates.

**Multi-view navigation:** Apps can define named views with hash-based routing, tab/sidebar/bottomBar navigation, and view-level access gates.

**Panels:** Side drawers bound to store state for edit forms and detail views.

### 6.2 Router Plugin (`src/plugins/router.js`)

Hash-based client-side routing:

```js
const { navigate, currentRoute } = Novoid.createRouter([
  { path: '/', component: () => Home() },
  { path: '/user/:id', component: ({ params }) => User(params.id) },
  { path: '*', component: () => NotFound() },
], container);
```

Supports route guards with redirect: `{ guard: () => isAuth(), redirect: '/login' }`.

### 6.3 Convex Plugin (`src/plugins/convex.js`)

Real-time database integration via Convex:

```js
const db = Novoid.createClient(CONVEX_URL);
const { data, loading, error } = Novoid.useQuery(db, 'tasks:list', { orgId });
const addTask = Novoid.useMutation(db, 'tasks:add');
const run = Novoid.useAction(db, 'ai:chat');
const send = Novoid.useAI(db, 'ai:chat'); // AI-specific with history tracking
```

Reactive query arguments: pass a function instead of an object, and the subscription re-evaluates when dependencies change. Skip queries with `'skip'` as args.

### 6.4 Auth Plugin (`src/plugins/auth.js`)

Built-in authentication with users, sessions, organizations, and role-based access:

```js
const auth = Novoid.useNovoidAuth(db);
await auth.register(email, password, name);
await auth.login(email, password);
auth.user(); auth.isAuthenticated(); auth.getToken();

const org = Novoid.useOrg(db, auth);
org.orgs(); org.currentOrg(); org.currentRole(); org.switchOrg(id);
```

### 6.5 Toast Plugin (`src/plugins/toast.js`)

Notification system: `Novoid.toast.info('Saved')`, `.success()`, `.danger()`, `.warning()`.

---

## 7. The Convex Backend

novoid uses [Convex](https://convex.dev) as its database, serverless function runtime, and HTTP server. There is no separate backend to deploy, no infrastructure to configure.

### 7.1 Schema (`convex/schema.ts`)

| Table | Purpose |
|---|---|
| `pages` | Published HTML apps with slug, content, browser schema, and Nous report |
| `assets` | Framework CSS and JS files served at `/css/:name` and `/js/:name` |
| `keys` | API keys and secrets (e.g., `PUBLISH_SECRET`) |
| `errors` | Runtime error telemetry from live pages (sentinel system) |
| `users` | User accounts with email/password authentication |
| `sessions` | Session tokens with expiration |
| `organizations` | Multi-tenant org support with settings |
| `orgMemberships` | User-org role bindings |
| `orgInvitations` | Invite tokens with expiry |
| `plans` | Multi-agent build plans for collaborative page construction |
| `fragments` | Individual fragments of a page, claimable by agents |
| `domains` | Custom domain-to-slug mappings |
| `jobs` | Job queue for async agent work (prompt → build → deploy) |
| `notes` | User notes (sample content app) |

### 7.2 HTTP Routes (`convex/http.ts`)

| Route | Method | Purpose |
|---|---|---|
| `/app/:slug` | GET | Serve published page (with sentinel injection + live reload) |
| `/raw/:slug` | GET | Serve raw HTML (no injection, for novoid-browser) |
| `/mcp/:slug` | GET | Human/agent-readable MCP manifest (JSON) |
| `/mcp/:slug` | POST | MCP JSON-RPC endpoint (Streamable HTTP transport) |
| `/publish/:slug` | POST | Publish a page via HTTP (auth-gated) |
| `/css/:name` | GET | Serve CSS framework assets |
| `/js/:name` | GET | Serve JS framework assets |
| `/img/:name` | GET | Serve image assets (base64 data URIs) |
| `/errors/:slug` | POST | Receive runtime errors from sentinel |
| `/collab/:slug` | GET | Multi-agent collaboration status |
| `/platform` | GET | Admin UI |
| `/vox` | GET | Voice creation UI |
| `/llms.txt` | GET | LLM discovery file |
| `/robots.txt` | GET | Crawler permissions (allows all major AI bots) |
| `/*` (catch-all) | GET | Custom domain resolution via `domains` table |

### 7.3 Content Negotiation

Every page-serving route supports content negotiation via the `Accept` header. Browsers receive `text/html` with full sentinel injection and live reload. AI agents that send `Accept: text/markdown` receive a Markdown-formatted version of the page with schema metadata, making any novoid app natively readable by LLMs without HTML parsing.

### 7.4 Security

- All write mutations require `secret` arg checked against `PUBLISH_SECRET`
- CSP headers restrict script sources, style sources, and frame behavior
- Error payloads are size-limited (4KB max) and field-truncated
- HTML `innerHTML` assignments are sanitized (strips `<script>`, `<iframe>`, `<object>`, `on*` handlers, `javascript:` hrefs)
- Secret leak detection runs as Phase 4 of verification

---

## 8. The Verification Pipeline

Publishing is not blind. Every app passes through a multi-phase verification pipeline before it goes live.

### 8.1 Phase 1: Nous (Static Proof)

Nous is a static analyzer that examines the HTML source without executing it. It produces a proof report covering three domains:

- **Morphe** (Structure): DOM node count, contract checking, accessibility audit (input labels, tab order)
- **Thesis** (Typography/Layout): Overflow risk detection, cascade conflict analysis, breakpoint coverage
- **Kinesis** (Reactivity): Signal count, effect count, unnamed signal warnings, reactive cycle detection, dead signal detection, taint analysis, state machine deadlock detection

Verdict: `SOUND`, `PARTIAL`, or `UNSOUND`. An `UNSOUND` verdict blocks publishing (unless `--skip-check` is passed).

### 8.2 Phase 2: novoid-browser (Headless Execution)

novoid-browser is a Rust binary that executes the HTML file in a headless environment, runs all JavaScript, and extracts the empirical schema:

- All signals and their current values
- All stores, their state, and their actions
- All registered components
- Convex subscriptions, mutations, and actions
- Runtime errors

This schema is stored alongside the page in the database and becomes the foundation of the MCP endpoint. For Convex apps that can't fully initialize headlessly (no backend URL), the verifier performs static detection of `useMutation`, `useAction`, and `useAI` calls and injects their refs into the schema.

### 8.3 Phase 3: MCP Test Specs (Behavioral E2E)

If a `.test.json` file exists alongside the app, novoid-browser runs it as a behavioral test suite:

```json
{
  "steps": [
    { "action": "read", "resource": "count", "assert": { "eq": 0 } },
    { "action": "call", "tool": "inc", "then": { "read": "count", "assert": { "eq": 1 } } }
  ]
}
```

Step types: `read` (check state), `call` (invoke store action), `push` (simulate Convex update).
Assertions: `eq` (deep equality), `length`, `contains`, `matches`.

Tests run in ~8ms for 20 steps. They use MCP semantics (resources/read, tools/call), so the same test spec that verifies local behavior could theoretically run against the live MCP endpoint.

### 8.4 Phase 4: Secret Leak Detection

The source file is scanned for patterns matching `PUBLISH_SECRET`, OpenAI-style API keys (`sk-...`), and generic high-entropy secret assignments. A match blocks publishing.

### 8.5 Post-Publish E2E

After the page is live, `publish.sh` runs three additional checks:

1. **Live URL responds 200** — verifies Convex HTTP routing works
2. **MCP schema is populated** — verifies tools/resources are extractable
3. **Sentinel errors** — waits 2 seconds, then checks the `errors` table for runtime crashes

---

## 9. The MCP Layer

Every published app with a browser schema automatically becomes an MCP server. This is not opt-in — it is a structural consequence of the architecture.

### 9.1 What Gets Exposed

| Source | MCP Concept | Access |
|---|---|---|
| Store actions | Tools (schema-only, client-side) | Public |
| Convex mutations | Tools (executable, server-side) | Auth-gated (Bearer token) |
| Convex actions | Tools (executable, server-side) | Auth-gated (Bearer token) |
| Signals / store state | Resources (snapshot) | Public |
| Convex queries | Resources (live, server-side) | Public |

### 9.2 Protocol

- **Transport**: Streamable HTTP (POST to `/mcp/:slug`)
- **Protocol version**: `2024-11-05`
- **Methods**: `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`
- **Discovery**: GET `/mcp/:slug` returns a human/agent-readable JSON manifest

### 9.3 URI Scheme

```
novoid://<slug>/state/<name>    → signal or store snapshot
novoid://<slug>/entity/<path>   → entity collection + schema
novoid://<slug>/query/<ref>     → live Convex query result
```

### 9.4 Implications

Because every app is an MCP server, any AI agent with HTTP access can:
- Read the current state of any published app
- Invoke mutations and actions (with authorization)
- Discover what an app does, what state it holds, and what operations it supports

This makes novoid apps composable by agents without human integration work.

---

## 10. The Sentinel System

Every published page has an error capture snippet injected into its `<head>`. This snippet intercepts `window.onerror`, `unhandledrejection`, and `console.error`, batches them, and sends them to `/errors/:slug` via `navigator.sendBeacon`.

Errors are stored in the `errors` table with: slug, message, source file, line/column, stack trace, error type, timestamp, and user agent. They can be queried via:

```sh
npx convex run errors:recent '{"slug":"my-app"}'
npx convex run errors:clear '{"slug":"my-app","secret":"$PUBLISH_SECRET"}'
```

The sentinel is checked automatically during post-publish E2E (Phase 3 of `publish.sh`). If runtime errors appear within 2 seconds of publishing, the deployment is flagged.

---

## 11. Live Reload

Published pages include a live-reload snippet that subscribes to the `pages:version` Convex query via WebSocket. When the page is republished (the version changes), the browser reloads automatically. This enables a development workflow where an agent edits a file, runs `publish.sh`, and the user sees the change in their browser without touching anything.

---

## 12. Multi-Agent Collaboration

novoid supports collaborative page construction by multiple agents through the `plans` and `fragments` tables:

1. A coordinating agent creates a **plan** — a slug, description, list of named fragments, and a template
2. Individual agents **claim** fragments using their agent ID
3. Each agent builds their fragment independently
4. A **compose** step merges all completed fragments into the final page

Status and coordination are exposed via `/collab/:slug` (HTTP) and Convex mutations.

---

## 13. Jobs Queue

The `jobs` table implements an async work queue:

- External systems submit a prompt (and optional context/audio)
- An agent claims the job, sets status to `building`
- The agent generates the app, publishes it, and sets status to `done`
- The result field stores the published slug or error message

This enables voice-driven creation (via the Vox UI), chat-driven creation, or batch generation workflows.

---

## 14. Custom Domains

The `domains` table maps hostnames to page slugs. When a request arrives at the Convex HTTP router with a `Host` header that doesn't match `*.convex.site`, the catch-all handler looks up the hostname in the `domains` table and serves the corresponding page with rewritten asset paths.

This means a novoid app published as `my-app` can be served at `myapp.com` with a single DNS record and one database entry — no reverse proxy, no CDN configuration, no SSL certificate management.

---

## 15. The Two Modes of Building

### 15.1 Render Mode (Preferred)

Declarative, zero CSS/JS output:

```
store + Novoid.render() → .html + .test.json → publish.sh → live
```

The agent describes state and sections. The render plugin handles all DOM, styling, layout, and responsiveness. This is the fastest path and produces the most consistent output.

### 15.2 Classic Mode

Imperative, full control:

```
signals + Novoid.h() + CSS classes → .html + .test.json → publish.sh → live
```

The developer or agent writes `h()` calls directly, applies `nv-` CSS classes, and manages layout manually. This mode is for applications that need UI patterns not covered by the render vocabulary.

---

## 16. Skill-Led Reasoning

novoid's agent architecture is built on an empirical finding: agents perform better when knowledge is always in context rather than retrieved on demand.

### 16.1 The Problem with Retrieval

Traditional agent architectures give agents access to documentation and expect them to look it up when needed. This introduces a decision point: *when* to read which file. Vercel's agent evaluations measured this directly — agents with on-demand skill retrieval achieved 79% task completion, while agents with compressed documentation always in context achieved 100%.

The 21% gap is the cost of deciding when to look things up. Every missed retrieval is a task failure.

### 16.2 Skills as Codified Knowledge

novoid addresses this with **skills** — compressed knowledge files that replace reading source code. Each skill distills multiple source files into an actionable reference:

| Skill | Replaces |
|---|---|
| `novoid-core.md` | `src/core.js` (~680 lines) + `spec.md` Core section |
| `novoid-render.md` | `src/plugins/render.js` (~940 lines) + `render.md` (~600 lines) |
| `novoid-css.md` | `src/core.css` (~530 lines) + `src/components.css` (~560 lines) |
| `novoid-publishing.md` | `publish.sh` + `verify.sh` + `url.sh` + `build.sh` + `seed.sh` |
| `novoid-verification.md` | Nous + novoid-browser + MCP test spec docs |
| `novoid-agents.md` | Nex worker + Vox + personas + memory system |
| `novoid-math.md` | KaTeX integration patterns |
| `novoid-improve.md` | Meta-skill: feature expansion checklist |

### 16.3 The Architecture

```
CLAUDE.md (entry point)
  → Skills Index (always loaded)
    → novoid-core.md      (build apps)
    → novoid-render.md    (declarative UI)
    → novoid-css.md       (styling)
    → novoid-publishing.md (deploy)
    → novoid-verify.md    (test)
    → ...

AGENTS.md (external agents)
  → Quick Reference (inlined)
  → Skills directory link

Source files (src/core.js, src/plugins/*.js, src/*.css)
  → Read ONLY when editing framework internals
  → Never read for app generation
```

The agent never decides *when* to look something up. The knowledge is either always available (skills, AGENTS.md quick reference) or clearly scoped to a specific task (editing framework source).

### 16.4 Agent SEO

For external agents discovering novoid for the first time:

- **`AGENTS.md`** at repo root — the standard discovery file, with inlined quick reference
- **`llms.txt`** at site root — served via HTTP for LLM crawlers
- **`robots.txt`** — explicitly allows major AI bots (GPTBot, ClaudeBot, PerplexityBot, etc.)
- **Content negotiation** — `Accept: text/markdown` on any page returns agent-readable format
- **MCP endpoints** — every published app is programmatically discoverable and controllable
- **Skills directory** — agents that clone the repo get complete codified knowledge

---

## 17. Design Principles

1. **Description is deployment.** The act of describing what an application should do is the same act as making it available. There is no separate "deploy" step.

2. **Vanilla all the way down.** Generated apps are plain HTML, CSS, and JavaScript. No JSX, no TypeScript, no module bundlers, no transpilation. A browser can execute them directly.

3. **Signals, not virtual DOM.** Reactivity is fine-grained. When `count()` changes, only the DOM nodes that read `count()` update. There is no diffing, no reconciliation, no render tree.

4. **Named state, testable state.** Signals have names. Stores have actions. These names flow through to MCP schemas, test specs, and debugging tools. If state isn't named, it isn't testable.

5. **Verification before publication.** Code is statically analyzed, headlessly executed, and behaviorally tested before it reaches a URL. Publishing without verification requires an explicit opt-out.

6. **Every app is an API.** The MCP endpoint is not an add-on. It is a structural consequence of named state and store actions. Publishing an app simultaneously publishes its programmatic interface.

7. **Agents are first-class users.** Content negotiation, MCP endpoints, `robots.txt` allowing AI bots, `llms.txt` discovery, Markdown responses — the system treats AI agents as a primary audience, not an afterthought.

8. **The database is the server.** Convex handles persistence, HTTP serving, real-time subscriptions, serverless functions, and authentication. There is no infrastructure to manage.

---

## 18. System Metrics

| Metric | Value |
|---|---|
| Core JS size | ~680 lines (unminified) |
| Render plugin size | ~940 lines (unminified) |
| Combined minified payload | ~12 KB |
| Time from `publish.sh` to live URL | ~2 seconds |
| E2E test execution | ~8ms for 20 steps |
| Framework dependencies | 0 (vanilla JS) |
| App-level dependencies | 0 (no npm) |
| Build tools required | 0 |

---

## 19. Component Map

```
novoid/
├── src/
│   ├── core.js              Reactive primitives (signal, h, mount, store, etc.)
│   ├── core.css             Design tokens and utility classes
│   ├── components.css       Component library (btn, card, table, modal, etc.)
│   └── plugins/
│       ├── render.js        Declarative UI renderer
│       ├── router.js        Hash-based client routing
│       ├── convex.js        Convex real-time integration
│       ├── auth.js          Authentication and org management
│       └── toast.js         Notification system
├── convex/
│   ├── schema.ts            Database schema (13 tables)
│   ├── http.ts              HTTP router (15+ routes including MCP)
│   └── *.ts                 Mutations, queries, actions
├── nous/                    Static analyzer (Rust + TypeScript)
├── browser/                 Headless executor and test runner (Rust)
├── publish.sh               Verify + publish + post-publish E2E
├── verify.sh                Nous + novoid-browser + test specs + secret scan
├── build.sh                 Minify src/ → dist/
├── seed.sh                  Upload framework assets to Convex
├── url.sh                   Look up live URLs for a slug
├── skills/                  Codified knowledge (8 skill files — agent source of truth)
└── skills/certified/        Convex knowledge base (5 certified skill files)
```

---

## 20. Conclusion

novoid is a bet that the bottleneck in software creation has shifted. The hard part is no longer writing code — AI can do that. The hard part is the distance between code and a running, accessible, testable, composable application. novoid compresses that distance to a single shell command.

The system is opinionated by design. It chooses vanilla HTML over JSX, signals over virtual DOM, database-as-server over container orchestration, MCP over REST, and verification-by-default over trust-by-default. Each of these choices exists to serve one goal: making the path from idea to live application as short as physically possible.

Every novoid app is simultaneously a web page, an MCP server, and a testable state machine. This is not three features — it is one architecture where naming your state automatically produces all three.

Describe it. It's live.
