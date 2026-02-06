import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Internal mutation — called from seed runner script, not exposed to client
export const seedAsset = internalMutation({
  args: {
    name: v.string(),
    content: v.string(),
    contentType: v.string(),
  },
  handler: async (ctx, { name, content, contentType }) => {
    const existing = await ctx.db
      .query("assets")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { content, contentType });
    } else {
      await ctx.db.insert("assets", { name, content, contentType });
    }
  },
});

export const seedPage = internalMutation({
  args: {
    slug: v.string(),
    html: v.string(),
  },
  handler: async (ctx, { slug, html }) => {
    const existing = await ctx.db
      .query("pages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { html, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("pages", { slug, html, updatedAt: Date.now() });
    }
  },
});

export const seedSecret = internalMutation({
  args: { name: v.string(), value: v.string() },
  handler: async (ctx, { name, value }) => {
    const existing = await ctx.db
      .query("keys")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { value });
    } else {
      await ctx.db.insert("keys", { name, value });
    }
  },
});
