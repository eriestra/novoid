import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { hashSecret, verifySecret } from "./lib";

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

// Stores hashed secret — re-run after upgrade to hash-based auth
export const seedSecret = internalMutation({
  args: { name: v.string(), value: v.string() },
  handler: async (ctx, { name, value }) => {
    const hashed = await hashSecret(value);
    const existing = await ctx.db
      .query("keys")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { value: hashed });
    } else {
      await ctx.db.insert("keys", { name, value: hashed });
    }
  },
});

// Store a raw key (not hashed) — for API keys that need to be read back
export const seedKey = internalMutation({
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

// Rotate secret: verify old, store hashed new
export const rotateSecret = internalMutation({
  args: {
    oldSecret: v.string(),
    newSecret: v.string(),
  },
  handler: async (ctx, { oldSecret, newSecret }) => {
    await verifySecret(ctx, oldSecret);
    const hashed = await hashSecret(newSecret);
    const key = await ctx.db
      .query("keys")
      .withIndex("by_name", (q) => q.eq("name", "PUBLISH_SECRET"))
      .first();
    if (key) {
      await ctx.db.patch(key._id, { value: hashed });
    }
  },
});
