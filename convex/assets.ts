import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { verifySecret } from "./lib";

export const set = mutation({
  args: {
    name: v.string(),
    content: v.string(),
    contentType: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { name, content, contentType, secret }) => {
    await verifySecret(ctx, secret);

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

export const get = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    return await ctx.db
      .query("assets")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
  },
});
