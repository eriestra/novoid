# Framework Design When the Developer Is an LLM

*February 2026*

---

## Abstract

The dominant frontend toolchain — React, TypeScript, Vite, Next.js — was designed for human teams building applications over months. When the developer is an LLM agent that generates complete applications in a single pass, every assumption behind that toolchain breaks. Build steps become dead time. Multi-file architecture becomes error surface. Type safety solves a problem the agent doesn't have. Configuration files become failure modes.

This paper describes no∅, a frontend framework designed for LLM consumption, and documents what happens when you optimize for the agent's workflow instead of the human's. Three applications were built in a single session — a kanban board, a particle simulation, and a fractal renderer — totaling 1,370 lines in 5 minutes 24 seconds.

---

## 1. The Design Inversion

Human developers and LLM agents have opposite strengths. A human reads documentation gradually, builds mental models over weeks, benefits from IDE autocompletion, and maintains code through incremental edits. An LLM reads an entire specification in seconds, generates a complete codebase in one pass, has no IDE, and treats every generation as a fresh start.

The properties that make a framework productive for humans — deep ecosystem, type checking, component reusability, hot module replacement — are either irrelevant or actively costly for agents.

| Property | Value for humans | Value for agents |
|---|---|---|
| TypeScript | Catches errors across edits over time | Irrelevant — agent generates correct types from context |
| HMR / dev server | Fast feedback during iterative development | Irrelevant — agent generates complete files |
| Tree-shaking | Removes unused code from large dependency graphs | Irrelevant — agent only writes what it uses |
| Multi-file architecture | Enables team collaboration and code reuse | Pure cost — cross-file coherence is error surface |
| Build pipeline | Optimizes output for production | Dead time between generation and deployment |
| Ecosystem depth | Solves problems the developer hasn't encountered yet | Context pollution — more symbols to misuse |

This isn't a criticism of React. React is excellent at what it was designed for. The point is that the design target has changed.

---

## 2. What Agent-Optimized Looks Like

no∅ is 15KB (gzipped) of vanilla CSS and JavaScript — a component library and a reactive framework with signals, routing, forms, stores, and Convex integration. It was designed around five constraints:

### 2.1 Single-file output

Each application is one self-contained HTML file. This is the natural unit of LLM generation. The agent builds a complete mental model and emits it in one pass. Splitting output across components, hooks, types, styles, layouts, and config forces the agent to maintain cross-file coherence — managing imports, avoiding circular dependencies, matching types across boundaries. Every additional file is a joint that can fail.

For a React project, a kanban board might require 8-12 files. For no∅, it's one. The reduction isn't about minimalism — it's about eliminating an entire category of errors that only exist because of multi-file architecture.

### 2.2 Zero build step

The React/Vite/Next.js workflow for a new project adds 30-60 seconds of overhead before application code runs, and 30-120 seconds of deploy latency. This cost is paid every session.

no∅ has no transpilation, no bundling, no tree-shaking, no source maps, no HMR server. The framework CSS and JS are pre-deployed static assets. The agent writes an HTML file and publishes it. Total deploy time: ~2 seconds.

For agents, build tools are pure cost. The agent doesn't benefit from any of the things build tools provide. Every second spent waiting for `vite build` is a second that could have been spent generating.

### 2.3 Small API surface

no∅ has ~25 JS functions and ~120 CSS utility classes, all behind consistent prefixes (`Novoid.*`, `nv-*`, `--nv-*`). An LLM can hold the entire API in context from a single 45KB spec file.

Compare: React + Tailwind + Next.js exposes 500+ symbols across hooks, JSX semantics, component lifecycle rules, server vs. client components, 500+ utility classes, responsive prefixes, App Router vs. Pages Router, server actions, middleware, metadata API, and more. A larger API surface doesn't make the framework more capable for agent-generated code. It makes mistakes more likely.

### 2.4 Single-source specification

The entire no∅ API is documented in one file (`skills.md`): every function, every parameter, every CSS class, with code examples. The agent reads it once and has everything.

When documentation is scattered across a README, a wiki, API reference docs, blog posts, and StackOverflow answers, the agent reads some subset and misses information. For LLMs, the specification IS the API. If the spec says a function takes two arguments, the agent will call it with two arguments — even if the actual implementation accepts three. Documentation accuracy is the single highest-leverage investment for agent adoption.

