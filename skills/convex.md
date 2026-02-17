# convex

Convex backend platform — schema design, queries, mutations, actions, HTTP routes, crons, and real-time subscriptions.

## Competencies

### 1. Schema Design
- Define tables with `defineSchema` and `defineTable`
- Field types: `v.string()`, `v.number()`, `v.boolean()`, `v.array()`, `v.object()`, `v.optional()`, `v.union()`, `v.null()`, `v.id(tableName)`
- Indexes for query performance: `.index("by_field", ["field"])`
- Search indexes for full-text: `.searchIndex("search_field", { searchField: "field" })`

### 2. Queries
- `query()` — read-only, cached, real-time subscriptions
- `internalQuery()` — server-only, not exposed to clients
- Argument validation with `v` validators
- Pagination with `.paginate(opts)`
- Index-backed range queries: `.withIndex("by_field", q => q.eq("field", val))`

### 3. Mutations
- `mutation()` — read-write, transactional, deterministic
- `internalMutation()` — server-only
- CRUD: `ctx.db.insert()`, `ctx.db.patch()`, `ctx.db.replace()`, `ctx.db.delete()`
- Transactions are automatic (all or nothing)

### 4. Actions
- `action()` — non-deterministic, can call external APIs
- `internalAction()` — server-only
- Can call queries/mutations via `ctx.runQuery()`, `ctx.runMutation()`
- Use for: AI API calls, file uploads, external webhooks

### 5. HTTP Routes
- `httpRouter()` — define REST-like endpoints
- `httpAction()` — handler functions with `Request` → `Response`
- CORS handling, content-type negotiation
- Route patterns: exact, prefix, wildcard

### 6. Scheduling & Crons
- `ctx.scheduler.runAfter(delay, ref, args)` — delayed execution
- `ctx.scheduler.runAt(timestamp, ref, args)` — scheduled execution
- `crons.interval("name", { hours: 1 }, ref, args)` — recurring jobs

### 7. File Storage
- `ctx.storage.store(blob)` — upload files
- `ctx.storage.getUrl(storageId)` — get serving URL
- `ctx.storage.delete(storageId)` — remove files

## Evaluation Criteria

| Level | Description |
|---|---|
| **Novice** | Can define a schema, write basic queries and mutations, connect from a client |
| **Competent** | Uses indexes effectively, implements auth patterns, handles errors, uses actions for external APIs |
| **Proficient** | Designs complex schemas with relationships, implements real-time patterns, uses HTTP routes, scheduling |
| **Expert** | Optimizes query performance, implements transactional workflows, builds multi-tenant systems, uses internal functions for security |

## Test Scenarios

1. **Basic CRUD** — define a table, write insert/list/update/delete functions.
2. **Real-time chat** — schema with messages table, query that returns latest, mutation to send.
3. **Auth-gated API** — HTTP route that validates a secret before allowing writes.
4. **AI integration** — action that reads API key from DB, calls OpenRouter, returns result.
5. **Scheduled cleanup** — cron that deletes expired sessions hourly.

## Best Practices

- Use actions for external API calls; mutations are for database operations only
- Create indexes for all filtered queries
- Keep internal functions server-side with `internalQuery`/`internalMutation`
- Handle the loading state (`undefined`) of query results on first render
