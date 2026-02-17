import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { verifySecret } from "./lib";

export const set = mutation({
  args: {
    host: v.string(),
    slug: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { host, slug, secret }) => {
    await verifySecret(ctx, secret);
    const normalized = host.toLowerCase().trim();
    const existing = await ctx.db
      .query("domains")
      .withIndex("by_host", (q) => q.eq("host", normalized))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { slug });
    } else {
      await ctx.db.insert("domains", { host: normalized, slug, createdAt: Date.now() });
    }
  },
});

export const remove = mutation({
  args: {
    host: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { host, secret }) => {
    await verifySecret(ctx, secret);
    const domain = await ctx.db
      .query("domains")
      .withIndex("by_host", (q) => q.eq("host", host.toLowerCase().trim()))
      .first();
    if (domain) {
      await ctx.db.delete(domain._id);
    }
  },
});

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("domains").collect();
  },
});

export const getByHost = query({
  args: { host: v.string() },
  handler: async (ctx, { host }) => {
    return await ctx.db
      .query("domains")
      .withIndex("by_host", (q) => q.eq("host", host.toLowerCase().trim()))
      .first();
  },
});
