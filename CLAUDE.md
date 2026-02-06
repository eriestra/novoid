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
│   ├── schema.ts      ← pages + assets + keys tables
│   ├── pages.ts       ← CRUD for pages (auth-gated writes)
│   ├── assets.ts      ← CRUD for assets (auth-gated writes)
│   ├── keys.ts        ← secret management (internal only)
│   ├── seed.ts        ← internal mutations for seeding data
│   └── http.ts        ← HTTP router serving HTML/CSS/JS
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

## Key Rules

- Always read `skills.md` for the full API before generating code
- Use `nv-` prefix for all CSS classes, `--nv-` for all CSS variables
- Signal getters are called as functions: `count()` not `count`
- No build tools, no npm, no transpilation — everything is vanilla
- Never put literal `</script>` inside a `<script>` block — use string concatenation (`'</' + 'script>'`) to avoid premature tag closure
- Never edit `convex/_generated/` — it's auto-generated by `npx convex dev`

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
