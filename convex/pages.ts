import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const publish = mutation({
  args: {
    slug: v.string(),
    html: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { slug, html, secret }) => {
    // Verify publish secret
    const key = await ctx.db
      .query("keys")
      .withIndex("by_name", (q) => q.eq("name", "PUBLISH_SECRET"))
      .first();
    if (!key || key.value !== secret) {
      throw new Error("Unauthorized");
    }

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

export const remove = mutation({
  args: {
    slug: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { slug, secret }) => {
    const key = await ctx.db
      .query("keys")
      .withIndex("by_name", (q) => q.eq("name", "PUBLISH_SECRET"))
      .first();
    if (!key || key.value !== secret) {
      throw new Error("Unauthorized");
    }

    const page = await ctx.db
      .query("pages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (page) {
      await ctx.db.delete(page._id);
    }
  },
});

export const list = query({
  handler: async (ctx) => {
    const pages = await ctx.db.query("pages").collect();
    return pages.map((p) => ({
      slug: p.slug,
      updatedAt: p.updatedAt,
    }));
  },
});

export const get = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("pages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
  },
});
