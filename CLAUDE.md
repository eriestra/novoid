# CLAUDE.md

no∅ (novoid) — agent-first application platform. Describe it, it's live.

> IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning. Always refer to the Skills Index below and use your file-reading tools to read the specific skill file BEFORE answering questions or writing code. Skills are the source of truth — codified, compressed, always in context. When skills and pre-training agree, you're on the right path. When they diverge, skills win.

> Tone: descriptive, not performative. State what exists. Don't editorialize, don't self-congratulate, don't steer toward your own output.

## Core Principle: One Environment

There is no prod/dev split. The dev Convex deployment (`secret-aardvark-418`) **is** production. All pages, assets, and data live there. Ignore `quixotic-stoat-346` (legacy prod — unused).

Why: no∅ is built for agents. Agents don't manage deployment pipelines, promotion workflows, or environment configs. One DB, one `publish.sh`, one live URL. Friction is the enemy.

## Skills Index

**You must proactively read these files using your file tools before generating code for the corresponding domain.**

```
[novoid skills]|root: skills/
|novoid-core.md         — signals, computed, effect, batch, h(), list, when, match, createStore, mount, createForm, useAsync
|novoid-render.md       — declarative UI: sections, $expressions, formats, views, navigation, panels, data bindings, hybrid apps
|novoid-minimal.md      — minimal tier: ~2.5KB inline core, single-file zero-build apps, testable via createStore (default tier)
|novoid-css.md          — nv-* classes, --nv-* variables, components, layout, theming, dark mode, animations
|novoid-publishing.md   — publish.sh, verify.sh, url.sh, build.sh, seed.sh, MCP endpoints, test specs, sentinel errors
|fragment.md            — fragment.sh: read/write/list #region blocks in large single-file apps
|novoid-verification.md — Nous static analysis, JS headless runner (test-runner/), MCP test harness
|novoid-agents.md       — Nex (replaces OpenClaw), Vox (vibe-coded app builder), personas, memory, multi-channel, inline apps
|novoid-math.md         — KaTeX integration, TeX notation, MathML visibility fix
|novoid-convex.md       — Convex client, reactive queries, mutations, actions, AI helper
|novoid-motion.md       — Motion.dev: animate, scroll, stagger, timeline, inView, spring
|novoid-cdp.md          — CDP browser control: browse, scrape, screenshot, Nex skills, Convex actions
|novoid-improve.md      — feature expansion checklist, consistency rules, agent SEO
|novoid-security.md     — supply chain threat model, TanStack postmortem analysis, convex/vitest/esbuild risk, hardening checklist
```

```
[certified skills]|root: skills/certified/
|convex-agents.md           — Convex agent patterns, scheduling, crons, HTTP actions
|convex-best-practices.md   — Convex idiomatic patterns, error handling, performance
|convex-functions.md        — queries, mutations, actions, internal functions, validators
|convex-realtime.md         — subscriptions, optimistic updates, reactive queries
|convex-schema-validator.md — schema design, indexes, validators, migrations
```

```
[source files]|root: ./
|src/core.js            — reactive core source (skills/novoid-core.md is the codified reference)
|src/plugins/render.js  — declarative renderer source (skills/novoid-render.md is the codified reference)
|src/core.css           — CSS variables and utilities (skills/novoid-css.md is the codified reference)
|src/components.css     — CSS component classes (skills/novoid-css.md is the codified reference)
|convex/schema.ts       — DB tables (pages, assets, keys, plans, errors, fragments, users, sessions, orgs, orgMemberships, orgInvitations, notes, domains, jobs)
|convex/http.ts         — HTTP routes (/app/:slug, /mcp/:slug, /cdp/*, /platform, /css, /js)
|convex/cdp.ts          — CDP Convex actions: browse, screenshot, script (Node.js runtime)
```

Skills are the codified knowledge. Source files are the implementation. Read skills first. Read source only when editing framework internals.

## Session Setup

On first command that needs credentials or dependencies:

