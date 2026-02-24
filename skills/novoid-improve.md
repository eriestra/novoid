# novoid-improve

Meta-skill for maintaining system consistency. When expanding any no∅ feature, follow this checklist.

## Feature Expansion Checklist

Every feature change touches multiple surfaces. Work through each applicable item:

### 1. Source Code
- [ ] `src/core.js` — reactive core (signals, computed, effect, h(), createStore, mount)
- [ ] `src/plugins/render.js` — declarative renderer (sections, bindings, formats)
- [ ] `src/core.css` — CSS variables and utilities
- [ ] `src/components.css` — CSS component classes
- [ ] `convex/` — schema, functions, HTTP routes
- [ ] `cdp/` — CDP browser automation (Rust crate)

### 2. Skills (codified knowledge — always in agent context)
- [ ] `skills/novoid-core.md` — core API reference
- [ ] `skills/novoid-render.md` — render plugin reference
- [ ] `skills/novoid-css.md` — design system reference
- [ ] `skills/novoid-publishing.md` — publish pipeline reference
- [ ] `skills/novoid-verification.md` — verification pipeline reference
- [ ] `skills/novoid-agents.md` — agent system reference
- [ ] `skills/novoid-math.md` — KaTeX integration reference
- [ ] `skills/novoid-cdp.md` — CDP browser control reference
- [ ] `skills/novoid-improve.md` — this file (if checklist itself changes)

### 3. Agent Configuration
- [ ] `CLAUDE.md` — skills index, conventions, commands, workflow
- [ ] `AGENTS.md` — architecture overview, quick reference, agent instructions
- [ ] `.claude/agents/*.md` — persona-specific instructions

### 4. Documentation (human-facing)
- [ ] `README.md` — project overview, getting started
- [ ] `AGENTS.md` — architecture overview for external agents

### 5. Specs (architectural records)
- [ ] `specs/novoid-whitepaper.md` — architectural thesis
- [ ] `specs/agent-first.md` — agent-first design spec
- [ ] `specs/delta-sync.md` — delta sync specification

### 6. Build & Deploy
- [ ] `sh build.sh` — rebuild minified output
- [ ] `sh seed.sh` — upload framework assets to Convex
- [ ] Republish affected apps via `sh publish.sh`

### 8. Agent SEO
- [ ] `llms.txt` — LLM-readable site description
- [ ] `AGENTS.md` — discoverable at repo root
- [ ] HTTP `Accept` content negotiation on Convex routes

---

## Consistency Rules

1. **Skills are source of truth for agents.** Any API change must update the corresponding skill first. Skills replace reading source files.
2. **Specs are source of truth for humans.** spec.md and render.md remain the canonical API reference for human readers.
3. **Skills and specs must agree.** If they diverge, the source code is the tiebreaker.
4. **Every app gets a test spec.** `<slug>.test.json` next to `<slug>.html`.
5. **Every fix ends with publish.** Source → build → seed → publish.
6. **CLAUDE.md is the entry point.** It must reflect the current skills index and conventions.
7. **AGENTS.md is the public face.** It must be discoverable and accurate for external agents.

---

## When to Use This Checklist

| Change Type | Minimum Surfaces |
|---|---|
| New core API | source, novoid-core skill, spec.md, CLAUDE.md conventions |
| New render section | source, novoid-render skill, render.md |
| New CSS component | source, novoid-css skill, components.css |
| New shell command | novoid-publishing skill, CLAUDE.md commands |
| New verification rule | source, novoid-verification skill, novoid-publishing skill |
| New agent feature | source, novoid-agents skill, AGENTS.md |
| Architecture change | whitepaper, AGENTS.md, README.md |
| New skill added | skill file, CLAUDE.md skills index, AGENTS.md |

---

## Agent SEO Readiness

For maximum discoverability by AI agents:

1. **`AGENTS.md` at repo root** — architecture, capabilities, API surface. This is the standard agents discover first.
2. **`llms.txt` at site root** — served via Convex HTTP routes. Concise site description for LLM crawlers.
3. **Content negotiation** — `Accept: application/json` on HTTP routes returns structured data.
4. **MCP endpoints** — every published app with a store gets `/mcp/:slug` automatically.
5. **Skills in repo** — `skills/` directory with codified knowledge files. Agents that clone the repo get full context.
6. **CLAUDE.md** — Claude Code and similar tools read this on session start.