### 2.5 Instant deployment

no∅ uses a self-hosting architecture: pages are stored in a Convex database and served via HTTP routes. Publishing is a single CLI command that writes HTML to the database. The page is live immediately — no CI/CD, no build server, no upload.

This matters because agents work in a generate-test-fix loop. Shorter cycle time means more iterations per unit time, which means higher final quality. When deploying to Vercel takes 45 seconds, the agent is incentivized to generate fewer, larger changes and hope they're correct. When deploying takes 2 seconds, the agent can ship, verify, and fix rapidly.

---

## 3. The Self-Hosting Pattern

The most architecturally interesting part of no∅ isn't the framework — it's the deployment model.

```
GitHub                              Convex Cloud
──────                              ────────────
index.html (40 lines)
  │ fetch("/app/slug") ──────────→  HTTP route reads from pages table
  │                                   │
  document.write(html) ◄────────── returns full HTML page

                                    Stored in DB:
                                      pages:  { slug, html }
                                      assets: { novoid.min.css, novoid.min.js }
```

GitHub holds only a bootstrapper. The actual platform — including its own admin UI — lives in the database. The agent writes a file, runs one command, and the page is globally accessible.

This pattern generalizes. Any agent-generated application that doesn't need server-side logic beyond storage can use it: write HTML to a database, serve it via HTTP. The entire CI/CD pipeline collapses into a single database write. For applications where the "maintenance strategy" is "regenerate from scratch," this is the natural architecture.

The traditional deployment pipeline (commit → push → CI → build → deploy → CDN invalidation) was designed for code that changes incrementally and must be carefully validated at each step. When code is generated whole and deployed in one shot, most of those steps become overhead.

---

## 4. Evidence

Three applications were built in a single session to test these ideas:

| Project | Description | Time | Lines |
|---|---|---|---|
| Kanban Board | Drag-and-drop, localStorage persistence, dark mode, CRUD | 152s | ~550 |
| Particle Galaxy | 80K-particle Three.js simulation, 4 modes, bloom post-processing | 93s | ~400 |
| Infinitum | Real-time raymarched fractal, custom GLSL shaders, generative audio | 99s | ~420 |

Total: **1,370 lines in 344 seconds.** Each project went from an English prompt to a live, publicly accessible URL.

Estimated comparison for the kanban board:

| | React/Next.js (est.) | no∅ (actual) |
|---|---|---|
| Scaffold / setup | 40s | 0s |
| Generate code | 45s | 45s |
| Build + deploy | 55s | 2s |
| Debug infrastructure issues | 50s | 0s |
| **Total** | **~190s** | **~47s** |

The generation time is roughly equal — the agent writes similar amounts of code either way. The difference is everything around the code: scaffolding, building, deploying, debugging infrastructure. no∅ eliminates that overhead.

---

## 5. Honest Tradeoffs

no∅ gives up real things to achieve this:

**No type safety.** TypeScript catches entire categories of bugs during long-lived development. When code is generated fresh each time, those bugs are less likely — but they're not impossible, and there's no safety net.

**No ecosystem.** React has solutions for authentication, data fetching, state management, testing, accessibility, animation, and internationalization. no∅ has what's in the 15KB bundle. Anything else, the agent writes from scratch.

**Limited team collaboration.** Multi-file architecture exists partly so multiple people can work on different parts simultaneously. Single-file output doesn't support that.

**Regenerate-from-scratch maintenance.** If a no∅ application needs a change, the practical approach is to regenerate it. This works for prototypes and tools. It doesn't work for applications with accumulated state, complex business logic, or regulatory requirements.

These are genuine limitations, not temporary gaps. They are the cost of optimizing for agent workflow. The question isn't whether no∅ is better than React in general — it isn't. The question is whether a different set of tradeoffs makes sense when the developer is an LLM.

---

## 6. Implications

### For framework authors

If you want agents to generate code with your framework:

1. Write one complete spec file, not scattered documentation
2. Keep the API surface under 200 symbols
3. Support single-file output as the default
4. Eliminate or make optional every build step and configuration file
5. Use consistent, prefixed naming to avoid ambiguity
6. Test documentation by having an LLM read it and generate code — if the generated code fails, the documentation is wrong

