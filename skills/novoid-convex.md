# novoid-convex

Data layer — connecting no∅ apps to Convex backends with reactive queries, mutations, actions, and AI.

## 1. Client Setup
Connect the frontend to the backend using `createClient`.

```js
// Load scripts in order: Convex CDN -> core -> convex -> auth
const client = Novoid.createClient("https://your-convex-url.convex.cloud");
const auth = Novoid.useNovoidAuth(client);
```

## 2. Reading Data (Queries)
Queries are reactive and auto-update when backend data changes.

```js
// Returns { data, loading, error } signals
const bills = Novoid.useQuery(client, 'bills:list', { orgId: auth.orgId });

Novoid.effect(() => {
  // Always default data() as it is undefined while loading
  const items = bills.data() ?? [];
  console.log("Bills:", items);
});
```
**Skip Pattern:** Useful when waiting on other data before querying:
```js
// Query won't run until orgId() is truthy
const query = Novoid.useQuery(client, 'stats:get', () => auth.orgId() ? { orgId: auth.orgId() } : 'skip');
```

## 3. Writing Data (Mutations)
Use mutations to modify the database transactionally.

```js
const createBill = Novoid.useMutation(client, 'bills:create');

async function handleSave(data) {
  try {
    const id = await createBill({ ...data, orgId: auth.orgId() });
    console.log("Created:", id);
  } catch (err) {
    console.error("Failed:", err);
  }
}
```

## 4. Backend Actions (External APIs & AI)
Use actions for server-side logic that calls external APIs.

```js
const processAI = Novoid.useAction(client, 'ai:processText');
// Calling it works exactly like a mutation
await processAI({ text: "Hello" });
```

**Built-in AI helper (`useAI`):**
```js
const chat = Novoid.useAI(client, 'ai:chat');
await chat.submit("Explain quantum physics");
console.log(chat.response()); // Streams the response
```

## 5. Built-in Authentication
Session-based auth using SHA-256 tokens.
```js
auth.user();            // Reactive signal of current user
auth.isAuthenticated(); // Reactive boolean
auth.login(email, pwd); // Promise
auth.logout();          // Promise
```

## 6. Backend Schema (convex/schema.ts)
Always define your tables and indexes in the schema.
```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    orgId: v.optional(v.string()),
  }).index("by_email", ["email"]), // Define indexes for fast queries
});
```

## Conventions
- **Load Order:** Convex CDN bundle must load *before* `core.min.js`.
- **Default Data:** `data()` is `undefined` initially. Use `data() ?? []`.
- **Secrets:** API keys should be stored in the Convex `keys` table and read via `internalQuery`. *Never* expose them to the frontend.
