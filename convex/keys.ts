import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { hashSecret, timingSafeEqual } from "./lib";

// Internal only — never exposed to clients
export const set = internalMutation({
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

export const get = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const key = await ctx.db
      .query("keys")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    return key?.value ?? null;
  },
});

// Public verify — checks if a token matches a stored key (never exposes the value)
export const verify = query({
  args: { name: v.string(), token: v.string() },
  handler: async (ctx, { name, token }) => {
    const key = await ctx.db
      .query("keys")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!key) return false;
    const hash = await hashSecret(token);
    return timingSafeEqual(key.value, hash);
  },
});
