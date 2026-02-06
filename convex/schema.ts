import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  pages: defineTable({
    slug: v.string(),
    html: v.string(),
    updatedAt: v.number(),
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
});
