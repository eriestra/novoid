# novoid npm distribution

> Spec: how `npm install novoid` + `npx novoid init` turns novoid into an installable package with its own Convex backend.

## 1. Package structure

```
novoid/
  dist/                   # pre-built minified assets
    core.min.js
    core.min.css
    components.min.css
    render.min.js
    router.min.js
    convex.min.js
    auth.min.js
    toast.min.js
  skills/                 # full skills directory (read-only reference)
    novoid-core.md
    novoid-render.md
    novoid-css.md
    novoid-publishing.md
    novoid-verification.md
    novoid-agents.md
    novoid-math.md
    novoid-convex.md
    novoid-motion.md
    novoid-cdp.md
    novoid-improve.md
  convex-template/        # Convex functions for user's deployment
    schema.ts             # minimal schema (pages, assets, keys, errors)
    pages.ts              # publish, get, list, remove
    assets.ts             # set, get
    errors.ts             # log, recent, clear
    seed.ts               # seedSecret, seedAsset
    http.ts               # /app/:slug, /mcp/:slug, /css, /js routes
    markdown.ts           # htmlToMarkdown helper (used by MCP)
  bin/
    novoid.mjs            # CLI entry point (npx novoid init)
  scripts/
    publish.sh
    verify.sh
    build.sh
    url.sh
    seed.sh
  CLAUDE.md.template      # generated per-project CLAUDE.md
  package.json
```

### What does NOT ship

- `nous/` (static analyzer) — optional, installed separately
- `browser/` (Rust headless verifier) — optional, installed separately
- `nex_*` tables, `jobs`, `documents`, `plans`, `fragments`, `users`, `sessions`, `organizations`, `orgMemberships`, `orgInvitations`, `notes`, `domains`, `files`, `nex_*` — these are Nex ecosystem tables, not needed for standalone novoid
- `src/app/` examples — the monorepo's apps don't ship

## 2. `npx novoid init`

### Flow

```
$ npx novoid init

no∅ — frictionless frontend framework

1. Creating project structure...
   ✓ convex/schema.ts
   ✓ convex/pages.ts
   ✓ convex/assets.ts
   ✓ convex/errors.ts
   ✓ convex/seed.ts
   ✓ convex/http.ts
   ✓ convex/markdown.ts
   ✓ src/app/          (your apps go here)
   ✓ publish.sh
   ✓ verify.sh
   ✓ build.sh
   ✓ url.sh
   ✓ seed.sh
   ✓ .gitignore

2. Setting up Convex...
   → Running: npx convex init
   → Deployment URL: https://<your-deployment>.convex.cloud
   → Site URL: https://<your-deployment>.convex.site

3. Generating credentials...
   → PUBLISH_SECRET: (random 32-char hex)
   → Writing .env.local

4. Seeding framework assets...
   → Running: sh seed.sh
   ✓ core.min.css, components.min.css
   ✓ core.min.js, render.min.js, router.min.js, convex.min.js, auth.min.js, toast.min.js

5. Generating CLAUDE.md...
   ✓ CLAUDE.md (points to node_modules/novoid/skills/)

Done! Your no∅ instance is live.

  Create an app:  Write src/app/hello.html
  Publish:        sh publish.sh hello src/app/hello.html
  View:           https://<your-deployment>.convex.site/app/hello
```

### CLI details

- **`npx novoid init`** — full setup (Convex provisioning + seed + CLAUDE.md)
- **`npx novoid init --skip-convex`** — skip Convex provisioning (user already has a deployment)
- **`npx novoid init --no-seed`** — skip seeding (user will seed manually)

### What `init` does NOT do

- Install `nous` or `novoid-browser` — these are optional verification tools
- Create any example apps — the project starts empty
- Touch an existing `convex/` directory — if `convex/schema.ts` exists, abort with instructions

## 3. Minimal schema

The npm package ships a minimal schema with only the tables needed to run novoid apps:

```typescript
// convex-template/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  pages: defineTable({
    slug: v.string(),
    html: v.string(),
    updatedAt: v.number(),
    browserSchema: v.optional(v.string()),
    nousReport: v.optional(v.string()),
    iframeOrigins: v.optional(v.array(v.string())),
  }).index("by_slug", ["slug"]),

  assets: defineTable({
    name: v.string(),
    content: v.string(),
    contentType: v.string(),
  }).index("by_name", ["name"]),

  keys: defineTable({
    name: v.string(),
    value: v.string(),
  }).index("by_name", ["name"]),

  errors: defineTable({
    slug: v.string(),
    message: v.string(),
    source: v.optional(v.string()),
    line: v.optional(v.number()),
    col: v.optional(v.number()),
    stack: v.optional(v.string()),
    type: v.string(),
    timestamp: v.number(),
    userAgent: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_slug_time", ["slug", "timestamp"]),
});
```

4 tables. No Nex, no users, no orgs, no jobs, no documents. Users who want Nex can add those tables later via a separate `npx novoid add nex` command (future spec).

## 4. Portable scripts

Scripts are templated during `init` with the user's deployment URLs. They read from `.env.local` (same pattern as the monorepo).

### publish.sh

