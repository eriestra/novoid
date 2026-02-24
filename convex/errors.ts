import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { verifySecret } from "./lib";

// Browser-called: log a runtime error from a published page
export const log = mutation({
  args: {
    slug: v.string(),
    message: v.string(),
    source: v.optional(v.string()),
    line: v.optional(v.number()),
    col: v.optional(v.number()),
    stack: v.optional(v.string()),
    type: v.union(v.literal("error"), v.literal("unhandledrejection"), v.literal("console.error")),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Rate limit: max 50 errors per slug per 60 seconds
    const cutoff = Date.now() - 60_000;
    const recent = await ctx.db
      .query("errors")
      .withIndex("by_slug_time", (q) =>
        q.eq("slug", args.slug).gte("timestamp", cutoff)
      )
      .take(51);
    if (recent.length > 50) return;

    await ctx.db.insert("errors", {
      ...args,
      timestamp: Date.now(),
    });
  },
});

// Claude Code calls this: get recent errors for a slug
export const recent = query({
  args: {
    slug: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { slug, limit }) => {
    const errors = await ctx.db
      .query("errors")
      .withIndex("by_slug_time", (q) => q.eq("slug", slug))
      .order("desc")
      .take(limit ?? 20);
    return errors;
  },
});

// Clear errors for a slug (after fixing)
export const clear = mutation({
  args: {
    slug: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { slug, secret }) => {
    await verifySecret(ctx, secret);

    const errors = await ctx.db
      .query("errors")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();
    for (const error of errors) {
      await ctx.db.delete(error._id);
    }
    return { deleted: errors.length };
  },
});
