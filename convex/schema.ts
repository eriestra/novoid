import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  pages: defineTable({
    slug: v.string(),
    html: v.string(),
    updatedAt: v.number(),
    browserSchema: v.optional(v.string()), // novoid-browser JSON output
    nousReport: v.optional(v.string()),    // nous proof JSON output
    iframeOrigins: v.optional(v.array(v.string())), // allowed parent origins for framing
  }).index("by_slug", ["slug"]),

  assets: defineTable({
    name: v.string(),
    content: v.string(),
    contentType: v.string(),
  }).index("by_name", ["name"]),

  keys: defineTable({
    name: v.string(),
    value: v.string(),
  }).index("by_name", ["name"]),

  plans: defineTable({
    slug: v.string(),
    description: v.string(),
    fragments: v.array(v.object({
      name: v.string(),
      order: v.number(),
      description: v.string(),
    })),
    template: v.string(),
    status: v.union(v.literal("active"), v.literal("complete")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  errors: defineTable({
    slug: v.string(),
    message: v.string(),
    source: v.optional(v.string()),
    line: v.optional(v.number()),
    col: v.optional(v.number()),
    stack: v.optional(v.string()),
    type: v.union(v.literal("error"), v.literal("unhandledrejection"), v.literal("console.error")),
    timestamp: v.number(),
    userAgent: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_slug_time", ["slug", "timestamp"]),

  fragments: defineTable({
    slug: v.string(),
    name: v.string(),
    html: v.string(),
    order: v.number(),
    claimedBy: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    status: v.union(v.literal("open"), v.literal("claimed"), v.literal("published")),
    updatedAt: v.number(),
    version: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_slug_name", ["slug", "name"])
    .index("by_claimed", ["claimedBy"]),

  users: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
    globalRole: v.union(v.literal("superadmin"), v.literal("user")),
    emailVerified: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),

  sessions: defineTable({
    userId: v.id("users"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_user", ["userId"])
    .index("by_expires", ["expiresAt"]),

  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.id("users"),
    settings: v.object({
      allowSelfRegistration: v.boolean(),
      defaultRole: v.string(),
      sessionTimeoutMinutes: v.number(),
    }),
    plan: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_owner", ["ownerId"]),

  orgMemberships: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    role: v.string(),
    isActive: v.boolean(),
    joinedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_org_user", ["organizationId", "userId"]),

  orgInvitations: defineTable({
    organizationId: v.id("organizations"),
    email: v.string(),
    role: v.string(),
    invitedBy: v.id("users"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_token", ["tokenHash"])
    .index("by_org", ["organizationId"])
    .index("by_email", ["email"]),

  notes: defineTable({
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  domains: defineTable({
    host: v.string(),       // e.g. "myapp.com", "cool-tool.io"
    slug: v.string(),       // page slug to serve
    createdAt: v.number(),
  })
    .index("by_host", ["host"])
    .index("by_slug", ["slug"]),

  files: defineTable({
    name: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
  }).index("by_name", ["name"]),

  jobs: defineTable({
    prompt: v.string(),
    slug: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("claimed"), v.literal("building"), v.literal("done"), v.literal("error"), v.literal("cancelled")),
    agentId: v.optional(v.string()),
    result: v.optional(v.string()),
    context: v.optional(v.string()),
    audioClip: v.optional(v.string()),
    model: v.optional(v.union(v.literal("sonnet"), v.literal("opus"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_slug", ["slug"]),

  // ─── Nex: Autonomous Agent ───────────────────────────────

  documents: defineTable({
    docId: v.string(),
    writeToken: v.string(),     // SHA-256 hash of the write token
    title: v.string(),
    icon: v.string(),
    blocks: v.string(),         // JSON-encoded block array
    customBlocks: v.optional(v.string()), // JSON-encoded registerBlockType definitions
    ribbon: v.optional(v.string()),          // hex color for document ribbon
    updatedAt: v.number(),
  })
    .index("by_docId", ["docId"])
    .index("by_updated", ["updatedAt"]),

  nex_memory: defineTable({
    orgId: v.string(),
    slug: v.optional(v.string()),
    conversationId: v.optional(v.string()),  // source conversation for crosstalk scoping
    type: v.union(v.literal("short"), v.literal("long"), v.literal("app"), v.literal("conversation")),
    content: v.string(),
    embedding: v.array(v.float64()),      // 1536-dim (text-embedding-3-small)
    metadata: v.optional(v.object({
      source: v.optional(v.string()),
      importance: v.optional(v.float64()),
      tags: v.optional(v.array(v.string())),
    })),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_type", ["orgId", "type"])
    .index("by_org_slug", ["orgId", "slug"])
    .index("by_org_conversation", ["orgId", "conversationId"])
    .index("by_expires", ["expiresAt"])
    .searchIndex("by_content", {
      searchField: "content",
      filterFields: ["orgId", "type", "slug", "conversationId"],
    })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["orgId", "type", "slug", "conversationId"],
    }),

  nex_jobs: defineTable({
    orgId: v.string(),
    type: v.union(v.literal("chat"), v.literal("channel"), v.literal("canvas"), v.literal("heartbeat"), v.literal("memorize"), v.literal("recall"), v.literal("voice")),
    payload: v.string(),                  // JSON-encoded payload
    status: v.union(v.literal("pending"), v.literal("claimed"), v.literal("building"), v.literal("done"), v.literal("error"), v.literal("interrupted")),
    agentId: v.optional(v.string()),
    result: v.optional(v.string()),
    conversationId: v.optional(v.id("nex_conversations")),
    interruptedBy: v.optional(v.string()),  // message that caused the interruption
    interruptedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_org", ["orgId"])
    .index("by_conversation", ["conversationId"]),

  nex_conversations: defineTable({
    orgId: v.string(),
    title: v.string(),
    crosstalk: v.optional(v.float64()),   // 0.0 (focused) to 1.0 (creative), default 0.5
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_updated", ["orgId", "updatedAt"]),

  nex_messages: defineTable({
    conversationId: v.id("nex_conversations"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    appHtml: v.optional(v.string()),      // full no∅ HTML for inline app messages
    type: v.optional(v.union(v.literal("text"), v.literal("app"))),
    memoryContext: v.optional(v.string()), // JSON: recalled memories used for this response
    images: v.optional(v.array(v.string())), // data URLs for attached images
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_time", ["conversationId", "createdAt"]),

  nex_heartbeat: defineTable({
    orgId: v.string(),
    enabled: v.boolean(),
    intervalMs: v.number(),              // default: 1800000 (30 min)
    activeHours: v.optional(v.object({
      start: v.string(),                 // "09:00"
      end: v.string(),                   // "22:00"
      timezone: v.string(),              // "America/New_York"
    })),
    checklist: v.string(),               // markdown checklist
    lastRunAt: v.optional(v.number()),
    lastResult: v.optional(v.string()),  // "HEARTBEAT_OK" or alert text
    rotationState: v.optional(v.string()), // JSON: which checks ran last
  })
    .index("by_org", ["orgId"]),

  nex_channels: defineTable({
    orgId: v.string(),
    type: v.union(v.literal("slack"), v.literal("telegram"), v.literal("discord"), v.literal("webhook"), v.literal("email")),
    name: v.string(),
    config: v.string(),                  // JSON-encoded config (secrets inside)
    status: v.union(v.literal("active"), v.literal("inactive")),
    lastMessageAt: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_type", ["orgId", "type"]),

  nex_canvas: defineTable({
    orgId: v.string(),
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    origin: v.union(v.literal("nex-direct"), v.literal("vox-delegated"), v.literal("inline-promoted")),
    voxJobId: v.optional(v.id("jobs")),
    conversationId: v.optional(v.id("nex_conversations")),
    pinned: v.boolean(),
    selfTool: v.boolean(),
    tags: v.optional(v.array(v.string())),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_slug", ["orgId", "slug"])
    .index("by_org_pinned", ["orgId", "pinned"]),

  nex_agents: defineTable({
    agentId: v.string(),
    orgId: v.string(),
    status: v.union(v.literal("idle"), v.literal("busy"), v.literal("offline")),
    capabilities: v.array(v.string()),// ["chat", "build", "research", "review"]
    currentJobId: v.optional(v.id("nex_jobs")),
    lastHeartbeat: v.number(),
    metadata: v.optional(v.object({
      model: v.optional(v.string()),
      specialization: v.optional(v.string()),
    })),
    startedAt: v.number(),
  })
    .index("by_agent", ["agentId"])
    .index("by_org_status", ["orgId", "status"]),

  nex_signals: defineTable({
    orgId: v.string(),
    fromAgent: v.string(),
    toAgent: v.optional(v.string()),
    conversationId: v.optional(v.id("nex_conversations")),
    type: v.union(v.literal("request"), v.literal("response"), v.literal("notify"), v.literal("delegate"), v.literal("cancel")),
    payload: v.string(),              // JSON-encoded signal data
    status: v.union(v.literal("pending"), v.literal("read"), v.literal("expired")),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_recipient", ["toAgent", "status"])
    .index("by_conversation", ["conversationId"])
    .index("by_org", ["orgId"]),

  nex_approvals: defineTable({
    orgId: v.string(),
    subtype: v.union(v.literal("tidy"), v.literal("sentinel"), v.literal("review"), v.literal("followup")),
    prompt: v.string(),               // what was found
    description: v.string(),          // short summary
    chatId: v.string(),               // Telegram chat ID
    messageId: v.optional(v.number()), // Telegram message ID (for editing inline keyboard)
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("denied"), v.literal("expired"), v.literal("batched")),
    batchId: v.optional(v.string()),  // groups multiple approvals into one message
    createdAt: v.number(),
    expiresAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_org_status", ["orgId", "status"])
    .index("by_org_chatId", ["orgId", "chatId"])
    .index("by_batch", ["batchId"]),

  nex_tool_corpus: defineTable({
    toolId: v.string(),
    name: v.string(),
    description: v.string(),
    api: v.string(),         // "convex" | "http" | "openrouter"
    spec: v.string(),        // JSON: ref, parameters, returns
    embedding: v.array(v.float64()),
    orgId: v.string(),
    enabled: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_tool", ["toolId"])
    .index("by_org", ["orgId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["orgId", "enabled"],
    }),

  nex_browse_jobs: defineTable({
    orgId: v.string(),
    slug: v.string(),
    status: v.union(v.literal("pending"), v.literal("done"), v.literal("error")),
    result: v.optional(v.string()), // BrowseSchema JSON
    error: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_org_status", ["orgId", "status"]),

  nex_wallets: defineTable({
    orgId: v.string(),
    network: v.string(),
    address: v.string(),
    walletData: v.string(),
    status: v.union(v.literal("active"), v.literal("frozen"), v.literal("archived")),
    guardrails: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"]),

  // ─── Agent Billing ─────────────────────────────────────

  agentKeys: defineTable({
    apiKey: v.string(),
    walletAddress: v.string(),
    credit: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_api_key", ["apiKey"])
    .index("by_wallet", ["walletAddress"]),

  usage: defineTable({
    keyId: v.id("agentKeys"),
    slug: v.string(),
    txHash: v.optional(v.string()),
    cost: v.string(),
    timestamp: v.number(),
    liveUrl: v.string(),
  })
    .index("by_key_time", ["keyId", "timestamp"])
    .index("by_tx_hash", ["txHash"]),

  nex_skills: defineTable({
    orgId: v.string(),
    name: v.string(),
    description: v.string(),
    command: v.string(),                 // slash command trigger (e.g., "/weather")
    type: v.union(v.literal("builtin"), v.literal("learned"), v.literal("certified"), v.literal("knowledge")),
    handler: v.string(),                 // job payload template (JSON)
    enabled: v.boolean(),
    metadata: v.optional(v.object({
      certificationId: v.optional(v.string()),
      certifiedAt: v.optional(v.number()),
      score: v.optional(v.float64()),
      source: v.optional(v.string()),
    })),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_command", ["orgId", "command"]),

});
