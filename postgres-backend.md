# no∅ PostgreSQL Backend Runtime Spec

Status: design spec  
Scope: replace Convex as the backend runtime by building a no∅ runtime on PostgreSQL  
Non-goal: make PostgreSQL alone behave like Convex

## 1. Purpose

no∅ currently uses Convex as a combined database, function runtime, HTTP host, realtime transport, scheduler, file store, and deployment target. PostgreSQL can replace the durable data layer, but the platform still needs a runtime around it.

This spec defines that runtime.

The goal is not to clone Convex. The goal is to preserve the no∅ developer and agent contract:

```js
const client = Novoid.createClient(BACKEND_URL);
const query = Novoid.useQuery(client, "pages:get", { slug });
const publish = Novoid.useMutation(client, "pages:publish");
const browse = Novoid.useAction(client, "cdp:browse");
```

Apps, agents, MCP clients, and publish scripts should keep using query, mutation, action, publish, MCP, and live URL concepts. The implementation underneath becomes PostgreSQL-backed.

## 2. Design Principles

- One environment. The live PostgreSQL database is production.
- Preserve no∅ semantics before preserving Convex names.
- PostgreSQL is the source of truth; the no∅ runtime owns behavior.
- No ORM dependency in the core path unless it proves simpler than SQL.
- Mutations are transactional.
- Actions are side-effecting and may call external services.
- Realtime is invalidation-based, not magical dependency inference at first.
- Publish remains the central deployment primitive.
- Slugs remain the branch model.
- Verification still precedes publish.
- Secrets never cross into frontend code.

## 3. Runtime Shape

```txt
PostgreSQL
  tables
  transactions
  indexes
  pgvector
  full-text search
  LISTEN/NOTIFY

novoid-server
  HTTP routes
  query/mutation/action registry
  auth/session handling
  realtime subscriptions
  publish pipeline
  MCP JSON-RPC router
  scheduler
  job queue
  file storage adapter
  version-control pipeline
  billing routes

novoid-worker
  async actions
  scheduled jobs
  agent jobs
  embedding/summarization
  CDP jobs
  external API calls

novoid-client
  createClient
  useQuery
  useMutation
  useAction
  useAI
  auth helpers
```

The runtime can start as a single Node/Bun process plus a worker process. It should be split by responsibility only when operational pressure requires it.

## 4. Public Compatibility Contract

### 4.1 Client API

The frontend contract should remain:

```js
const client = Novoid.createClient(url);
Novoid.useQuery(client, name, argsOrFn);
Novoid.useMutation(client, name);
Novoid.useAction(client, name);
Novoid.useAI(client, name);
```

Required behavior:

- `useQuery` returns `{ data, loading, error }` signals.
- Query data is initially `undefined`.
- The skip pattern remains supported: return `"skip"` from args function.
- Mutations return promises.
- Actions return promises and may stream for AI helpers.
- Auth helpers expose reactive `user()` and `isAuthenticated()`.

### 4.2 Function Types

```ts
type QueryHandler = (ctx, args) => Promise<unknown>;
type MutationHandler = (ctx, args) => Promise<unknown>;
type ActionHandler = (ctx, args) => Promise<unknown>;
```

Queries:

- read only
- may run outside an explicit transaction
- declare invalidation dependencies
- may be subscribed to by clients

Mutations:

- run in a PostgreSQL transaction
- validate arguments
- authenticate and authorize writes
- write invalidation events after commit
- may enqueue jobs after commit
- must not call external services inline

Actions:

- may call external services
- may call queries and mutations through the registry
- may enqueue or claim jobs
- may stream output when the protocol supports it
- must mark irreversible side effects where relevant

## 5. PostgreSQL Capabilities

Required extensions:

```sql
create extension if not exists pgcrypto;
create extension if not exists vector;
create extension if not exists pg_trgm;
```

Optional extensions:

```sql
create extension if not exists pg_cron;
```

Use PostgreSQL for:

- canonical data
- transactional publish
- content-addressed blobs
- job queue
- auth sessions
- full-text search
- vector search
- audit/version metadata
- runtime invalidation log

Use external adapters for:

- object/file storage when files exceed comfortable row size
- model providers
- wallet/payment verification
- CDP browser execution

## 6. Core Tables

Table names should follow the current Convex schema where practical.

### 6.1 Pages and Assets

```sql
create table pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  html text not null,
  updated_at timestamptz not null default now(),
  browser_schema jsonb,
  nous_report jsonb,
  iframe_origins text[] default '{}'
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  content text not null,
  content_type text not null,
  updated_at timestamptz not null default now()
);

create table domains (
  id uuid primary key default gen_random_uuid(),
  host text not null unique,
  slug text not null references pages(slug),
  created_at timestamptz not null default now()
);
```

