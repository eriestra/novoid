# no∅ Agent-First — Spec

> Novoid is an AI agent framework for building and deploying AI-enabled apps instantly via CLI + Convex.

## Vision

Novoid is **the framework AI agents use to build web apps**. Not a visual builder. Not a chatbot wrapper. A reactive frontend framework designed so that:

1. **An AI agent (Claude Code) is the primary developer** — CLAUDE.md + AGENTS.md are the IDE
2. **Apps deploy instantly** — `sh publish.sh slug file` → live URL in seconds, no CI/CD
3. **Every app is testable by agents** — MCP endpoints + novoid-browser enable full E2E testing without a real browser
4. **The CLI is the top-tier experience** — `claude` in the repo is the entire workflow

## What We're Keeping

### Core Framework
- `src/core.js` — reactive signals, effects, computed, h(), list, when, match, mount
- `src/core.css` + `src/components.css` — full component library
- `src/plugins/` — router, convex, auth, toast
- `dist/` — minified output via `build.sh`

### Convex Backend
- `convex/` — pages, assets, auth, orgs, errors, keys, collab, jobs, notes, schema, http, lib, seed, crons
- Self-hosting architecture: pages table → HTTP routes → live apps
- Auth model (PUBLISH_SECRET gated writes, public reads)

### Verification Pipeline
- `verify.sh` — Nous (static) + novoid-browser (empirical)
- `publish.sh` — generate → verify → publish → sentinel loop
- `nous/` — static analysis engine (structure, cascade, reactivity)
- `browser/` — headless QuickJS executor + MCP test harness

### MCP Layer
- Auto-generated MCP endpoints per published app (`/mcp/:slug`)
- Tools = store actions + Convex mutations/actions
- Resources = signals + stores + Convex queries
- Streamable HTTP transport, JSON-RPC

### CLI Experience Files
- `CLAUDE.md` — primary developer instructions (Claude Code reads this on session start)
- `AGENTS.md` — model-agnostic agent instructions
- `spec.md` — API reference (<300 lines)

## What We're Dropping

| Dropped | Reason |
|---|---|
| Vox (`vox-watch.js`, `src/app/vox.test.json`) | Voice builder — orthogonal to agent-first story |
| Nex (`nex-watch.js`, `convex/nex.ts`, `convex/nexCloud.ts`, `convex/nexMemory.ts`) | Autonomous agent runtime — separate concern, can live in its own repo |
| Nex schema tables (`nex_*`) | All nex-related Convex tables |
| Nex specs (`specs/nex*.md`) | All nex architecture docs |
| Nex HTTP routes | `/nex/*` routes in `http.ts` |

## Three Pillars

### 1. CLI-First Development (`CLAUDE.md` + `AGENTS.md`)

The developer experience IS the CLI. When you run `claude` in this repo:

```
User: "Build me a task manager with AI categorization"
Claude: [reads skills/, generates HTML, publishes, returns live URL in <30s]
```

Key files:
- **CLAUDE.md** — session startup, conventions, publishing workflow, verification pipeline
- **AGENTS.md** — model-agnostic version for non-Claude agents
- **spec.md** — the complete API reference that agents read before generating

The quality of these three files directly determines the quality of generated apps.

### 2. Instant Deploy (`publish.sh` + Convex)

Zero-friction publishing:

```
sh publish.sh todo src/app/todo.html
```

This single command:
1. Runs Nous static analysis
2. Runs novoid-browser headless execution
3. Publishes to Convex (live instantly)
4. Runs post-publish E2E (sentinel + MCP schema check)
5. Prints live URL + MCP URL

No git push. No CI. No deploy queue. The app is live the moment verification passes.

### 3. Agent-Testable Apps (MCP + novoid-browser)

Every published app automatically gets an MCP interface that other agents can use:

```
GET  /mcp/todo  → { tools: [...], resources: [...] }
POST /mcp/todo  → JSON-RPC (tools/call, resources/read)
```

**E2E testing without a browser:**

```sh
# Headless execution
novoid-browser src/app/todo.html --peek

# Seed Convex data
novoid-browser src/app/todo.html --seed "tasks:list" '[{"text":"Buy milk"}]' --peek

# Run assertions
novoid-browser src/app/todo.html --assert 'store_0.tasks.length > 0'

# MCP test specs
novoid-browser --test src/app/todo.test.json src/app/todo.html
```

**Agentic browsing** — an AI agent can:
1. Read the MCP manifest to understand an app's capabilities
2. Call tools to interact with the app (add items, trigger actions)
3. Read resources to verify state
4. All without launching a browser

## File Structure (Post-Cleanup)

```
├── CLAUDE.md          ← CLI developer experience (primary)
├── AGENTS.md          ← model-agnostic agent docs
├── spec.md            ← API reference
├── index.html         ← bootstrapper
├── publish.sh         ← instant deploy
├── verify.sh          ← verification pipeline
├── build.sh           ← minification
├── seed.sh            ← one-time setup
├── src/
│   ├── core.js        ← reactive framework
│   ├── core.css       ← CSS foundations
│   ├── components.css ← CSS components
│   ├── plugins/       ← router, convex, auth, toast
│   └── app/           ← generated apps
├── dist/              ← minified output
├── convex/            ← Convex backend (no nex tables)
├── browser/           ← novoid-browser (headless + MCP test harness)
├── nous/              ← Nous static analysis
└── specs/             ← architecture specs (no nex specs)
```

## Success Metrics

- **Time to live app**: <30s from user description to published URL
- **Agent test coverage**: every app publishable = every app MCP-testable
- **Zero external deps**: no npm in generated apps, no build tools, vanilla HTML/CSS/JS
- **Doc quality**: CLAUDE.md + AGENTS.md + spec.md = everything an agent needs

## Next Steps

1. Remove vox/nex files from this branch
2. Clean nex tables from `convex/schema.ts`
3. Clean nex routes from `convex/http.ts`
4. Update CLAUDE.md — remove Vox/Nex sections, sharpen agent-first narrative
5. Update AGENTS.md — same cleanup
6. Build a showcase app that demonstrates the MCP testing loop
7. Write a proper README.md focused on the agent-first story
