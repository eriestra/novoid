import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  pages: defineTable({
    slug: v.string(),
    html: v.string(),
    updatedAt: v.number(),
    browserSchema: v.optional(v.string()), // novoid-browser JSON output
    nousReport: v.optional(v.string()),    // nous proof JSON output
  }).index("by_slug", ["slug"]),

  assets: defineTable({
    name: v.string(),
    content: v.string(),
    contentType: v.string(),
  }).index("by_name", ["name"]),

  keys: defineTable({
    name: v.string(),
    value: v.string(),
  }).index("by_name", ["name"]),

  plans: defineTable({
    slug: v.string(),
    description: v.string(),
    fragments: v.array(v.object({
      name: v.string(),
      order: v.number(),
      description: v.string(),
    })),
    template: v.string(),
    status: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  errors: defineTable({
    slug: v.string(),
    message: v.string(),
    source: v.optional(v.string()),
    line: v.optional(v.number()),
    col: v.optional(v.number()),
    stack: v.optional(v.string()),
    type: v.string(), // "error" | "unhandledrejection" | "console.error"
    timestamp: v.number(),
    userAgent: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_slug_time", ["slug", "timestamp"]),

  fragments: defineTable({
    slug: v.string(),
    name: v.string(),
    html: v.string(),
    order: v.number(),
    claimedBy: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    status: v.string(),
    updatedAt: v.number(),
    version: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_slug_name", ["slug", "name"])
    .index("by_claimed", ["claimedBy"]),

  users: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
    globalRole: v.string(),
    emailVerified: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),

  sessions: defineTable({
    userId: v.id("users"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_user", ["userId"])
    .index("by_expires", ["expiresAt"]),

  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.id("users"),
    settings: v.object({
      allowSelfRegistration: v.boolean(),
      defaultRole: v.string(),
      sessionTimeoutMinutes: v.number(),
    }),
    plan: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_owner", ["ownerId"]),

  orgMemberships: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    role: v.string(),
    isActive: v.boolean(),
    joinedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_org_user", ["organizationId", "userId"]),

  orgInvitations: defineTable({
    organizationId: v.id("organizations"),
    email: v.string(),
    role: v.string(),
    invitedBy: v.id("users"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_token", ["tokenHash"])
    .index("by_org", ["organizationId"])
    .index("by_email", ["email"]),

  notes: defineTable({
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  domains: defineTable({
    host: v.string(),       // e.g. "myapp.com", "cool-tool.io"
    slug: v.string(),       // page slug to serve
    createdAt: v.number(),
  })
    .index("by_host", ["host"])
    .index("by_slug", ["slug"]),

  files: defineTable({
    name: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
  }).index("by_name", ["name"]),

  jobs: defineTable({
    prompt: v.string(),
    slug: v.optional(v.string()),
    status: v.string(), // "pending" | "claimed" | "building" | "done" | "error"
    agentId: v.optional(v.string()),
    result: v.optional(v.string()),
    context: v.optional(v.string()),
    audioClip: v.optional(v.string()),
    model: v.optional(v.string()), // "sonnet" | "opus" — routing hint for watcher
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_slug", ["slug"]),

});