### 6.2 Secrets and Auth

```sql
create table keys (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  value_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null,
  global_role text not null check (global_role in ('superadmin', 'user')),
  email_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
```

Secret values should be encrypted before storage. `PUBLISH_SECRET` may also live in process env for bootstrap, but database-backed verification must support rotation.

### 6.3 Jobs

```sql
create table jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  org_id text,
  slug text,
  status text not null check (status in ('pending', 'claimed', 'building', 'done', 'error', 'cancelled', 'interrupted')),
  agent_id text,
  payload jsonb not null default '{}',
  result jsonb,
  error text,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_claim_idx on jobs (status, run_after, created_at);
create index jobs_slug_idx on jobs (slug);
create index jobs_agent_idx on jobs (agent_id);
```

Workers claim jobs with:

```sql
select *
from jobs
where status = 'pending'
  and run_after <= now()
order by created_at
for update skip locked
limit 1;
```

### 6.4 Errors

```sql
create table errors (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  message text not null,
  source text,
  line integer,
  col integer,
  stack text,
  type text not null check (type in ('error', 'unhandledrejection', 'console.error')),
  user_agent text,
  created_at timestamptz not null default now()
);

create index errors_slug_time_idx on errors (slug, created_at desc);
```

### 6.5 Version Control

```sql
create table blobs (
  id uuid primary key default gen_random_uuid(),
  hash text not null unique,
  content text not null,
  size integer not null,
  ref_count integer not null default 1
);

create table commits (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  parent_id uuid references commits(id),
  blob_id uuid not null references blobs(id),
  agent_id text not null default 'system',
  job_id uuid references jobs(id),
  message text,
  reversible boolean not null default true,
  summary jsonb,
  embedding vector(1536),
  test_status text check (test_status in ('pass', 'fail', 'unknown')),
  tags text[],
  summarized_at timestamptz,
  created_at timestamptz not null default now()
);

create index commits_slug_time_idx on commits (slug, created_at desc);
create index commits_parent_idx on commits (parent_id);
create index commits_agent_idx on commits (agent_id);
create index commits_unsummarized_idx on commits (summarized_at) where summarized_at is null;
create index commits_embedding_idx on commits using ivfflat (embedding vector_cosine_ops);
```

Every successful `pages:publish` writes a commit in the same transaction as the page update. Summary and embedding happen asynchronously.

### 6.6 Memory and Vector Search

```sql
create table nex_memory (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  slug text,
  conversation_id uuid,
  type text not null check (type in ('short', 'long', 'app', 'conversation')),
  content text not null,
  embedding vector(1536),
  metadata jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  search_vector tsvector generated always as (to_tsvector('english', content)) stored
);

create index nex_memory_org_idx on nex_memory (org_id);
create index nex_memory_scope_idx on nex_memory (org_id, type, slug, conversation_id);
create index nex_memory_search_idx on nex_memory using gin (search_vector);
create index nex_memory_embedding_idx on nex_memory using ivfflat (embedding vector_cosine_ops);
```

Search should combine text and vector results, then sort deterministically before prompt assembly.

## 7. Runtime Registry

Function registration should be explicit:

```ts
runtime.query("pages:get", {
  args: pageGetArgs,
  watches: (args) => [{ table: "pages", key: args.slug }],
  handler: async (ctx, args) => { ... },
});

runtime.mutation("pages:publish", {
  args: publishArgs,
  writes: (args) => [
    { table: "pages", key: args.slug },
    { table: "commits", key: args.slug },
  ],
  handler: async (ctx, args) => { ... },
});

runtime.action("version:search", {
  args: searchArgs,
  handler: async (ctx, args) => { ... },
});
```

Handlers receive:

```ts
type RuntimeContext = {
  db: PgClient;
  tx?: PgTransaction;
  auth: AuthContext;
  secrets: SecretReader;
  storage: StorageAdapter;
  jobs: JobAdapter;
  log: Logger;
  runQuery(name, args): Promise<unknown>;
  runMutation(name, args): Promise<unknown>;
  runAction(name, args): Promise<unknown>;
};
```

Argument validation should use a small local validator layer. The first version can use Zod if dependency cost is acceptable; a later version can replace it with a no∅ validator.

## 8. Realtime Model

The first realtime model is explicit invalidation.

```sql
create table invalidations (
  id bigserial primary key,
  topic text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
```

After a mutation commits, the runtime:

1. inserts invalidation rows
2. sends `pg_notify('novoid_invalidation', json)`
3. WebSocket/SSE server receives notification
4. subscribed queries whose `watches` match are re-run
5. clients receive updated data

