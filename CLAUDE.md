# CLAUDE.md

no∅ (novoid) is a self-hosting frontend platform — a CSS component library + reactive JS framework served from Convex. The full API spec lives in `skills.md`. Read it before generating any code.

## How This Repo Works

The platform is **self-hosting**: GitHub has only a minimal bootstrapper (`index.html`), and the actual platform (including itself) is stored in and served from Convex. Changes publish instantly — no git push, no CI, no deploy wait.

Users clone this repo and run `claude`. When the user describes what they want to build, generate it using no∅ — no external dependencies, no build step.

## Quick Reference

- **CSS prefix:** `nv-` (classes), `--nv-` (variables)
- **JS object:** `Novoid` (e.g. `Novoid.signal()`, `Novoid.h()`, `Novoid.mount()`)
- **Brand name in UI text:** `no∅`
- **Dark mode:** `[data-theme="dark"]` or `.nv-dark`
- **Signals:** `const [val, setVal] = Novoid.signal(initial)` — getter is a function call: `val()`
- **No virtual DOM** — fine-grained reactivity, effects auto-track dependencies
- **Router:** hash-based (`#/path`)
- **Fonts:** DM Sans (body), Outfit (headings), JetBrains Mono (code)

## Self-Hosting Architecture

```
GitHub (eriestra.github.io/novoid)         Convex Cloud
─────────────────────────────────          ────────────
index.html (~40 lines)
  │ fetch("/app/novoid")  ─────────────→  HTTP route: GET /app/:slug
                                           │ read from pages table
  document.write(html)  ◄──────────────── │ return HTML

                                         pages table:
                                           { slug: "novoid", html: "..." }
                                           { slug: "platform", html: "..." }
                                           { slug: "my-app", html: "..." }

                                         assets table:
                                           { name: "novoid.min.css", content: "..." }
                                           { name: "novoid.min.js", content: "..." }

                                         HTTP routes:
                                           GET /app/:slug → serve page
                                           GET /platform  → serve platform admin UI
                                           GET /css/:name → serve framework CSS
                                           GET /js/:name  → serve framework JS
```

- **Platform UI** (`/platform`): admin page that lists/edits/publishes pages — itself a page in the DB
- **Published pages** (`/app/:slug`): any page stored in the pages table
- **Framework assets** (`/css/`, `/js/`): novoid.min.css and novoid.min.js served from the assets table

## File Structure

```
├── CLAUDE.md          ← you read this first
├── skills.md          ← full API spec (read before generating code)
├── index.html         ← minimal bootstrapper (fetches from Convex)
├── index.full.html    ← archived original showcase page
├── src/               ← SOURCE (readable, edit these)
│   ├── novoid.css     ← CSS component library
│   ├── novoid.js      ← reactive JS framework
│   └── app/           ← user's app (Claude generates here)
│       └── platform.html ← platform admin UI source
├── dist/              ← PRODUCTION (minified, never edit)
│   ├── novoid.min.css
│   └── novoid.min.js
├── convex/            ← Convex backend
│   ├── schema.ts      ← pages + assets + keys + plans + fragments tables
│   ├── pages.ts       ← CRUD for pages (auth-gated writes)
│   ├── assets.ts      ← CRUD for assets (auth-gated writes)
│   ├── collab.ts      ← multi-agent coordination (plans, fragments, compose)
│   ├── keys.ts        ← secret management (internal only)
│   ├── seed.ts        ← internal mutations for seeding data
│   └── http.ts        ← HTTP router serving HTML/CSS/JS + /collab/:slug
├── seed.sh            ← one-time setup script
├── build.sh           ← instant minification (23ms)
└── package.json       ← convex dependency only
```

Always edit `src/`. Never edit `dist/`. Run `sh build.sh` to produce minified output.

## Dev Server

Always start with browser-sync for hot reloading. Install if not available:

```sh
which browser-sync || npm install -g browser-sync
browser-sync start --server --files "*.html,src/**/*" --port 8000 --no-notify
```

## Deployment

```sh
# 1. Start Convex dev (creates project first time)
npx convex dev

# 2. Set the publish secret (internal mutation, CLI only)
npx convex run seed:seedSecret '{"name":"PUBLISH_SECRET","value":"your-secret"}'

# 3. Seed framework assets + platform page
sh seed.sh https://YOUR-DEPLOYMENT.convex.cloud your-secret

# 4. Visit the platform
open https://YOUR-DEPLOYMENT.convex.site/platform
```

## Auth Model

All write mutations (`pages:publish`, `pages:remove`, `assets:set`) require a `secret` argument checked against `PUBLISH_SECRET` in the `keys` table. The secret is set via `npx convex run` (CLI only — never exposed to clients). Read operations are public.

## Agentic Publishing

When the user asks you to build something:

1. **Start a timer** — run `date +%s` at the very start
2. Read `skills.md` for the full no∅ API
3. Generate the HTML as `src/app/<slug>.html`
4. Publish it to Convex — instantly live, no server needed
5. **Stop the timer** — run `date +%s` again, report elapsed seconds with the live URL

**Setup** (once per session, if `node_modules/` is missing):
```sh
npm install
```

**Publish a page:**
```sh
source .env.local
HTML_JSON=$(python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" < src/app/<slug>.html)
npx convex run seed:seedPage "{\"slug\":\"<slug>\",\"html\":$HTML_JSON}"
```

