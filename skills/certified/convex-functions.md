---
name: convex-functions
displayName: Convex Functions
description: Writing queries, mutations, actions, and HTTP actions with proper argument validation, error handling, internal functions, and runtime considerations
version: 1.0.0
author: Convex
tags: [convex, functions, queries, mutations, actions, http]
---

# Convex Functions

Master Convex functions: Queries (read-only, cached), Mutations (read/write, transactional), and Actions (external APIs, no direct read/write).

## 1. Queries
Queries are reactive, cached, and read-only.

```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";

export const getUser = query({
  args: { userId: v.id("users") },
  returns: v.union(v.object({ _id: v.id("users"), name: v.string() }), v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});
```

## 2. Mutations
Mutations modify the database and are transactional.

```typescript
import { mutation } from "./_generated/server";

export const createTask = mutation({
  args: { title: v.string(), userId: v.id("users") },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("tasks", {
      title: args.title,
      userId: args.userId,
      completed: false
    });
  },
});
```

## 3. Actions
Actions can call external APIs but have no direct database access. They must use `runQuery` or `runMutation` to interact with the database.

```typescript
"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";

export const processOrder = action({
  args: { orderId: v.id("orders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Call external payment API
    const paymentResult = await fetch("...");

    // Update database via mutation
    await ctx.runMutation(internal.orders.updateStatus, {
      orderId: args.orderId,
      status: paymentResult.ok ? "paid" : "failed",
    });

    return null;
  },
});
```

## 4. Internal Functions
Use `internalQuery`, `internalMutation`, and `internalAction` to define functions that can only be called by other Convex functions, not directly from the client.

```typescript
import { internalMutation } from "./_generated/server";

// Only callable from other Convex functions
export const _updateUserCredits = internalMutation({
  args: { userId: v.id("users"), amount: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // ...
  },
});
```
