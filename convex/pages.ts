import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { verifySecret } from "./lib";

export const publish = mutation({
  args: {
    slug: v.string(),
    html: v.string(),
    secret: v.string(),
    browserSchema: v.optional(v.string()),
    nousReport: v.optional(v.string()),
  },
  handler: async (ctx, { slug, html, secret, browserSchema, nousReport }) => {
    await verifySecret(ctx, secret);

    const patch: Record<string, unknown> = { html, updatedAt: Date.now() };
    if (browserSchema !== undefined) patch.browserSchema = browserSchema;
    if (nousReport !== undefined) patch.nousReport = nousReport;

    const existing = await ctx.db
      .query("pages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("pages", { slug, ...patch } as never);
    }
  },
});

export const remove = mutation({
  args: {
    slug: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { slug, secret }) => {
    await verifySecret(ctx, secret);

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

export const version = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const page = await ctx.db
      .query("pages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    return page?.updatedAt ?? 0;
  },
});

export const setIframeOrigins = mutation({
  args: {
    slug: v.string(),
    origins: v.array(v.string()),
    secret: v.string(),
  },
  handler: async (ctx, { slug, origins, secret }) => {
    await verifySecret(ctx, secret);
    const page = await ctx.db
      .query("pages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!page) throw new Error(`Page "${slug}" not found`);
    await ctx.db.patch(page._id, { iframeOrigins: origins });
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