**Give the user the live URL:** `https://secret-aardvark-418.convex.site/app/<slug>`

**Credentials** are in `.env.local` (gitignored, never commit or echo):
- `CONVEX_URL` — `.convex.cloud` URL
- `CONVEX_SITE_URL` — `.convex.site` URL (where pages are served)
- `PUBLISH_SECRET` — auth token for write mutations

**For auth-gated mutations** (`pages:publish`, `pages:remove`, `assets:set`), pass the secret:
```sh
source .env.local
HTML_JSON=$(python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" < src/app/<slug>.html)
npx convex run pages:publish "{\"slug\":\"<slug>\",\"html\":$HTML_JSON,\"secret\":\"$PUBLISH_SECRET\"}"
```

**CSS/JS for published pages** — reference from Convex:
```html
<link rel="stylesheet" href="../css/novoid.min.css">
<script src="../js/novoid.min.js"><\/script>
```

## Multi-Agent Collaboration

Multiple agents can work on the same page in parallel — on one machine or across remote machines. Convex coordinates everything in real-time.

### How it works

1. **Lead agent creates a plan** — defines fragments (named slots) and a template with `{{fragment-name}}` placeholders
2. **Any agent claims a fragment** — atomic lock, 10-min stale timeout
3. **Agent generates HTML** for its fragment and publishes it
4. **Any agent composes** — assembles all fragments into the final page

### Agent workflow

Generate a unique agent ID at session start:
```sh
AGENT_ID="claude-$(date +%s | tail -c 5)"
```

Check what's available:
```sh
npx convex run collab:status '{"slug":"<slug>"}'
```

Claim a fragment:
```sh
source .env.local
npx convex run collab:claim '{"slug":"<slug>","name":"<fragment>","agentId":"'$AGENT_ID'","secret":"'$PUBLISH_SECRET'"}'
```

Generate the fragment HTML as `src/app/fragments/{slug}-{name}.html`, then publish:
```sh
HTML_JSON=$(python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" < src/app/fragments/{slug}-{name}.html)
npx convex run collab:publishFragment '{"slug":"<slug>","name":"<fragment>","html":'$HTML_JSON',"expectedVersion":1,"agentId":"'$AGENT_ID'","secret":"'$PUBLISH_SECRET'"}'
```

Compose the final page:
```sh
npx convex run collab:compose '{"slug":"<slug>","secret":"'$PUBLISH_SECRET'"}'
```

### Remote agents

Any machine with the `PUBLISH_SECRET` can participate. The coordination endpoint is public:

`GET https://<deployment>.convex.site/collab/<slug>` — returns JSON status of all fragments

## Key Rules

- Always read `skills.md` for the full API before generating code
- Use `nv-` prefix for all CSS classes, `--nv-` for all CSS variables
- Signal getters are called as functions: `count()` not `count`
- No build tools, no npm, no transpilation — everything is vanilla
- Never put literal `</script>` inside a `<script>` block — use string concatenation (`'</' + 'script>'`) to avoid premature tag closure
- Never edit `convex/_generated/` — it's auto-generated by `npx convex dev`
- **CRITICAL: Never create text inputs inside `effect()` blocks.** If an input (text, textarea, etc.) is inside an effect that rebuilds the DOM, every keystroke triggers re-render → input destroyed → focus lost. Create inputs ONCE outside effects, store in a variable, and reuse. See skills.md `bind` warning and Gotcha #15.

## Convex + OpenRouter Pattern

no∅ projects use **Convex as the single backend**. The OpenRouter API key is stored in a Convex `keys` table — never in client code.

### Bootstrap sequence

1. Store the OpenRouter key in Convex DB (`keys` table, indexed by `name`)
2. Convex actions read the key via `internalQuery` and call OpenRouter server-side
3. Frontend connects with `Novoid.createClient(url)` and calls everything through Convex

### Architecture

```
Browser (no∅)          Convex Cloud           OpenRouter
─────────────          ────────────           ──────────
  useAI(send) ──────→  action:ai.chat
                        │ read key from DB
                        │ fetch OpenRouter ──→ /chat/completions
                        │ ◄──────────────────  response
  response() ◄────────  return result
```

### Convex integration APIs (in Novoid.js)

| Function | Returns | Purpose |
|---|---|---|
| `createClient(url)` | `ConvexClient` | Connect to deployment |
| `useQuery(client, ref, args?)` | `{ data, loading, error }` signals | Reactive subscription |
| `useMutation(client, ref)` | callable + `.isLoading`, `.error` | Write data |
| `useAction(client, ref)` | callable + `.isLoading`, `.error` | Run server action |
| `useAI(client, ref)` | callable + `.response`, `.isLoading`, `.error`, `.history`, `.clear()` | AI action with conversation state |
| `useAuth(client, fetchToken)` | `{ isAuthenticated, isLoading, logout }` | Auth state |
| `useConnectionState(client)` | signal getter | Connection monitor |

### Key conventions

- Convex CDN bundle loaded via `<script src="https://unpkg.com/convex@latest/dist/browser.bundle.js"></script>` — before app script
- Key storage: `keys` table with `name`/`value` fields, `by_name` index. Key reads use `internalQuery` (never exposed to client)
- AI actions: read key from DB → call `https://openrouter.ai/api/v1/chat/completions` → return result
- `useAI` over `useAction` when you need response persistence, conversation history, or a clear/reset
- Full API docs and Tutorial 7 (AI Chat) are in `skills.md`
