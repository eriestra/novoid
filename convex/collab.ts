import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const STALE_CLAIM_MS = 10 * 60 * 1000; // 10 minutes

async function verifySecret(ctx: any, secret: string) {
  const key = await ctx.db
    .query("keys")
    .withIndex("by_name", (q: any) => q.eq("name", "PUBLISH_SECRET"))
    .first();
  if (!key || key.value !== secret) {
    throw new Error("Unauthorized");
  }
}

export const createPlan = mutation({
  args: {
    slug: v.string(),
    description: v.string(),
    fragments: v.array(v.object({
      name: v.string(),
      order: v.number(),
      description: v.string(),
    })),
    template: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { slug, description, fragments, template, secret }) => {
    await verifySecret(ctx, secret);

    // Remove existing plan and fragments for this slug
    const existing = await ctx.db
      .query("plans")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    const existingFragments = await ctx.db
      .query("fragments")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();
    for (const f of existingFragments) {
      await ctx.db.delete(f._id);
    }

    const now = Date.now();

    // Create the plan
    const planId = await ctx.db.insert("plans", {
      slug,
      description,
      fragments,
      template,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // Create fragment records
    for (const frag of fragments) {
      await ctx.db.insert("fragments", {
        slug,
        name: frag.name,
        html: "",
        order: frag.order,
        status: "open",
        updatedAt: now,
        version: 0,
      });
    }

    return planId;
  },
});

export const claim = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    agentId: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { slug, name, agentId, secret }) => {
    await verifySecret(ctx, secret);

    const fragment = await ctx.db
      .query("fragments")
      .withIndex("by_slug_name", (q) => q.eq("slug", slug).eq("name", name))
      .first();
    if (!fragment) {
      throw new Error(`Fragment "${name}" not found for page "${slug}"`);
    }

    const now = Date.now();

    // Check if already claimed by someone else (and not stale)
    if (
      fragment.claimedBy &&
      fragment.claimedBy !== agentId &&
      fragment.status === "claimed" &&
      fragment.claimedAt &&
      now - fragment.claimedAt < STALE_CLAIM_MS
    ) {
      throw new Error(
        `Fragment "${name}" is already claimed by ${fragment.claimedBy}`
      );
    }

    await ctx.db.patch(fragment._id, {
      claimedBy: agentId,
      claimedAt: now,
      status: "claimed",
      updatedAt: now,
    });

    return { version: fragment.version };
  },
});

export const publishFragment = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    html: v.string(),
    expectedVersion: v.number(),
    agentId: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { slug, name, html, expectedVersion, agentId, secret }) => {
    await verifySecret(ctx, secret);

    const fragment = await ctx.db
      .query("fragments")
      .withIndex("by_slug_name", (q) => q.eq("slug", slug).eq("name", name))
      .first();
    if (!fragment) {
      throw new Error(`Fragment "${name}" not found for page "${slug}"`);
    }

    if (fragment.claimedBy !== agentId) {
      throw new Error(
        `Fragment "${name}" is not claimed by ${agentId}`
      );
    }

    if (fragment.version !== expectedVersion) {
      throw new Error(
        `Version conflict: expected ${expectedVersion}, current is ${fragment.version}`
      );
    }

    const newVersion = fragment.version + 1;
    await ctx.db.patch(fragment._id, {
      html,
      status: "published",
      version: newVersion,
      updatedAt: Date.now(),
    });

    return { version: newVersion };
  },
});

export const release = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    agentId: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { slug, name, agentId, secret }) => {
    await verifySecret(ctx, secret);

    const fragment = await ctx.db
      .query("fragments")
      .withIndex("by_slug_name", (q) => q.eq("slug", slug).eq("name", name))
      .first();
    if (!fragment) {
      throw new Error(`Fragment "${name}" not found for page "${slug}"`);
    }

    if (fragment.claimedBy !== agentId) {
      throw new Error(
        `Fragment "${name}" is not claimed by ${agentId}`
      );
    }

    await ctx.db.patch(fragment._id, {
      claimedBy: undefined,
      claimedAt: undefined,
      status: "open",
      updatedAt: Date.now(),
    });
  },
});

export const compose = mutation({
  args: {
    slug: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { slug, secret }) => {
    await verifySecret(ctx, secret);

    const plan = await ctx.db
      .query("plans")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!plan) {
      throw new Error(`No plan found for page "${slug}"`);
    }

    const fragments = await ctx.db
      .query("fragments")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();

    // Build the final HTML by replacing {{name}} placeholders
    let html = plan.template;
    for (const frag of fragments) {
      html = html.replace(`{{${frag.name}}}`, frag.html);
    }

    // Write to pages table (direct DB write)
    const existingPage = await ctx.db
      .query("pages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (existingPage) {
      await ctx.db.patch(existingPage._id, { html, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("pages", { slug, html, updatedAt: Date.now() });
    }

    // Mark plan as complete
    await ctx.db.patch(plan._id, {
      status: "complete",
      updatedAt: Date.now(),
    });
  },
});

export const status = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const plan = await ctx.db
      .query("plans")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!plan) {
      return null;
    }

    const fragments = await ctx.db
      .query("fragments")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();

    // Sort by order
    fragments.sort((a, b) => a.order - b.order);

    return {
      plan: {
        slug: plan.slug,
        description: plan.description,
        status: plan.status,
        template: plan.template,
        fragments: plan.fragments,
      },
      fragments: fragments.map((f) => ({
        name: f.name,
        status: f.status,
        claimedBy: f.claimedBy ?? null,
        version: f.version,
        order: f.order,
      })),
    };
  },
});

export const myWork = query({
  args: { agentId: v.string() },
  handler: async (ctx, { agentId }) => {
    const fragments = await ctx.db
      .query("fragments")
      .withIndex("by_claimed", (q) => q.eq("claimedBy", agentId))
      .collect();

    return fragments.map((f) => ({
      slug: f.slug,
      name: f.name,
      status: f.status,
      claimedAt: f.claimedAt,
    }));
  },
});
