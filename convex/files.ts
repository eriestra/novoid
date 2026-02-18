import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { verifySecret } from "./lib";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const save = mutation({
  args: {
    name: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { name, storageId, contentType, secret }) => {
    await verifySecret(ctx, secret);

    const existing = await ctx.db
      .query("files")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { storageId, contentType });
    } else {
      await ctx.db.insert("files", { name, storageId, contentType });
    }
  },
});

export const getUrl = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const file = await ctx.db
      .query("files")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!file) return null;
    const url = await ctx.storage.getUrl(file.storageId);
    return url;
  },
});