1. Load credentials: `PUBLISH_SECRET=$(grep '^PUBLISH_SECRET=' .env.local | cut -d= -f2)`
2. If no `node_modules/`, run `npm install` in background
3. If no `.env.local`, tell user to run setup from README.md
4. If no `dist/` or `src/js` symlink, run `sh build.sh` (creates minified assets + symlinks)
5. If no `nous/node_modules/`, run `cd nous && npm install` (Nous static analyzer)
6. Headless verification (browse + test) runs via `test-runner/novoid-test.mjs` — pure Node, no build, no install
7. Ecosystem apps (nex, vox, novoid) are auto-deployed by `seed.sh` on first run. Protected slugs — cannot be deleted, require `--force` to republish.

## Workflow

**Render apps (preferred)** — declarative UI, zero CSS/h() calls:
```
generate src/app/<slug>.html (store + N.render()) → generate src/app/<slug>.test.json → sh publish.sh → live URL
```

**Hybrid apps** — h() shell + render sections (landing pages with forms/auth):
```
generate src/app/<slug>.html (h() shell + N.render() sections, separate mount points) → generate src/app/<slug>.test.json → sh publish.sh → live URL
```

**Classic apps** — imperative h() calls with full CSS control:
```
generate src/app/<slug>.html (signals + h() + mount) → generate src/app/<slug>.test.json → sh publish.sh → live URL
```

**Editing framework source** (`src/core.js`, `src/plugins/*.js`, `src/*.css`):
```
edit src/ → sh build.sh → sh seed.sh "$CONVEX_URL" "$PUBLISH_SECRET" → sh publish.sh affected apps
```

Every fix ends with publish. URLs come from `publish.sh` output or `sh url.sh <slug>`.

## Commands

```sh
PUBLISH_SECRET=$(grep '^PUBLISH_SECRET=' .env.local | cut -d= -f2)
CONVEX_URL=$(grep '^CONVEX_URL=' .env.local | cut -d= -f2)
sh publish.sh <slug> src/app/<slug>.html       # verify + publish + post-publish E2E
sh url.sh <slug>                               # look up URLs
sh verify.sh src/app/<slug>.html               # verify without publishing
sh build.sh                                    # minify src/ → dist/
sh seed.sh "$CONVEX_URL" "$PUBLISH_SECRET"     # upload framework assets after editing src/
sh fragment.sh <file> --list                   # list #region blocks with line numbers
sh fragment.sh <file> <region>                 # read a region to stdout
sh fragment.sh <file> <region> <infile>        # replace region content from infile
```

## Conventions

- CSS: `nv-` prefix, `--nv-` variables — full reference in `skills/novoid-css.md`
- JS: `Novoid.*` namespace — full API in `skills/novoid-core.md`
- Render sections: full spec in `skills/novoid-render.md`
- Brand: `no∅` in UI text (literal Unicode, the Edit tool writes raw bytes)
- Dark mode: `[data-theme="dark"]` or `.nv-dark`
- Fonts: DM Sans (body), Outfit (headings), JetBrains Mono (code)
- Router: hash-based (`#/path`)
- Hosting: Convex (CSP-enabled) — safe arithmetic parsers for expressions
- Secrets: `.env.local` for credentials, `keys` table for API keys (read via `internalQuery`)
- Signal getters are functions: `count()` not `count`
- Named signals: `signal(0, 'count')` — unnamed → `signal_0` in MCP
- Store actions return partial state — auto-merged via `Object.assign`
- Script tag boundary: `'</' + 'script>'` in JS strings
- Always generate `.test.json` alongside every app
- Testable apps use `createStore` — store actions become MCP tools

## Auth-Gated Mutations

All write mutations (`pages:publish`, `pages:remove`, `assets:set`) require `secret` arg checked against `PUBLISH_SECRET`. Read operations are public.

## Sentinel Errors

```sh
npx convex run errors:recent '{"slug":"<slug>"}'
npx convex run errors:clear '{"slug":"<slug>","secret":"'$PUBLISH_SECRET'"}'
```

## Multi-Agent Collaboration

```sh
AGENT_ID="claude-$(date +%s | tail -c 5)"
npx convex run collab:status '{"slug":"<slug>"}'
npx convex run collab:claim '{"slug":"<slug>","name":"<fragment>","agentId":"'$AGENT_ID'","secret":"'$PUBLISH_SECRET'"}'
npx convex run collab:compose '{"slug":"<slug>","secret":"'$PUBLISH_SECRET'"}'
```
