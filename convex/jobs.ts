import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { verifySecret } from "./lib";

// Create a new job (from vox UI — requires secret)
export const create = mutation({
  args: {
    prompt: v.string(),
    slug: v.optional(v.string()),
    context: v.optional(v.string()),
    audioClip: v.optional(v.string()),
    model: v.optional(v.string()),
    secret: v.string(),
  },
  handler: async (ctx, { prompt, slug, context, audioClip, model, secret }) => {
    await verifySecret(ctx, secret);
    const now = Date.now();
    return await ctx.db.insert("jobs", {
      prompt,
      slug,
      status: "pending",
      context,
      audioClip,
      model,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// List pending jobs (for watcher — public read)
export const pending = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("jobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
  },
});

// Claim a job (watcher claims it — requires secret)
export const claim = mutation({
  args: {
    jobId: v.id("jobs"),
    agentId: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { jobId, agentId, secret }) => {
    await verifySecret(ctx, secret);
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");
    if (job.status !== "pending") throw new Error("Job already claimed");
    await ctx.db.patch(jobId, {
      status: "claimed",
      agentId,
      updatedAt: Date.now(),
    });
  },
});

// Update job status (watcher reports progress — requires secret)
export const update = mutation({
  args: {
    jobId: v.id("jobs"),
    status: v.union(v.literal("pending"), v.literal("claimed"), v.literal("building"), v.literal("done"), v.literal("error")),
    result: v.optional(v.string()),
    slug: v.optional(v.string()),
    secret: v.string(),
  },
  handler: async (ctx, { jobId, status, result, slug, secret }) => {
    await verifySecret(ctx, secret);
    const patch: Record<string, unknown> = { status, updatedAt: Date.now() };
    if (result !== undefined) patch.result = result;
    if (slug !== undefined) patch.slug = slug;
    await ctx.db.patch(jobId, patch);
  },
});

// Recent jobs for a slug (vox UI — public read)
export const recent = query({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, { slug }) => {
    if (slug) {
      return await ctx.db
        .query("jobs")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .order("desc")
        .take(20);
    }
    return await ctx.db.query("jobs").order("desc").take(20);
  },
});

// Get a single job by ID (for polling status — public read)
export const get = query({
  args: { id: v.id("jobs") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

// All jobs stream (for spectator — public read, latest first)
export const stream = query({
  handler: async (ctx) => {
    return await ctx.db.query("jobs").order("desc").take(50);
  },
});