### For platform engineers

The self-hosting pattern (code stored in a database, served via HTTP) is underexplored. It eliminates CI/CD for agent-generated applications and reduces deploy time to the speed of a database write. For any application where the agent is the sole author, consider whether you need a deploy pipeline at all.

### For the industry

The React/TypeScript/Next.js stack assumes a developer who learns gradually, benefits from type hints, and maintains code over months. None of these assumptions hold for an LLM agent. The frameworks that work best for agents will not necessarily be the most powerful or feature-rich. They will be the ones with the smallest distance between "English prompt" and "working URL."

This doesn't mean React is going away. It means that frameworks optimized for human teams and frameworks optimized for agent generation are becoming distinct categories with different design priorities. Treating them as one category — and evaluating agent frameworks by human-developer criteria — misses the point.

---

## 7. Multi-Agent Composition

Everything above assumes a single agent generating a complete page. This works — the evidence in Section 4 proves it. But it also has an obvious ceiling: a single agent is a single thread. A dashboard with a header, sidebar, charts, and a data table could be generated twice as fast by two agents working in parallel, or four times as fast by four.

The naive approach fails immediately. If two agents both write to the same `pages` table entry, the last write wins. There is no coordination, no conflict detection, no way for one agent to know what another is doing.

### The coordination problem

Multi-agent collaboration on a shared artifact requires three things:

1. **Mutual exclusion** — only one agent works on a given piece at a time
2. **Conflict detection** — if two agents accidentally modify the same piece, the system rejects the second write rather than silently overwriting
3. **Status visibility** — every agent can see what's claimed, what's published, and what's still open

These are classic distributed systems problems. The standard solutions involve external coordination services — Redis locks, ZooKeeper, etcd. But no∅ already has a transactional database with real-time subscriptions: Convex.

### Fragment-based composition

The solution decomposes a page into named **fragments** — slots in a template. A plan defines the template (`{{header}}{{sidebar}}{{main}}`) and the fragment list. Each agent claims a fragment atomically (Convex mutations are transactional — two agents cannot claim the same fragment in the same instant). The agent generates HTML for its fragment and publishes it with a version check. When all fragments are ready, any agent can compose — replacing placeholders with published HTML and writing the result to the `pages` table.

The composed page is served by the same HTTP routes. Nothing about the serving infrastructure changes. The collaboration happens entirely at the authoring layer.

### Why Convex

Convex provides exactly the primitives this requires:

- **Atomic transactions** — mutations execute transactionally, so claims are atomic without external locking
- **Real-time subscriptions** — agents can watch the status of all fragments and react when slots open up
- **Consistent reads** — no stale data, no eventual consistency surprises

An agent in Tokyo and an agent in San Francisco both talk to the same Convex deployment. Claims are atomic across machines. Status updates propagate in real-time. The coordination layer is the same database the platform already uses — no additional infrastructure.

### What this changes

With multi-agent composition, no∅ becomes something beyond a single-agent generation framework. Multiple agents — whether parallel processes on one machine, separate Claude Code sessions, or remote agents on different continents — coordinate through the same API. The plan-claim-publish-compose cycle works identically whether agents are co-located or distributed.

This doesn't invalidate single-agent generation. A single agent can still write a complete page via `pages:publish` and skip the collaboration system entirely. The two approaches coexist. But for larger applications where parallel generation would meaningfully reduce time-to-live, the coordination infrastructure is there.

The stale-claim timeout (10 minutes) prevents deadlocks without requiring manual intervention. Optimistic concurrency versioning prevents silent overwrites. The public status endpoint (`GET /collab/<slug>`) lets any agent check progress without needing Convex CLI access. These are pragmatic choices: the system is designed to fail safely rather than require careful orchestration.

---

## Appendix: Live Applications

The three applications from this session are publicly accessible:

- Kanban Board: `https://secret-aardvark-418.convex.site/app/kanban`
- Particle Galaxy: `https://secret-aardvark-418.convex.site/app/three-demo`
- Infinitum: `https://secret-aardvark-418.convex.site/app/infinitum`

Framework source: `github.com/eriestra/novoid`