Topic format:

```txt
table:key
pages:auteque
assets:core.min.js
errors:auteque
commits:auteque
jobs:default
```

Initial implementation may over-invalidate by table. Later implementations can add precise row/key invalidation.

`pages:version` compatibility can be implemented as a query returning `pages.updated_at` or a monotonically increasing page version.

## 9. HTTP Routes

The runtime must provide these routes:

```txt
GET  /platform
GET  /app/:slug
GET  /raw/:slug
GET  /css/:name
GET  /js/:name
GET  /img/:name
GET  /skills
GET  /llms.txt
GET  /robots.txt
POST /errors/:slug
GET  /errors/:slug
GET  /vox
POST /nex/webhook/*
GET  /nex/agents
GET  /collab/:slug
POST /publish/:slug
DELETE /publish/:slug
POST /upload-img/:name
GET  /upload-img/:name
POST /lead/:slug
GET  /docs/:docId
POST /docs/:docId
GET  /docs
POST /cdp/browse
POST /cdp/screenshot
POST /cdp/script
GET  /mcp/:slug
POST /mcp/:slug
GET  /.well-known/x402.json
POST /billing/register
POST /billing/publish
DELETE /billing/publish
POST /billing/balance
POST /billing/usage
GET  /billing/tools
POST /api/chat
```

Route behavior should match current no∅ behavior:

- `/app/:slug` injects sentinel error capture.
- `/app/:slug` injects live reload.
- `/app/:slug` supports markdown content negotiation for agents.
- `/app/:slug` applies CSP and per-page connect/media overrides.
- `/raw/:slug` serves unmodified HTML.
- `/css` and `/js` serve seeded framework assets.
- `/mcp/:slug` exposes app state/actions over JSON-RPC.
- write routes authenticate with `PUBLISH_SECRET`, bearer token, or API key depending on route.

## 10. Publish Pipeline

The local workflow remains:

```sh
sh verify.sh src/app/<slug>.html
sh publish.sh <slug> src/app/<slug>.html
```

`publish.sh` should eventually target the PostgreSQL runtime HTTP API instead of `npx convex run`.

Required `pages:publish` behavior:

1. validate slug
2. verify secret
3. upsert `pages`
4. store `browser_schema` and `nous_report` when provided
5. compute SHA-256 of HTML
6. insert or reuse `blobs`
7. insert `commits`
8. enqueue `version:summarize`
9. emit invalidations for `pages:<slug>` and `commits:<slug>`
10. return live URL

Verification remains outside the runtime initially. The runtime should store verification outputs, not replace Nous or Qed.

## 11. MCP Runtime

The MCP route exposes each published app as a tool surface.

Required capabilities:

- read observed app resources
- call store actions exposed by no∅ apps
- route backend tool calls to query/mutation/action registry
- require bearer token for dangerous mutations/actions
- include app metadata, browser schema, and verification report when available

MCP request flow:

```txt
POST /mcp/:slug
  parse JSON-RPC
  load page and browser schema
  resolve tool name
  authorize
  execute read/call/query/mutation/action
  return JSON-RPC response
```

## 12. Agent Runtime

Nex and Vox currently depend on a database-backed job loop. The PostgreSQL runtime should keep that model.

Worker behavior:

```txt
poll jobs
claim with for update skip locked
execute handler
write result
emit invalidation
```

Agent-specific requirements:

- preserve conversations, messages, memory, jobs, heartbeat, channels, approvals, tool corpus, wallets, and canvas records
- support Telegram/webhook routes
- support inline app HTML in messages
- support deterministic prompt assembly for cache behavior
- support memory recall through full-text and vector search
- support approval gates for irreversible or high-risk actions

The first version can keep `nex-watch.js` as a local worker pointed at the new runtime.

## 13. Version Control Runtime

The version model remains:

- every publish writes a commit
- blobs are content-addressed
- slugs are branches
- summaries and embeddings are asynchronous
- `reversible` blocks unsafe rollback unless `force` is supplied

Public functions:

```txt
version:list
version:get
version:diff
version:search
version:revert
```

`version:revert` republishes a historic blob as a new commit. It does not mutate history.

## 14. Storage Adapter

Initial storage options:

1. database-backed content for small assets
2. local filesystem for development
3. S3/R2-compatible object storage for larger files

Storage adapter interface:

```ts
type StorageAdapter = {
  put(name: string, bytes: Uint8Array, contentType: string): Promise<StorageRef>;
  get(name: string): Promise<StoredObject | null>;
  getUrl(name: string): Promise<string | null>;
  delete(name: string): Promise<void>;
};
```

