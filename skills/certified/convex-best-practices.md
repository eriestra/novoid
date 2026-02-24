---
name: convex-best-practices
displayName: Convex Best Practices
description: Guidelines for building production-ready Convex apps covering function organization, query patterns, validation, TypeScript usage, error handling, and the Zen of Convex design philosophy
version: 1.0.0
author: Convex
tags: [convex, best-practices, typescript, production, error-handling]
---

# Convex Best Practices

Guidelines for production-ready Convex applications.

## 1. Validating Arguments and Returns
Always define argument and return validators for your functions.

```typescript
export const createTask = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string())
  },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    // ...
  },
});
```

## 2. Using Indexes for Queries
Never use `.filter()` if you can construct an index.

```typescript
// Define index in schema
tasks: defineTable({
  userId: v.id("users"),
  status: v.string(),
}).index("by_user_and_status", ["userId", "status"])

// Use in query
return await ctx.db
  .query("tasks")
  .withIndex("by_user_and_status", (q) => q.eq("userId", args.userId).eq("status", "pending"))
  .collect();
```

## 3. Idempotent Mutations
Make mutations repeatable to avoid side-effects on connection retries:
```typescript
const task = await ctx.db.get(args.taskId);
if (!task || task.status === "completed") {
  return null; // Already done
}
```

## 4. Better Error Handling
Throw `ConvexError` for user-facing errors rather than opaque `Error` objects.

```typescript
import { ConvexError } from "convex/values";

if (!task) {
  throw new ConvexError({ code: "NOT_FOUND", message: "Task not found" });
}
```

## 5. Avoiding Read-before-Patch
When possible, patch directly without querying first. `.patch` inherently checks if the document exists.

```typescript
// GOOD: Direct patch
await ctx.db.patch(args.id, { content: args.content });
```