Identical logic to the monorepo's `publish.sh` but:
- Resolves `verify.sh` relative to the project root (not monorepo)
- Locked slugs list is empty by default (user hasn't set any)
- `CONVEX_SITE_URL` comes from `.env.local`

### verify.sh

Runs Nous if `nous/` exists, runs novoid-browser if the binary exists. Both are optional — if neither is installed, verify.sh prints a warning and passes.

### build.sh

Same as monorepo. Minifies `src/` → `dist/` using esbuild. Only needed if the user edits framework source (rare).

### seed.sh

Uploads assets from `node_modules/novoid/dist/` instead of the monorepo's `dist/`. Same Convex calls.

### url.sh

Unchanged — reads from `.env.local` and prints the URL.

### .env.local template

```sh
CONVEX_URL=https://<deployment>.convex.cloud
CONVEX_SITE_URL=https://<deployment>.convex.site
PUBLISH_SECRET=<generated-hex>
```

## 5. Skills distribution

Skills ship inside the npm package at `node_modules/novoid/skills/`. The generated `CLAUDE.md` points there:

```markdown
## Skills Index

\```
[novoid skills]|root: node_modules/novoid/skills/
|novoid-core.md         — signals, computed, effect, ...
|novoid-render.md       — declarative UI: sections, ...
|novoid-css.md          — nv-* classes, --nv-* variables, ...
...
\```
```

### Why skills ship in the package

- Agent tools (Claude Code, Cursor, etc.) read `CLAUDE.md` → discover skills → load them as context
- Skills are the source of truth — they must be versioned with the framework
- `npm update novoid` updates both `dist/` and `skills/` atomically

### Certified skills

`skills/certified/` also ships. These are Convex-specific patterns that apply to any novoid Convex deployment.

## 6. Agent path vs human path

### Agent path (primary)

1. Agent reads the project's `CLAUDE.md`
2. Discovers skills at `node_modules/novoid/skills/`
3. Loads relevant skills into context
4. Generates `src/app/<slug>.html` + `src/app/<slug>.test.json`
5. Runs `sh publish.sh <slug> src/app/<slug>.html`
6. Returns the live URL

The agent never needs to understand Convex internals, CSS tooling, or build pipelines. Skills encode everything.

### Human path

1. `npm install novoid`
2. `npx novoid init`
3. Read the getting-started section in `CLAUDE.md` (or the README)
4. Write HTML files in `src/app/` using novoid's declarative render syntax
5. `sh publish.sh`

### Discovery

| Channel | Agent | Human |
|---------|-------|-------|
| npm registry | `npm install novoid` | `npm install novoid` |
| CLAUDE.md | Auto-read by agent tools | Read manually |
| Skills | Loaded as context | Reference docs |
| CDN | Framework assets served by their own Convex | Same |

## 7. CDN fallback

Apps reference novoid assets via `<script>` and `<link>` tags. Two modes:

### Self-hosted (default after `init`)

```html
<link rel="stylesheet" href="/css/core.min.css">
<link rel="stylesheet" href="/css/components.min.css">
<script src="/js/core.min.js"></script>
<script src="/js/render.min.js"></script>
```

These resolve to the user's own Convex site URL (`https://<their-deployment>.convex.site/css/...`). Assets are served from their `assets` table, seeded during `init`.

### Central CDN (no Convex required)

```html
<link rel="stylesheet" href="https://secret-aardvark-418.convex.site/css/core.min.css">
<link rel="stylesheet" href="https://secret-aardvark-418.convex.site/css/components.min.css">
<script src="https://secret-aardvark-418.convex.site/js/core.min.js"></script>
<script src="https://secret-aardvark-418.convex.site/js/render.min.js"></script>
```

This uses the canonical novoid deployment as a CDN. Useful for:
- Quick prototyping without running `init`
- Static HTML files that don't need their own Convex backend
- Embedding novoid apps in other sites

### Trade-offs

| | Self-hosted | Central CDN |
|---|---|---|
| Setup | `npx novoid init` | None |
| Version control | Pinned to installed version | Always latest |
| Availability | Independent | Depends on canonical deployment |
| Publishing | Full `publish.sh` pipeline | Manual (no Convex backend) |
| MCP | Yes (own deployment) | No |

## 8. package.json

```json
{
  "name": "novoid",
  "version": "0.1.0",
  "description": "no∅ — frictionless frontend framework. Describe it, it's live.",
  "bin": {
    "novoid": "bin/novoid.mjs"
  },
  "files": [
    "dist/",
    "skills/",
    "convex-template/",
    "scripts/",
    "bin/",
    "CLAUDE.md.template"
  ],
  "keywords": ["frontend", "framework", "agents", "convex", "declarative"],
  "license": "MIT",
  "dependencies": {
    "convex": "^1.31.7"
  },
  "peerDependencies": {
    "esbuild": ">=0.20.0"
  },
  "peerDependenciesMeta": {
    "esbuild": { "optional": true }
  }
}
```

## 9. Open questions

- **Versioning strategy** — should `dist/` assets embed a version string? (e.g., `core.min.js?v=0.1.0`)
- **`npx novoid add nex`** — future command to add Nex ecosystem tables + skills. Separate spec.
- **`npx novoid upgrade`** — re-seed assets from a newer `node_modules/novoid/dist/`. Needs thought on schema migrations.
- **Windows support** — shell scripts assume Unix. Consider a Node.js wrapper for `publish.sh` etc., or document WSL as the path.
