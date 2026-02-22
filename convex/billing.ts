import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";

// ─── Internal Queries ───────────────────────────────────

export const lookupKey = internalQuery({
  args: { apiKeyHash: v.string() },
  handler: async (ctx, { apiKeyHash }) => {
    return await ctx.db
      .query("agentKeys")
      .withIndex("by_api_key", (q) => q.eq("apiKey", apiKeyHash))
      .first();
  },
});

export const checkRateLimit = internalQuery({
  args: { keyId: v.id("agentKeys") },
  handler: async (ctx, { keyId }) => {
    const windowStart = Date.now() - 60_000;
    const recent = await ctx.db
      .query("usage")
      .withIndex("by_key_time", (q) =>
        q.eq("keyId", keyId).gte("timestamp", windowStart)
      )
      .collect();
    return recent.length;
  },
});

export const getUsage = internalQuery({
  args: { keyId: v.id("agentKeys") },
  handler: async (ctx, { keyId }) => {
    return await ctx.db
      .query("usage")
      .withIndex("by_key_time", (q) => q.eq("keyId", keyId))
      .order("desc")
      .take(100);
  },
});

// ─── Internal Mutations ─────────────────────────────────

export const registerKey = internalMutation({
  args: {
    apiKeyHash: v.string(),
    walletAddress: v.string(),
  },
  handler: async (ctx, { apiKeyHash, walletAddress }) => {
    return await ctx.db.insert("agentKeys", {
      apiKey: apiKeyHash,
      walletAddress,
      credit: "0",
      createdAt: Date.now(),
    });
  },
});

export const deductCredit = internalMutation({
  args: {
    keyId: v.id("agentKeys"),
    cost: v.string(),
    slug: v.string(),
    liveUrl: v.string(),
    txHash: v.optional(v.string()),
  },
  handler: async (ctx, { keyId, cost, slug, liveUrl, txHash }) => {
    const key = await ctx.db.get(keyId);
    if (!key) throw new Error("Key not found");

    const currentCredit = parseFloat(key.credit);
    const costAmount = parseFloat(cost);
    if (currentCredit < costAmount) {
      throw new Error("Insufficient credit");
    }

    const newCredit = (currentCredit - costAmount).toFixed(6);
    await ctx.db.patch(keyId, { credit: newCredit, lastUsedAt: Date.now() });
    await ctx.db.insert("usage", {
      keyId,
      slug,
      txHash,
      cost,
      timestamp: Date.now(),
      liveUrl,
    });

    return newCredit;
  },
});

export const creditAccount = internalMutation({
  args: {
    keyId: v.id("agentKeys"),
    amount: v.string(),
    txHash: v.string(),
  },
  handler: async (ctx, { keyId, amount, txHash }) => {
    // Check txHash not already used
    const existing = await ctx.db
      .query("usage")
      .withIndex("by_tx_hash", (q) => q.eq("txHash", txHash))
      .first();
    if (existing) throw new Error("Transaction already used");

    const key = await ctx.db.get(keyId);
    if (!key) throw new Error("Key not found");

    const currentCredit = parseFloat(key.credit);
    const addAmount = parseFloat(amount);
    const newCredit = (currentCredit + addAmount).toFixed(6);
    await ctx.db.patch(keyId, { credit: newCredit });

    return newCredit;
  },
});
