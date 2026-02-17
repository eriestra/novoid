import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib";

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await requireAuth(ctx, token);
    return await ctx.db
      .query("notes")
      .withIndex("by_user_updated", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: { token: v.string(), title: v.string(), body: v.string() },
  handler: async (ctx, { token, title, body }) => {
    const user = await requireAuth(ctx, token);
    const now = Date.now();
    return await ctx.db.insert("notes", {
      userId: user._id,
      title,
      body,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("notes"),
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, { token, id, title, body }) => {
    const user = await requireAuth(ctx, token);
    const note = await ctx.db.get(id);
    if (!note || note.userId !== user._id) throw new Error("Not found");
    await ctx.db.patch(id, { title, body, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("notes") },
  handler: async (ctx, { token, id }) => {
    const user = await requireAuth(ctx, token);
    const note = await ctx.db.get(id);
    if (!note || note.userId !== user._id) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});
