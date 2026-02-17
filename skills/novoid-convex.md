# novoid-convex

Data layer — connecting no∅ apps to Convex backends with reactive queries, mutations, actions, and AI.

## Competencies

### 1. Client Setup
- `Novoid.createClient(url)` — connect to a Convex deployment
- Script loading order: Convex CDN → core.min.js → convex.min.js → auth.min.js → toast.min.js
- Connection state monitoring: `useConnectionState(client)`

### 2. Reactive Queries
- `useQuery(client, ref, args?)` — returns `{ data, loading, error }` signals
- `data()` is `undefined` until loaded — always default: `(data() ?? []).map(...)`
- Skip pattern: `useQuery(db, ref, 'skip')` or `useQuery(db, ref, () => id() ? { id: id() } : 'skip')`
- Queries auto-update when backend data changes (real-time subscriptions)

### 3. Mutations & Actions
- `useMutation(client, ref)` — returns callable + `.isLoading()`, `.error()`
- `useAction(client, ref)` — for server-side logic (AI calls, external APIs)
- `useAI(client, ref)` — AI action with `.response()`, `.isLoading()`, `.history()`, `.clear()`

### 4. Authentication
- `useNovoidAuth(client)` — `auth.user()`, `auth.isAuthenticated()`, `auth.register()`, `auth.login()`, `auth.logout()`, `auth.getToken()`
- `useOrg(client, auth)` — `org.orgs()`, `org.currentOrg()`, `org.currentRole()`, `org.switchOrg(id)`
- Session-based (SHA-256 tokens, 7-day expiry), no cookies

### 5. Backend Schema & Functions
- Schema definition in `convex/schema.ts` with table definitions and indexes
- Query/mutation/action patterns in Convex functions
- Auth gating with `PUBLISH_SECRET` for write operations
- `keys` table for secret storage (API keys read via `internalQuery`)

## Evaluation Criteria

| Level | Description |
|---|---|
| **Novice** | Can connect a client, use useQuery to display data, call a mutation |
| **Competent** | Handles loading/error states, uses skip pattern, implements auth flow |
| **Proficient** | Builds full CRUD apps with real-time updates, uses useAI for AI features, manages org-scoped data |
| **Expert** | Designs Convex schemas, writes backend functions, implements the OpenRouter pattern (key in DB, server-side AI calls), uses headless Convex testing |

## Test Scenarios

1. **Read-only dashboard** — useQuery to display a list, loading spinner while fetching, error handling.
2. **CRUD app** — useQuery + useMutation for create/read/update/delete with optimistic UI.
3. **Auth-gated app** — login/register flow, protected content, org switching.
4. **AI chat** — useAI with conversation history, clear, loading states.
5. **Headless verification** — novoid-browser with `--seed` for query data, `--push` for live updates, `--assert` for state.

## Conventions

- Load Convex CDN bundle before core.min.js (the client constructor depends on it)
- Default `data()` with `?? []` or `?? null` — it's `undefined` until the first server response
- Use the skip pattern when query args depend on other async state
- API keys belong in the Convex `keys` table, read server-side via `internalQuery` (verify.sh checks for secret leaks in HTML)
