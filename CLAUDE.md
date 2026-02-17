# CLAUDE.md

no∅ (novoid) — frictionless frontend framework. Describe it, it's live.

> Skill-led reasoning. Skills are the source of truth — codified, compressed, always in context. When skills and pre-training agree, you're on the right path. When they diverge, skills win.

## Skills Index

```
[novoid skills]|root: skills/
|novoid-core.md         — signals, computed, effect, batch, h(), list, when, match, createStore, mount, createForm, useAsync
|novoid-render.md       — declarative UI: sections, $expressions, formats, views, navigation, panels, data bindings, hybrid apps
|novoid-css.md          — nv-* classes, --nv-* variables, components, layout, theming, dark mode, animations
|novoid-publishing.md   — publish.sh, verify.sh, url.sh, build.sh, seed.sh, MCP endpoints, test specs, sentinel errors
|novoid-verification.md — Nous static analysis, novoid-browser headless execution, MCP test harness
|novoid-agents.md       — Nex, Vox, personas, memory, multi-channel, inline apps
|novoid-math.md         — KaTeX integration, TeX notation, MathML visibility fix
|novoid-convex.md       — Convex client, reactive queries, mutations, actions, AI helper
|novoid-improve.md      — feature expansion checklist, consistency rules, agent SEO
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
|convex/http.ts         — HTTP routes (/app/:slug, /mcp/:slug, /platform, /css, /js)
```

Skills are the codified knowledge. Source files are the implementation. Read skills first. Read source only when editing framework internals.

## Session Setup

On first command that needs credentials or dependencies:

1. Load credentials: `PUBLISH_SECRET=$(grep '^PUBLISH_SECRET=' .env.local | cut -d= -f2)`
2. If no `node_modules/`, run `npm install` in background
3. If no `.env.local`, tell user to run setup from README.md

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
