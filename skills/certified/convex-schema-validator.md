---
name: convex-schema-validator
displayName: Convex Schema Validator
description: Defining and validating database schemas with proper typing, index configuration, optional fields, unions, and migration strategies for schema changes
version: 1.0.0
author: Convex
tags: [convex, schema, validation, typescript, indexes, migrations]
---

# Convex Schema Validator

Define database schemas in Convex with typing, indexes, and optional fields.

## 1. Schema Definition
Define your schema in `convex/schema.ts`.

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    avatarUrl: v.optional(v.string()), // Optional field
    createdAt: v.number(),
  }).index("by_email", ["email"]), // Single field index
  
  tasks: defineTable({
    title: v.string(),
    completed: v.boolean(),
    userId: v.id("users"), // Foreign key relation
    priority: v.union( // Union types
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    ),
  }).index("by_user_and_completed", ["userId", "completed"]), // Compound index
});
```

## 2. Using Schema Types
Extract TypeScript types from the database schema.

```typescript
import { Doc, Id } from "./_generated/dataModel";

// Full document type (includes _id and _creationTime)
type User = Doc<"users">;

// ID reference type
type UserId = Id<"users">;
```

## 3. Schema Migrations
When adding fields, make them `v.optional()` first, backfill the data if necessary using a mutation, and then update the schema to be required.

```typescript
// Step 1: Add as optional
users: defineTable({
  name: v.string(),
  avatarUrl: v.optional(v.string()), 
})

// Step 2: Backfill existing data using a mutation
await ctx.db.patch(user._id, { avatarUrl: `...` });

// Step 3: Update schema to required
users: defineTable({
  name: v.string(),
  avatarUrl: v.string(), 
})
```
