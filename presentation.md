# no∅ (novoid) — Describe It, It's Live

## Visual Style Guide

> **For NotebookLM / slide generation tools:**
>
> - **Color palette:** Deep navy (#0f172a) backgrounds, electric teal (#14b8a6) accents, white (#f8fafc) text, soft gray (#94a3b8) secondary text. Use teal for highlights, callouts, and key numbers.
> - **Typography:** Clean sans-serif (similar to DM Sans or Inter for body, Outfit or Sora for headings, JetBrains Mono for code). Large, bold headings. Generous whitespace.
> - **Layout:** Minimal, asymmetric layouts. One idea per slide. Use negative space aggressively. No clip art. No stock photos.
> - **Code blocks:** Dark background with syntax highlighting. Teal for keywords, white for identifiers, gray for comments. Rounded corners.
> - **Data visuals:** Horizontal bar charts for comparisons, not pie charts. Use teal vs gray for no∅ vs competitors. Bold the numbers.
> - **Iconography:** Abstract geometric shapes. Circles, lines, and the ∅ symbol as a recurring motif. No emojis.
> - **Tone:** Confident, technical, understated. Think Apple keynote meets developer conference.
> - **Transitions:** Fade-up reveals. No spinning or bouncing.

---

## Slide 1 — Title

# no∅

### Describe it, it's live.

*A frontend platform where describing an application is the same act as deploying it.*

---

## Slide 2 — The Problem

### The modern frontend stack is a gauntlet.

A developer who wants a working web application must first navigate:

- Build tools & bundlers
- Transpilers & type systems
- Package managers & lockfiles
- CI/CD pipelines
- Container orchestration
- Hosting providers

All before writing a single line of application logic.

**The gap between "I have an idea" and "someone can use it" has widened into months of infrastructure work.**

---

## Slide 3 — The AI Problem

### AI agents can do all of this. They shouldn't have to.

An LLM can reason about UI, generate HTML, write business logic — and yes, it can run `npm install`, configure Webpack, push to Git, and wait for CI.

But every one of those steps is:
- **Wasted tokens** — reasoning about infrastructure instead of the application
- **Wasted time** — 30+ seconds of pipeline overhead per deploy
- **A failure surface** — dependency conflicts, build errors, auth issues, environment drift
- **Context pollution** — the agent's limited window fills with boilerplate instead of product logic

The deployment stack is a tax on every iteration. The more iterations matter — and for agents, they matter enormously — the more that tax compounds.

---

## Slide 4 — The Thesis

### One environment. One constraint. Zero compromise.

> The path from description to live application must be a single atomic operation.

Write an HTML file. Run one command. The app is live — with a URL, an MCP endpoint, error telemetry, live reload, and a programmatic interface for other agents.

There is no dev/prod split. No staging. No promotion workflow. One database, one `publish.sh`, one live URL. Agents don't manage deployment pipelines — friction is the enemy.

**No build step. No npm. No Git push. No CI. No container.**

---

## Slide 5 — Three Audiences, One System

| Audience | What novoid is |
|----------|---------------|
| **AI Agents** | The deployment target. Generate HTML, call `publish.sh`, get a live URL + MCP endpoint. |
| **Developers** | A zero-config framework. Fine-grained reactivity, CSS components, declarative rendering. Two files, ~12 KB. |
| **End Users** | Instant-loading apps. Real-time updates. Offline-capable. No configuration. |

---

## Slide 6 — Architecture

```
    Agent or Developer
           │
     write HTML file
           │
      sh publish.sh
           │
    ┌──────┼──────┐
    │      │      │
  Nous   Browser  MCP
  static  headless E2E
  proof   exec    tests
    │      │      │
    └──────┼──────┘
           │
    Convex mutation
           │
    ┌──────┼──────┐
    │      │      │
  /app   /mcp   /raw
  live   API    source
  page   endpoint HTML
```

No CI pipeline. No build server. No containers. Publishing is a database write.

---

## Slide 7 — The Reactive Core

### Signals — the fundamental primitive

```js
const [count, setCount] = Novoid.signal(0, 'count');
count();            // read (reactive)
setCount(5);        // write
setCount(n => n+1); // updater
```

### Computed — derived values

```js
const double = Novoid.computed(() => count() * 2);
```

### Effects — side-effect runners

```js
Novoid.effect(() => console.log(count()));
```

### Batch — grouped updates

```js
Novoid.batch(() => { setA(1); setB(2); }); // one notification
```

~680 lines of vanilla JavaScript. Zero dependencies.

---

## Slide 8 — The Render Plugin

### Zero h() calls. Zero CSS. Pure declaration.

```js
Novoid.render('#app', store, {
  app: { name: 'My App', theme: 'dark' },
  sections: [
    { metrics: { columns: 3, items: [
      { label: 'Revenue', value: '$revenue', format: 'currency', color: 'teal' },
      { label: 'Users', value: '$users', color: 'blue' },
      { label: 'Growth', value: '$growth', format: 'percent', color: 'green' }
    ]}},
    { table: { title: 'Transactions', source: '$items', columns: [...] }},
    { cards: { source: '$projects', template: { title: '$item.name' }}}
  ]
});
```

The agent writes state + spec. The renderer owns everything else.

**Section vocabulary:** metrics, table, cards, form, chart, stat, header, row, list, divider, empty.

**Three modes:** Render apps (pure declaration), hybrid apps (h() shell + render sections), and classic apps (imperative h() with full CSS control). Most apps use render. Landing pages with complex layouts use hybrid.

---

## Slide 9 — createStore: The Testability Boundary

```js
const store = Novoid.createStore(
  { count: 0, todos: [] },
  {
    inc(s)  { return { count: s.count + 1 }; },
    add(s, text) { return { todos: [...s.todos, { text, done: false }] }; }
  }
);
```

- Actions return **partial state** — auto-merged via `Object.assign`
- Every store action automatically becomes an **MCP-callable tool**
- Agents can read state, invoke actions, and verify results — programmatically

**The app is its own API.**

---

## Slide 10 — The CSS System

### Design tokens + component library. No Tailwind. No build.

**Tokens:** `--nv-primary-500`, `--nv-space-4`, `--nv-shadow-lg`, `--nv-radius-md`

**Components:**

| Category | Examples |
|----------|---------|
| Interactive | Button (8 variants, 7 sizes), Toggle, Dropdown |
| Data Display | Card, Table, Badge, Tag |
| Feedback | Alert, Toast, Spinner, Skeleton, Progress |
| Navigation | Navbar, Tabs, Breadcrumb, Pagination |
| Overlay | Modal, Drawer, Popover, Tooltip |
| Form | Input, Select, Textarea, Checkbox, Radio |
| Layout | Container, Grid (1-12 cols), Flex, Stack |

Dark mode: one attribute — `[data-theme="dark"]`

---

## Slide 11 — Motion Animations

### Production-grade motion. Zero config.

Built-in Motion.dev integration for scroll-triggered reveals, staggered entrances, parallax, and timeline sequences.

```js
const { animate, scroll, stagger, inView } = Motion;

// Stagger cards on scroll
inView('.cards', () => {
  animate('.card', { opacity: [0, 1], y: [30, 0] },
    { delay: stagger(0.08), duration: 0.4 });
});

// Parallax hero fade
scroll(animate('.hero', { opacity: [1, 0] }),
  { offset: ['start start', 'end start'] });
```

Animations are declarative, scroll-aware, and spring-based. No CSS keyframe soup. The landing page itself is a showcase — every section reveals on scroll.

---

## Slide 12 — The Data Layer: Convex

### Real-time backend. Zero infrastructure.

no∅ apps connect to Convex for reactive queries, mutations, and AI actions.

```js
const db = Novoid.createClient(CONVEX_URL);
const { data, loading } = useQuery(db, 'tasks:list');
const addTask = useMutation(db, 'tasks:add');
const ask = useAI(db, 'ai:chat');
```

- **Reactive queries** — UI auto-updates when backend data changes
- **Built-in auth** — session-based, no cookies, org-scoped
- **AI helpers** — `useAI()` with streaming responses, history, and loading state
- **One deployment** — the dev Convex instance *is* production

Publishing is a Convex mutation. The database is the deployment target.

---

## Slide 13 — Math & Scientific Rendering

### KaTeX built in. TeX notation, instant render.

```js
katex.render('E = mc^2', el, { displayMode: true });
```

No build step. No MathJax overhead. Direct KaTeX CDN integration with MathML visibility fixes for accessibility. Enables technical, scientific, and educational apps out of the box.

---

## Slide 14 — The Numbers

### 10 identical apps. no∅ vs Next.js. Every number measured.

> *All measurements from the benchmark documented in the codebase. Real builds, real deployments, real numbers.*

| Metric | no∅ | Next.js | Factor |
|--------|-----|---------|--------|
| Total deployed (10 apps + runtime) | 68 KB | 621 KB | **9.1x smaller** |
| App code (10 apps) | 23.6 KB | 573 KB shared chunks | **24x smaller** |
| Shared JS runtime | 10 KB | 573 KB | **57x smaller** |
| Dev dependencies | 0 bytes | 421 MB | **∞** |
| Build artifacts | 0 | 8.3 MB | **∞** |
| Time to live URL | 7.6s | 31s (setup+build) | **4.1x faster** |

---

## Slide 15 — Per-App Deployment Size

| App | no∅ (HTML) | Next.js (per-route cost*) |
|-----|-----------|------------------------|
| Counter | **1.1 KB** | 62 KB |
| Todo | **2.5 KB** | 62 KB |
| Calculator | **3.3 KB** | 62 KB |
| Timer | **2.2 KB** | 62 KB |
| Kanban | **3.0 KB** | 62 KB |
| Form | **2.1 KB** | 62 KB |
| Dashboard | **2.5 KB** | 62 KB |
| Tabs | **2.3 KB** | 62 KB |
| Router | **2.6 KB** | 62 KB |
| Theme | **2.2 KB** | 62 KB |

novoid: storage scales with app complexity (1.1-3.3 KB). Next.js: 573 KB shared JS loaded on every page; per-route cost ≈ 62 KB.

---

## Slide 16 — The Verification Pipeline

### Three-phase proof before anything goes live.

**Phase 1 — Nous (static analysis)**
Checks structure, naming, security, and framework compliance without executing code.

**Phase 2 — novoid-browser (headless execution)**
Launches the app in a real browser. Extracts signals, stores, and DOM state via introspection.

**Phase 3 — MCP test spec (behavioral E2E)**
Runs the `.test.json` spec against the live MCP endpoint. Verifies state transitions, not DOM selectors.

All three phases complete in a single `publish.sh` call (~7.6 seconds).

---

## Slide 17 — Testing: 170x Faster, Zero Setup

### novoid tests state directly. Playwright scrapes the DOM.

| | no∅ | Next.js + Playwright |
|--|-----|---------------------|
| Test setup time | **0s** (built-in) | 17.3s + 91 MB Chromium |
| Test format | JSON (declarative) | TypeScript (imperative) |
| Execution time | **34ms** (9 apps, 17 steps) | 5.8s (1 app, 5 tests) |
| Needs dev server | No | Yes |
| Fragile selectors | No (semantic state names) | Yes (CSS classes) |

**novoid:** "Read the `count` signal → assert it equals 0 → call `increment` → assert count is 1"

**Playwright:** "Find element with class `.text-5xl` → assert text is '0' → click button with text '+1' → find element again → assert text is '1'"

---

## Slide 18 — MCP: Every App is an API

### Content negotiation built in.

- **Browser requests** `/app/my-app` → gets rendered HTML page
- **Agent requests** `/mcp/my-app` → gets structured state + callable tools

```
GET /mcp/my-app
→ { state: { count: 0 }, tools: ["inc", "dec", "reset"] }

POST /mcp/my-app  { tool: "inc" }
→ { state: { count: 1 } }
```

Agents can discover, read, test, and control any novoid app without a single line of integration code.

---

## Slide 19 — The Developer Experience

### From idea to live URL

```bash
# 1. Write the app
vim src/app/my-app.html

# 2. Write the test spec
vim src/app/my-app.test.json

# 3. Publish (verify + deploy + E2E)
sh publish.sh my-app src/app/my-app.html

# Done. Live URL printed to stdout.
```

No `package.json`. No `node_modules`. No `.env`. No `Dockerfile`. No GitHub Actions.

---

## Slide 20 — The Agent Experience

### AI agents are first-class citizens.

1. Agent generates a single HTML file (state + UI spec)
2. Agent calls `publish.sh`
3. Pipeline verifies correctness across three phases
4. App is live with URL + MCP endpoint
5. Other agents can discover and interact with it

**The agent never touches npm, Git, Docker, or any infrastructure.**

Multi-agent collaboration is built in — agents can claim fragments, edit concurrently, and compose results.

---

## Slide 21 — Skill-Led Reasoning

### Skills are the source of truth.

novoid is built around **codified skills** — compressed, always-in-context knowledge files that agents read before writing a single line of code.

```
skills/
  novoid-core.md         — signals, computed, effect, batch, h(), createStore, mount
  novoid-render.md       — declarative UI: sections, $expressions, formats, views, panels
  novoid-css.md          — nv-* classes, --nv-* variables, theming, dark mode, animations
  novoid-publishing.md   — publish.sh, verify.sh, build.sh, MCP endpoints, test specs
  novoid-verification.md — Nous static analysis, headless execution, test harness
  novoid-agents.md       — personas, memory, multi-channel, inline apps
  novoid-convex.md       — Convex client, reactive queries, mutations, AI helper
  novoid-motion.md       — Motion.dev: animate, scroll, stagger, timeline, inView
  novoid-math.md         — KaTeX integration, TeX notation, MathML visibility
  novoid-improve.md      — feature expansion checklist, consistency rules

certified/               — 5 Convex-specific skills (schema, functions, realtime, agents, best practices)
```

**When skills and pre-training agree, you're on the right path. When they diverge, skills win.**

Skills are not documentation. They are the codified knowledge that makes agents productive — the API contract, the naming conventions, the guardrails, the patterns. An agent reads a skill file and knows exactly what to do.

---

## Slide 22 — What This Enables

### Applications that build themselves.

- A user describes what they want in natural language
- An AI agent reads the skills, generates the no∅ app
- The verification pipeline proves it works
- It's live in seconds
- Other agents can extend, test, and integrate it

**The entire loop — from intent to running software — is automated and verifiable.**

---

## Slide 23 — Closing

# no∅

### Describe it, it's live.

- Zero dependencies
- 12 KB framework
- Single-command publish
- Three-phase verification
- Every app is an API
- AI-native by design

*The gap between idea and application is now zero.*
