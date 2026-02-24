---
name: convex-realtime
displayName: Convex Realtime
description: Patterns for building reactive apps including subscription management, optimistic updates, cache behavior, and paginated queries with cursor-based loading
version: 1.0.0
author: Convex
tags: [convex, realtime, subscriptions, optimistic-updates, pagination]
---

# Convex Realtime

Build reactive applications with Convex's real-time subscriptions and `no∅`'s reactive signals.

## 1. Subscriptions
Create reactive queries using `Novoid.useQuery` which creates a signal that updates automatically.

```typescript
const bills = Novoid.useQuery(client, 'bills:list', { orgId: auth.orgId });

Novoid.effect(() => {
  // Always default data() as it is undefined while loading
  const items = bills.data() ?? [];
  console.log("Bills:", items);
});
```

## 2. Conditional Queries (Skip Pattern)
Skip queries when requirements aren't met yet (e.g. missing ids).

```typescript
// Query won't run until orgId() is truthy
const query = Novoid.useQuery(client, 'stats:get', () => auth.orgId() ? { orgId: auth.orgId() } : 'skip');
```

## 3. Optimistic Updates
You can update the local cache immediately before the mutation completes to make the app feel faster.

```typescript
// Using Convex React Client (for React apps)
const toggleTask = useMutation(api.tasks.toggle).withOptimisticUpdate(
  (localStore, args) => {
    const { taskId } = args;
    const currentValue = localStore.getQuery(api.tasks.get, { taskId });
    
    if (currentValue !== undefined) {
      localStore.setQuery(api.tasks.get, { taskId }, {
        ...currentValue,
        completed: !currentValue.completed,
      });
    }
  }
);
```
