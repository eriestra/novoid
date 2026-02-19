import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { verifySecret } from "./lib";
import { api, internal } from "./_generated/api";

// ─── Job Queue ─────────────────────────────────────────────

export const createJob = mutation({
  args: {
    orgId: v.string(),
    type: v.string(),
    payload: v.string(),
    conversationId: v.optional(v.id("nex_conversations")),
    secret: v.string(),
  },
  handler: async (ctx, { orgId, type, payload, conversationId, secret }) => {
    await verifySecret(ctx, secret);
    const now = Date.now();
    return await ctx.db.insert("nex_jobs", {
      orgId,
      type,
      payload,
      status: "pending",
      conversationId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Webhook-originated jobs — auth verified at HTTP layer, no secret needed
export const createWebhookJob = mutation({
  args: {
    orgId: v.string(),
    type: v.string(),
    payload: v.string(),
    conversationId: v.optional(v.id("nex_conversations")),
    dedupeKey: v.optional(v.string()),
  },
  handler: async (ctx, { orgId, type, payload, conversationId, dedupeKey }) => {
    // Deduplicate by dedupeKey (e.g., telegram messageId) — check last 30s of jobs
    if (dedupeKey) {
      const cutoff = Date.now() - 30000;
      const recent = await ctx.db
        .query("nex_jobs")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .order("desc")
        .take(20);
      for (const job of recent) {
        if (job.createdAt < cutoff) break;
        try {
          const p = JSON.parse(job.payload || "{}");
          if (p.dedupeKey === dedupeKey) return null; // duplicate, skip
        } catch { /* */ }
      }
    }
    const now = Date.now();
    // Inject dedupeKey into payload for future checks
    let finalPayload = payload;
    if (dedupeKey) {
      try {
        const parsed = JSON.parse(payload);
        parsed.dedupeKey = dedupeKey;
        finalPayload = JSON.stringify(parsed);
      } catch { /* */ }
    }
    return await ctx.db.insert("nex_jobs", {
      orgId,
      type,
      payload: finalPayload,
      status: "pending",
      conversationId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const pendingJobs = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("nex_jobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
  },
});

export const claimJob = mutation({
  args: {
    jobId: v.id("nex_jobs"),
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

export const updateJob = mutation({
  args: {
    jobId: v.id("nex_jobs"),
    status: v.string(),
    result: v.optional(v.string()),
    secret: v.string(),
  },
  handler: async (ctx, { jobId, status, result, secret }) => {
    await verifySecret(ctx, secret);
    const patch: Record<string, unknown> = { status, updatedAt: Date.now() };
    if (result !== undefined) patch.result = result;
    await ctx.db.patch(jobId, patch);
  },
});

export const completeJob = mutation({
  args: {
    jobId: v.id("nex_jobs"),
    result: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { jobId, result, secret }) => {
    await verifySecret(ctx, secret);
    await ctx.db.patch(jobId, {
      status: "done",
      result,
      updatedAt: Date.now(),
    });
  },
});

export const interruptJob = mutation({
  args: {
    jobId: v.id("nex_jobs"),
    interruptedBy: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { jobId, interruptedBy, secret }) => {
    await verifySecret(ctx, secret);
    await ctx.db.patch(jobId, {
      status: "interrupted",
      interruptedBy,
      interruptedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const failJob = mutation({
  args: {
    jobId: v.id("nex_jobs"),
    result: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { jobId, result, secret }) => {
    await verifySecret(ctx, secret);
    await ctx.db.patch(jobId, {
      status: "error",
      result,
      updatedAt: Date.now(),
    });
  },
});

export const recentJobs = query({
  args: { orgId: v.string() },
  handler: async (ctx, { orgId }) => {
    return await ctx.db
      .query("nex_jobs")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .take(50);
  },
});

export const streamJobs = query({
  handler: async (ctx) => {
    return await ctx.db.query("nex_jobs").order("desc").take(50);
  },
});

// ─── Conversations ─────────────────────────────────────────

export const createConversation = mutation({
  args: {
    orgId: v.string(),
    title: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { orgId, title, secret }) => {
    await verifySecret(ctx, secret);
    const now = Date.now();
    return await ctx.db.insert("nex_conversations", {
      orgId,
      title,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteConversation = mutation({
  args: {
    conversationId: v.id("nex_conversations"),
    secret: v.string(),
  },
  handler: async (ctx, { conversationId, secret }) => {
    await verifySecret(ctx, secret);
    const conv = await ctx.db.get(conversationId);
    if (!conv) throw new Error("Conversation not found");
    // Delete all messages in this conversation
    const msgs = await ctx.db
      .query("nex_messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .collect();
    for (const msg of msgs) {
      await ctx.db.delete(msg._id);
    }
    // Delete any associated jobs
    const jobs = await ctx.db
      .query("nex_jobs")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .collect();
    for (const job of jobs) {
      await ctx.db.delete(job._id);
    }
    await ctx.db.delete(conversationId);
  },
});

export const renameConversation = mutation({
  args: {
    conversationId: v.id("nex_conversations"),
    title: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { conversationId, title, secret }) => {
    await verifySecret(ctx, secret);
    const conv = await ctx.db.get(conversationId);
    if (!conv) throw new Error("Conversation not found");
    await ctx.db.patch(conversationId, { title, updatedAt: Date.now() });
  },
});


export const conversations = query({
  args: { orgId: v.string() },
  handler: async (ctx, { orgId }) => {
    return await ctx.db
      .query("nex_conversations")
      .withIndex("by_org_updated", (q) => q.eq("orgId", orgId))
      .order("desc")
      .take(50);
  },
});

export const addMessage = mutation({
  args: {
    conversationId: v.id("nex_conversations"),
    role: v.string(),
    content: v.string(),
    appHtml: v.optional(v.string()),
    type: v.optional(v.string()),
    memoryContext: v.optional(v.string()),
    images: v.optional(v.array(v.string())),
    secret: v.string(),
  },
  handler: async (ctx, { conversationId, role, content, appHtml, type, memoryContext, images, secret }) => {
    await verifySecret(ctx, secret);
    const conv = await ctx.db.get(conversationId);
    if (!conv) throw new Error("Conversation not found");
    await ctx.db.patch(conversationId, { updatedAt: Date.now() });
    return await ctx.db.insert("nex_messages", {
      conversationId,
      role,
      content,
      appHtml,
      type,
      memoryContext,
      images,
      createdAt: Date.now(),
    });
  },
});

export const messages = query({
  args: { conversationId: v.id("nex_conversations") },
  handler: async (ctx, { conversationId }) => {
    return await ctx.db
      .query("nex_messages")
      .withIndex("by_conversation_time", (q) => q.eq("conversationId", conversationId))
      .collect();
  },
});

// ─── Memory (thin wrappers — heavy lifting in nex-memory.ts actions) ───

export const listMemory = query({
  args: {
    orgId: v.string(),
    type: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { orgId, type, limit }) => {
    let q = ctx.db
      .query("nex_memory")
      .withIndex(type ? "by_org_type" : "by_org", (idx: any) =>
        type ? idx.eq("orgId", orgId).eq("type", type) : idx.eq("orgId", orgId)
      )
      .order("desc");
    return await q.take(limit || 50);
  },
});

export const deleteMemory = mutation({
  args: {
    memoryId: v.id("nex_memory"),
    secret: v.string(),
  },
  handler: async (ctx, { memoryId, secret }) => {
    await verifySecret(ctx, secret);
    await ctx.db.delete(memoryId);
  },
});

export const promoteMemory = mutation({
  args: {
    memoryId: v.id("nex_memory"),
    secret: v.string(),
  },
  handler: async (ctx, { memoryId, secret }) => {
    await verifySecret(ctx, secret);
    const mem = await ctx.db.get(memoryId);
    if (!mem) throw new Error("Memory not found");
    await ctx.db.patch(memoryId, {
      type: "long",
      expiresAt: undefined,
    });
  },
});

// ─── Heartbeat ──────────────────────────────────────────────

export const heartbeatConfig = query({
  args: { orgId: v.string() },
  handler: async (ctx, { orgId }) => {
    return await ctx.db
      .query("nex_heartbeat")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .first();
  },
});

export const updateHeartbeat = mutation({
  args: {
    orgId: v.string(),
    enabled: v.optional(v.boolean()),
    intervalMs: v.optional(v.number()),
    activeHours: v.optional(v.object({
      start: v.string(),
      end: v.string(),
      timezone: v.string(),
    })),
    checklist: v.optional(v.string()),
    lastRunAt: v.optional(v.number()),
    lastResult: v.optional(v.string()),
    rotationState: v.optional(v.string()),
    secret: v.string(),
  },
  handler: async (ctx, { orgId, secret, ...updates }) => {
    await verifySecret(ctx, secret);
    const existing = await ctx.db
      .query("nex_heartbeat")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .first();

    // Filter out undefined values
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) patch[k] = val;
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    } else {
      return await ctx.db.insert("nex_heartbeat", {
        orgId,
        enabled: (updates.enabled as boolean) ?? false,
        intervalMs: (updates.intervalMs as number) ?? 1800000,
        checklist: (updates.checklist as string) ?? "## Task Review\n- Check memory for pending work\n- Highlight stalled items",
        ...patch,
      });
    }
  },
});

// ─── Channels ───────────────────────────────────────────────

export const channels = query({
  args: { orgId: v.string() },
  handler: async (ctx, { orgId }) => {
    return await ctx.db
      .query("nex_channels")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
  },
});

export const channelByType = query({
  args: { orgId: v.string(), type: v.string() },
  handler: async (ctx, { orgId, type }) => {
    return await ctx.db
      .query("nex_channels")
      .withIndex("by_org_type", (q) => q.eq("orgId", orgId).eq("type", type))
      .first();
  },
});

export const configureChannel = mutation({
  args: {
    orgId: v.string(),
    type: v.string(),
    name: v.string(),
    config: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { orgId, type, name, config, secret }) => {
    await verifySecret(ctx, secret);
    const existing = await ctx.db
      .query("nex_channels")
      .withIndex("by_org_type", (q) => q.eq("orgId", orgId).eq("type", type))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { name, config, status: "active" });
      return existing._id;
    } else {
      return await ctx.db.insert("nex_channels", {
        orgId,
        type,
        name,
        config,
        status: "active",
      });
    }
  },
});

export const updateChannelStatus = mutation({
  args: {
    channelId: v.id("nex_channels"),
    status: v.string(),
    lastMessageAt: v.optional(v.number()),
    secret: v.string(),
  },
  handler: async (ctx, { channelId, status, lastMessageAt, secret }) => {
    await verifySecret(ctx, secret);
    const patch: Record<string, unknown> = { status };
    if (lastMessageAt !== undefined) patch.lastMessageAt = lastMessageAt;
    await ctx.db.patch(channelId, patch);
  },
});

export const deleteChannel = mutation({
  args: {
    channelId: v.id("nex_channels"),
    secret: v.string(),
  },
  handler: async (ctx, { channelId, secret }) => {
    await verifySecret(ctx, secret);
    await ctx.db.delete(channelId);
  },
});

// ─── Approvals (persistent heartbeat approval queue) ─────────

export const createApproval = mutation({
  args: {
    orgId: v.string(),
    subtype: v.string(),
    prompt: v.string(),
    description: v.string(),
    chatId: v.string(),
    messageId: v.optional(v.number()),
    batchId: v.optional(v.string()),
    timeoutMs: v.optional(v.number()),
    secret: v.string(),
  },
  handler: async (ctx, { orgId, subtype, prompt, description, chatId, messageId, batchId, timeoutMs, secret }) => {
    await verifySecret(ctx, secret);
    const now = Date.now();
    return await ctx.db.insert("nex_approvals", {
      orgId,
      subtype,
      prompt,
      description,
      chatId,
      messageId,
      status: "pending",
      batchId,
      createdAt: now,
      expiresAt: now + (timeoutMs || 600000),
    });
  },
});

export const pendingApprovals = query({
  args: { orgId: v.string(), chatId: v.optional(v.string()) },
  handler: async (ctx, { orgId, chatId }) => {
    const all = await ctx.db
      .query("nex_approvals")
      .withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "pending"))
      .collect();
    if (chatId) return all.filter((a) => a.chatId === chatId);
    return all;
  },
});

export const resolveApproval = mutation({
  args: {
    approvalId: v.id("nex_approvals"),
    status: v.string(), // "approved" | "denied" | "expired"
    secret: v.string(),
  },
  handler: async (ctx, { approvalId, status, secret }) => {
    await verifySecret(ctx, secret);
    await ctx.db.patch(approvalId, { status, resolvedAt: Date.now() });
  },
});

export const resolveApprovalBatch = mutation({
  args: {
    batchId: v.string(),
    status: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { batchId, status, secret }) => {
    await verifySecret(ctx, secret);
    const items = await ctx.db
      .query("nex_approvals")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();
    const now = Date.now();
    for (const item of items) {
      if (item.status === "pending") {
        await ctx.db.patch(item._id, { status, resolvedAt: now });
      }
    }
    return items.length;
  },
});

export const expireApprovals = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    await verifySecret(ctx, secret);
    const now = Date.now();
    const pending = await ctx.db
      .query("nex_approvals")
      .withIndex("by_org_status", (q) => q.eq("orgId", "default").eq("status", "pending"))
      .collect();
    let expired = 0;
    for (const a of pending) {
      if (a.expiresAt < now) {
        await ctx.db.patch(a._id, { status: "expired", resolvedAt: now });
        expired++;
      }
    }
    return expired;
  },
});

// ─── Skills ─────────────────────────────────────────────────

export const skills = query({
  args: { orgId: v.string() },
  handler: async (ctx, { orgId }) => {
    return await ctx.db
      .query("nex_skills")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
  },
});

export const installSkill = mutation({
  args: {
    orgId: v.string(),
    name: v.string(),
    description: v.string(),
    command: v.string(),
    type: v.string(),
    handler: v.string(),
    enabled: v.optional(v.boolean()),
    metadata: v.optional(v.object({
      certificationId: v.optional(v.string()),
      certifiedAt: v.optional(v.number()),
      score: v.optional(v.float64()),
      source: v.optional(v.string()),
    })),
    secret: v.string(),
  },
  handler: async (ctx, { orgId, name, description, command, type, handler, enabled, metadata, secret }) => {
    await verifySecret(ctx, secret);
    // Check if skill with same command already exists
    const existing = await ctx.db
      .query("nex_skills")
      .withIndex("by_org_command", (q) => q.eq("orgId", orgId).eq("command", command))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { name, description, type, handler, enabled: enabled ?? true, metadata });
      return existing._id;
    }

    return await ctx.db.insert("nex_skills", {
      orgId,
      name,
      description,
      command,
      type,
      handler,
      enabled: enabled ?? true,
      metadata,
      createdAt: Date.now(),
    });
  },
});

export const deleteSkill = mutation({
  args: {
    skillId: v.id("nex_skills"),
    secret: v.string(),
  },
  handler: async (ctx, { skillId, secret }) => {
    await verifySecret(ctx, secret);
    await ctx.db.delete(skillId);
  },
});

// ─── Agent Registry ─────────────────────────────────────────

export const registerAgent = mutation({
  args: {
    agentId: v.string(),
    orgId: v.string(),
    capabilities: v.array(v.string()),
    metadata: v.optional(v.object({
      model: v.optional(v.string()),
      specialization: v.optional(v.string()),
    })),
    secret: v.string(),
  },
  handler: async (ctx, { agentId, orgId, capabilities, metadata, secret }) => {
    await verifySecret(ctx, secret);
    const now = Date.now();
    // Upsert by agentId
    const existing = await ctx.db
      .query("nex_agents")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "idle",
        capabilities,
        metadata,
        lastHeartbeat: now,
        currentJobId: undefined,
      });
      return existing._id;
    }
    return await ctx.db.insert("nex_agents", {
      agentId,
      orgId,
      status: "idle",
      capabilities,
      currentJobId: undefined,
      lastHeartbeat: now,
      metadata,
      startedAt: now,
    });
  },
});

export const agentPing = mutation({
  args: {
    agentId: v.string(),
    status: v.string(),
    currentJobId: v.optional(v.id("nex_jobs")),
    secret: v.string(),
  },
  handler: async (ctx, { agentId, status, currentJobId, secret }) => {
    await verifySecret(ctx, secret);
    const agent = await ctx.db
      .query("nex_agents")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .first();
    if (!agent) throw new Error("Agent not registered");
    const patch: Record<string, unknown> = {
      lastHeartbeat: Date.now(),
      status,
    };
    if (currentJobId !== undefined) patch.currentJobId = currentJobId;
    await ctx.db.patch(agent._id, patch);
  },
});

export const deregisterAgent = mutation({
  args: {
    agentId: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { agentId, secret }) => {
    await verifySecret(ctx, secret);
    const agent = await ctx.db
      .query("nex_agents")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .first();
    if (!agent) return;
    // Release any claimed jobs
    if (agent.currentJobId) {
      const job = await ctx.db.get(agent.currentJobId);
      if (job && job.status === "claimed") {
        await ctx.db.patch(job._id, { status: "pending", agentId: undefined, updatedAt: Date.now() });
      }
    }
    await ctx.db.patch(agent._id, { status: "offline", currentJobId: undefined });
  },
});

export const activeAgents = query({
  args: { orgId: v.string() },
  handler: async (ctx, { orgId }) => {
    return await ctx.db
      .query("nex_agents")
      .withIndex("by_org_status", (q) => q.eq("orgId", orgId))
      .collect();
  },
});

export const cleanupStaleAgents = internalMutation({
  handler: async (ctx) => {
    const staleThreshold = Date.now() - 30000; // 30s
    const agents = await ctx.db.query("nex_agents").collect();
    let cleaned = 0;
    for (const agent of agents) {
      if (agent.status === "offline") continue;
      if (agent.lastHeartbeat < staleThreshold) {
        await ctx.db.patch(agent._id, { status: "offline", currentJobId: undefined });
        // Release claimed jobs
        if (agent.currentJobId) {
          const job = await ctx.db.get(agent.currentJobId);
          if (job && (job.status === "claimed" || job.status === "building")) {
            await ctx.db.patch(job._id, { status: "pending", agentId: undefined, updatedAt: Date.now() });
          }
        }
        cleaned++;
      }
    }
    return cleaned;
  },
});

// ─── Agent Signals ──────────────────────────────────────────

export const sendSignal = mutation({
  args: {
    orgId: v.string(),
    fromAgent: v.string(),
    toAgent: v.optional(v.string()),
    conversationId: v.optional(v.id("nex_conversations")),
    type: v.string(),
    payload: v.string(),
    expiresAt: v.optional(v.number()),
    secret: v.string(),
  },
  handler: async (ctx, { orgId, fromAgent, toAgent, conversationId, type, payload, expiresAt, secret }) => {
    await verifySecret(ctx, secret);
    return await ctx.db.insert("nex_signals", {
      orgId,
      fromAgent,
      toAgent,
      conversationId,
      type,
      payload,
      status: "pending",
      createdAt: Date.now(),
      expiresAt,
    });
  },
});

export const mySignals = query({
  args: {
    agentId: v.string(),
    status: v.optional(v.string()),
  },
  handler: async (ctx, { agentId, status }) => {
    return await ctx.db
      .query("nex_signals")
      .withIndex("by_recipient", (q) =>
        q.eq("toAgent", agentId).eq("status", status || "pending")
      )
      .collect();
  },
});

export const ackSignal = mutation({
  args: {
    signalId: v.id("nex_signals"),
    secret: v.string(),
  },
  handler: async (ctx, { signalId, secret }) => {
    await verifySecret(ctx, secret);
    await ctx.db.patch(signalId, { status: "read" });
  },
});

// ─── Browse Jobs ─────────────────────────────────────────────

export const createBrowseJob = internalMutation({
  args: {
    orgId: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, { orgId, slug }) => {
    return await ctx.db.insert("nex_browse_jobs", {
      orgId,
      slug,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const submitBrowseResult = mutation({
  args: {
    jobId: v.id("nex_browse_jobs"),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
    secret: v.string(),
  },
  handler: async (ctx, { jobId, result, error, secret }) => {
    await verifySecret(ctx, secret);
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Browse job not found");
    if (job.status !== "pending") throw new Error("Browse job already resolved");
    await ctx.db.patch(jobId, {
      status: error ? "error" : "done",
      result,
      error,
    });
  },
});

export const getBrowseJob = internalQuery({
  args: { jobId: v.id("nex_browse_jobs") },
  handler: async (ctx, { jobId }) => {
    return await ctx.db.get(jobId);
  },
});

export const pendingBrowseJobs = query({
  args: { orgId: v.string() },
  handler: async (ctx, { orgId }) => {
    return await ctx.db
      .query("nex_browse_jobs")
      .withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "pending"))
      .collect();
  },
});

// ─── Canvas ──────────────────────────────────────────────────

export const canvasItems = query({
  args: { orgId: v.string() },
  handler: async (ctx, { orgId }) => {
    return await ctx.db
      .query("nex_canvas")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .take(50);
  },
});

export const addCanvasItem = mutation({
  args: {
    orgId: v.string(),
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    origin: v.string(),
    voxJobId: v.optional(v.id("jobs")),
    conversationId: v.optional(v.id("nex_conversations")),
    pinned: v.optional(v.boolean()),
    selfTool: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    secret: v.string(),
  },
  handler: async (ctx, { orgId, slug, title, description, origin, voxJobId, conversationId, pinned, selfTool, tags, secret }) => {
    await verifySecret(ctx, secret);
    // Upsert by org+slug
    const existing = await ctx.db
      .query("nex_canvas")
      .withIndex("by_org_slug", (q) => q.eq("orgId", orgId).eq("slug", slug))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { title, description, origin, voxJobId, conversationId, tags });
      return existing._id;
    }
    return await ctx.db.insert("nex_canvas", {
      orgId, slug, title, description, origin,
      voxJobId, conversationId,
      pinned: pinned ?? false,
      selfTool: selfTool ?? false,
      tags,
      createdAt: Date.now(),
    });
  },
});

export const updateCanvasItem = mutation({
  args: {
    itemId: v.id("nex_canvas"),
    pinned: v.optional(v.boolean()),
    selfTool: v.optional(v.boolean()),
    title: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    lastUsedAt: v.optional(v.number()),
    secret: v.string(),
  },
  handler: async (ctx, { itemId, secret, ...updates }) => {
    await verifySecret(ctx, secret);
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch(itemId, patch);
  },
});

export const removeCanvasItem = mutation({
  args: {
    itemId: v.optional(v.id("nex_canvas")),
    slug: v.optional(v.string()),
    secret: v.string(),
  },
  handler: async (ctx, { itemId, slug, secret }) => {
    await verifySecret(ctx, secret);
    const PROTECTED_SLUGS = ["nex", "vox", "novoid"];
    let pageSlug = slug;
    if (itemId) {
      const item = await ctx.db.get(itemId);
      if (item) {
        pageSlug = pageSlug || item.slug;
        if (PROTECTED_SLUGS.includes(item.slug)) {
          throw new Error(`Cannot delete protected app: ${item.slug}`);
        }
        await ctx.db.delete(itemId);
      }
    }
    if (pageSlug) {
      if (PROTECTED_SLUGS.includes(pageSlug)) {
        throw new Error(`Cannot delete protected app: ${pageSlug}`);
      }
      const page = await ctx.db
        .query("pages")
        .withIndex("by_slug", (q: any) => q.eq("slug", pageSlug))
        .first();
      if (page) await ctx.db.delete(page._id);
    }
  },
});