Images and binaries should not be forced into text columns once the runtime has object storage configured.

## 15. Security Requirements

- Preserve CSP on app routes.
- Keep write operations auth-gated.
- Hash session tokens.
- Encrypt database secrets.
- Do not expose API keys to frontend clients.
- Reject oversized sentinel error payloads.
- Validate slugs with the existing lowercase alphanumeric and dash pattern.
- Use parameterized SQL only.
- Keep external side effects out of mutations.
- Mark irreversible commits when actions send email, payments, wallet transactions, public posts, or other external effects.
- Keep app runtime dependency-free where possible.

## 16. Billing Runtime

Billing remains an HTTP API over database records:

```txt
agentKeys
usage
wallet verification
credit accounting
rate limits
publish billing
```

Use transactions for credit deduction and usage insertion. Payment verification is an action because it calls external chain/provider APIs.

## 17. Deployment Shape

Development:

```txt
postgres
novoid-server
novoid-worker
```

Production:

```txt
one live Postgres database
one or more novoid-server instances
one or more novoid-worker instances
object storage adapter
```

There is still one environment. Multiple server or worker processes do not create a dev/prod split; they are runtime replicas over the same live database.

## 18. Migration Plan

### Phase 0: Skeleton

- create `postgres/` runtime package
- define database migrations
- start HTTP server
- implement health check
- implement registry shape

### Phase 1: Pages, Assets, Publish

- implement `pages:get`, `pages:list`, `pages:publish`, `pages:remove`
- implement `assets:get`, `assets:set`
- implement `/app`, `/raw`, `/css`, `/js`, `/skills`
- make `publish.sh` optionally target Postgres runtime
- preserve sentinel injection and live reload

### Phase 2: Realtime

- implement WebSocket or SSE transport
- implement invalidation table and `LISTEN/NOTIFY`
- implement `useQuery` subscription adapter
- implement `pages:version`

### Phase 3: MCP

- implement `/mcp/:slug`
- expose app resources and store actions
- route registry-backed tools
- implement bearer-token authorization for dangerous calls

### Phase 4: Version Control

- implement blobs and commits
- add publish commit creation
- add summarize worker
- add vector search
- add revert

### Phase 5: Auth, Documents, Errors, Collab

- implement users/sessions/orgs
- implement sentinel error routes
- implement docs routes
- implement fragment claims and compose
- implement optimistic version checks

### Phase 6: Agents

- port jobs, conversations, messages, memory, channels, heartbeat
- point `nex-watch.js` or replacement worker at Postgres runtime
- port Vox build/publish loop
- port CDP actions

### Phase 7: Billing and x402

- port agent keys and usage
- port wallet/payment verification actions
- port `/billing/*`
- port `/.well-known/x402.json`

### Phase 8: Cutover

- dual-write publish metadata for a short window if useful
- compare live URLs, MCP behavior, version history, and sentinel errors
- switch canonical publish target
- keep Convex read-only until rollback window closes

## 19. Testing Strategy

Required tests:

- unit tests for registry dispatch
- SQL migration tests
- transaction rollback tests
- publish route tests
- live page render tests
- realtime invalidation tests
- MCP JSON-RPC tests
- version commit/revert tests
- job claiming concurrency tests
- auth/session tests
- billing transaction tests

Existing no∅ verification remains:

```sh
sh verify.sh src/app/<slug>.html
npm test
npm run test:e2e
```

New runtime tests should include PostgreSQL integration tests using an isolated test database.

## 20. Open Decisions

- Node, Bun, or another runtime for `novoid-server`.
- WebSocket vs SSE for query subscriptions.
- Zod vs local validators.
- S3/R2 vs database-only storage for first release.
- Whether migrations live as SQL files or TypeScript migration scripts.
- Whether `publish.sh` gets a backend mode flag or auto-detects from env.
- Whether Convex compatibility names remain forever or are aliased during migration.

## 21. Acceptance Criteria

The PostgreSQL runtime is viable when:

- `sh publish.sh <slug> src/app/<slug>.html` publishes to a live URL.
- `/app/:slug` serves the same app with CSP, sentinel errors, and live reload.
- `Novoid.useQuery`, `useMutation`, and `useAction` work without Convex.
- MCP clients can inspect and call app tools.
- every publish creates a searchable commit.
- workers can claim and complete jobs concurrently.
- Nex can create a job, process it, store a message, and update the UI.
- verification outputs are stored and visible to agent-facing routes.
- billing publish can charge, publish, and record usage transactionally.
- no Convex SDK, Convex deployment, or Convex HTTP route is required for the core platform path.

