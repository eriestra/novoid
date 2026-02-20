import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { verifySecret } from "./lib";

// ─── OpenRouter app identity (shows in logs) ─────────────
const OR_APP_HEADERS = {
  "HTTP-Referer": "https://eriestra.github.io/novoid/",
  "X-Title": "novoid-nex",
};

// ─── Verify (structural lint) ─────────────────────────────

export const verify = action({
  args: { html: v.string() },
  handler: async (_ctx, { html }) => {
    const issues: string[] = [];

    // Missing framework imports
    if (!html.includes("core.min.css") && !html.includes("novoid.min.css")) {
      issues.push("Missing CSS framework import (core.min.css)");
    }
    if (!html.includes("core.min.js") && !html.includes("novoid.min.js")) {
      issues.push("Missing JS framework import (core.min.js)");
    }

    // </script> inside JS strings
    const scriptBlocks = html.match(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi) || [];
    for (const block of scriptBlocks) {
      if (block.includes("src=")) continue; // external script, skip
      const jsContent = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
      // Check for literal </script> inside string literals
      const stringPattern = /(['"`])[\s\S]*?\1/g;
      let match;
      while ((match = stringPattern.exec(jsContent)) !== null) {
        if (match[0].includes("</script>")) {
          issues.push("Literal </script> inside JS string — use '</' + 'script>' instead");
          break;
        }
      }
    }

    // Missing DOCTYPE
    if (!html.trim().toLowerCase().startsWith("<!doctype")) {
      issues.push("Missing <!DOCTYPE html>");
    }

    // Inline event handlers (onclick=, onchange=, etc.)
    const inlineHandlers = html.match(/\s(on\w+)=/gi);
    if (inlineHandlers && inlineHandlers.length > 0) {
      issues.push(`Found inline event handlers (${inlineHandlers.slice(0, 3).join(", ")}...) — use Novoid.h() instead`);
    }

    // Missing IIFE wrapper in main script
    const mainScripts = scriptBlocks.filter(b => !b.includes("src=") && b.length > 200);
    for (const block of mainScripts) {
      const js = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
      if (!js.startsWith("(function") && !js.startsWith("(() =>") && !js.startsWith("(()=>") && !js.startsWith("!function")) {
        // Check if it has top-level code that should be wrapped
        if (js.includes("Novoid.") && !js.includes("window.addEventListener")) {
          issues.push("Main script block should use an IIFE wrapper");
        }
      }
    }

    return {
      passed: issues.length === 0,
      issues,
    };
  },
});

// ─── Send Channel Message ──────────────────────────────────

export const sendChannelMessage = action({
  args: {
    orgId: v.string(),
    channelType: v.string(),
    payload: v.string(), // JSON: { chatId, text, parseMode?, replyToMessageId? }
  },
  handler: async (ctx, { orgId, channelType, payload }) => {
    const channel = await ctx.runQuery(internal.nexActions.getChannelConfig, { orgId, type: channelType });
    if (!channel) throw new Error(`No ${channelType} channel configured for org ${orgId}`);

    const config = JSON.parse(channel.config);
    const msg = JSON.parse(payload);

    if (channelType === "telegram") {
      const botToken = config.botToken;
      if (!botToken) throw new Error("Telegram botToken not configured");

      const text = (msg.text || "").slice(0, 4000);
      if (!text) throw new Error("Cannot send empty message to Telegram");

      // Split long messages into chunks (Telegram limit ~4096)
      const chunks: string[] = [];
      const CHUNK_SIZE = 4000;
      for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        chunks.push(text.slice(i, i + CHUNK_SIZE));
      }

      const results: unknown[] = [];
      for (const chunk of chunks) {
        const tgBody: Record<string, unknown> = {
          chat_id: msg.chatId,
          text: chunk,
          parse_mode: msg.parseMode || "Markdown",
        };
        if (msg.replyToMessageId) {
          tgBody.reply_to_message_id = msg.replyToMessageId;
        }
        if (msg.replyMarkup) {
          tgBody.reply_markup = msg.replyMarkup;
        }

        const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tgBody),
        });
        if (!resp.ok) {
          // Markdown parse error — retry without parse_mode
          const errText = await resp.text();
          if (resp.status === 400 && errText.includes("parse")) {
            const retryBody = { ...tgBody };
            delete retryBody.parse_mode;
            const retry = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(retryBody),
            });
            if (!retry.ok) {
              const retryErr = await retry.text();
              throw new Error(`Telegram API ${retry.status}: ${retryErr.slice(0, 300)}`);
            }
            results.push(await retry.json());
          } else {
            throw new Error(`Telegram API ${resp.status}: ${errText.slice(0, 300)}`);
          }
        } else {
          results.push(await resp.json());
        }
      }
      return results.length === 1 ? results[0] : results;
    }

    if (channelType === "slack") {
      const botToken = config.botToken;
      if (!botToken) throw new Error("Slack botToken not configured");

      const resp = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: msg.channelId || msg.chatId,
          text: msg.text,
          thread_ts: msg.threadTs,
        }),
      });
      if (!resp.ok) throw new Error(`Slack API ${resp.status}`);
      return await resp.json();
    }

    if (channelType === "discord") {
      const botToken = config.botToken;
      if (!botToken) throw new Error("Discord botToken not configured");

      const resp = await fetch(`https://discord.com/api/v10/channels/${msg.channelId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: msg.text }),
      });
      if (!resp.ok) throw new Error(`Discord API ${resp.status}`);
      return await resp.json();
    }

    if (channelType === "webhook") {
      const webhookUrl = config.url || msg.replyUrl;
      if (!webhookUrl) throw new Error("No webhook URL configured");

      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: msg.text }),
      });
      return { ok: resp.ok, status: resp.status };
    }

    throw new Error(`Unsupported channel type: ${channelType}`);
  },
});

// ─── Web Search ─────────────────────────────────────────────

export const webSearch = action({
  args: {
    query: v.string(),
    orgId: v.string(),
  },
  handler: async (ctx, { query: searchQuery, orgId }) => {
    const apiKey = await ctx.runQuery(internal.nexMemory.getApiKey, { name: "BRAVE_SEARCH_KEY" });
    if (!apiKey) {
      return { results: [], note: "BRAVE_SEARCH_KEY not set — web search unavailable" };
    }

    const resp = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery)}&count=5`, {
      headers: { "Accept": "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": apiKey },
    });
    if (!resp.ok) throw new Error(`Brave Search ${resp.status}`);
    const data = await resp.json();
    return {
      results: (data.web?.results || []).slice(0, 5).map((r: any) => ({
        title: r.title,
        url: r.url,
        description: r.description,
      })),
    };
  },
});

// ─── Web Fetch ──────────────────────────────────────────────

export const webFetch = action({
  args: {
    url: v.string(),
    maxLength: v.optional(v.number()),
  },
  handler: async (_ctx, { url, maxLength }) => {
    const resp = await fetch(url, {
      headers: { "User-Agent": "NexBot/1.0" },
    });
    if (!resp.ok) throw new Error(`Fetch ${resp.status}: ${url}`);
    const text = await resp.text();
    const limit = maxLength || 10000;
    return { content: text.slice(0, limit), truncated: text.length > limit, length: text.length };
  },
});

// ─── Internal helpers ───────────────────────────────────────

export const getChannelConfig = internalQuery({
  args: { orgId: v.string(), type: v.string() },
  handler: async (ctx, { orgId, type }) => {
    return await ctx.db
      .query("nex_channels")
      .withIndex("by_org_type", (q) => q.eq("orgId", orgId).eq("type", type))
      .first();
  },
});

export const updateJobStatus = internalMutation({
  args: {
    jobId: v.id("nex_jobs"),
    status: v.string(),
    result: v.optional(v.string()),
  },
  handler: async (ctx, { jobId, status, result }) => {
    const patch: Record<string, unknown> = { status, updatedAt: Date.now() };
    if (result !== undefined) patch.result = result;
    await ctx.db.patch(jobId, patch);
  },
});

// ─── Tool Corpus ────────────────────────────────────────────

export const searchTools = action({
  args: { query: v.string(), orgId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { query: searchQuery, orgId, limit }) => {
    const apiKey = await ctx.runQuery(internal.nexMemory.getApiKey, { name: "OPENROUTER_KEY" });
    if (!apiKey) return [];

    // Get embedding for search query
    const embResp = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...OR_APP_HEADERS,
      },
      body: JSON.stringify({ model: "openai/text-embedding-3-small", input: searchQuery }),
    });
    if (!embResp.ok) return [];
    const embData = await embResp.json();
    const vector = embData.data[0].embedding;

    const results = await ctx.vectorSearch("nex_tool_corpus", "by_embedding", {
      vector,
      limit: limit || 5,
      filter: (q: any) => q.eq("orgId", orgId).eq("enabled", true),
    });

    // Fetch full docs
    const tools = [];
    for (const r of results) {
      const doc = await ctx.runQuery(internal.nexActions.getToolById, { id: r._id });
      if (doc) tools.push({ name: doc.name, description: doc.description, api: doc.api, spec: doc.spec });
    }
    return tools;
  },
});

export const getToolById = internalQuery({
  args: { id: v.id("nex_tool_corpus") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const seedTool = mutation({
  args: {
    toolId: v.string(),
    name: v.string(),
    description: v.string(),
    api: v.string(),
    spec: v.string(),
    embedding: v.array(v.float64()),
    orgId: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { secret, ...tool }) => {
    await verifySecret(ctx, secret);
    // Upsert by toolId
    const existing = await ctx.db
      .query("nex_tool_corpus")
      .withIndex("by_tool", (q) => q.eq("toolId", tool.toolId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...tool, enabled: true });
      return existing._id;
    }
    return await ctx.db.insert("nex_tool_corpus", {
      ...tool,
      enabled: true,
      createdAt: Date.now(),
    });
  },
});

export const listTools = query({
  args: { orgId: v.string() },
  handler: async (ctx, { orgId }) => {
    return await ctx.db
      .query("nex_tool_corpus")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
  },
});

// ─── Heartbeat Job Creation (called from cron) ─────────────

export const createHeartbeatJobs = internalMutation({
  handler: async (ctx) => {
    // Find all enabled heartbeat configs
    const allConfigs = await ctx.db.query("nex_heartbeat").collect();
    const now = Date.now();
    let created = 0;

    for (const config of allConfigs) {
      if (!config.enabled) continue;

      // Check active hours
      if (config.activeHours) {
        try {
          const nowDate = new Date();
          // Simple hour check (timezone-aware would need Intl but this is good enough)
          const hour = nowDate.getUTCHours();
          const startHour = parseInt(config.activeHours.start.split(":")[0]);
          const endHour = parseInt(config.activeHours.end.split(":")[0]);
          if (hour < startHour || hour >= endHour) continue;
        } catch { /* skip hour check on parse error */ }
      }

      // Check interval
      const lastRun = config.lastRunAt || 0;
      if (now - lastRun < config.intervalMs) continue;

      // Create single heartbeat job with full checklist
      await ctx.db.insert("nex_jobs", {
        orgId: config.orgId,
        type: "heartbeat",
        payload: JSON.stringify({ checklist: config.checklist || "" }),
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });

      // Update lastRunAt
      await ctx.db.patch(config._id, { lastRunAt: now });
      created++;
    }
    return created;
  },
});

// Internal mutation for adding messages (no secret needed, server-side only)
export const addMessageInternal = internalMutation({
  args: {
    conversationId: v.id("nex_conversations"),
    role: v.string(),
    content: v.string(),
    type: v.optional(v.string()),
    appHtml: v.optional(v.string()),
  },
  handler: async (ctx, { conversationId, role, content, type, appHtml }) => {
    await ctx.db.insert("nex_messages", {
      conversationId,
      role,
      content,
      type,
      appHtml,
      createdAt: Date.now(),
    });
    // Update conversation timestamp
    await ctx.db.patch(conversationId, { updatedAt: Date.now() });
  },
});

// ─── Public action wrappers for browser tool execution ──────

export const readPageAction = action({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.runQuery(internal.nexActions.readPageInternal, { slug });
  },
});

export const listPagesAction = action({
  args: {},
  handler: async (ctx) => {
    return await ctx.runQuery(internal.nexActions.listPagesInternal, {});
  },
});

export const checkErrorsAction = action({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.runQuery(internal.nexActions.recentErrorsInternal, { slug });
  },
});

export const getConversationHistory = action({
  args: { conversationId: v.id("nex_conversations"), limit: v.optional(v.number()) },
  handler: async (ctx, { conversationId, limit }) => {
    return await ctx.runQuery(internal.nexActions.conversationMessagesInternal, { conversationId, limit: limit || 20 });
  },
});

// ─── Internal queries for tool execution ────────────────────

export const conversationMessagesInternal = internalQuery({
  args: { conversationId: v.id("nex_conversations"), limit: v.optional(v.number()) },
  handler: async (ctx, { conversationId, limit }) => {
    const msgs = await ctx.db
      .query("nex_messages")
      .withIndex("by_conversation_time", (q) => q.eq("conversationId", conversationId))
      .collect();
    // Return last N messages
    const n = limit || 20;
    return msgs.slice(-n).map(m => ({ role: m.role, content: m.content }));
  },
});

export const listPagesInternal = internalQuery({
  handler: async (ctx) => {
    const pages = await ctx.db.query("pages").collect();
    return pages.map(p => ({ slug: p.slug, updatedAt: p.updatedAt }));
  },
});

export const readPageInternal = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const page = await ctx.db
      .query("pages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!page) return null;
    return { slug: page.slug, html: page.html.slice(0, 10000), updatedAt: page.updatedAt };
  },
});

export const recentErrorsInternal = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("errors")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .order("desc")
      .take(10);
  },
});

export const publishPageInternal = internalMutation({
  args: { slug: v.string(), html: v.string() },
  handler: async (ctx, { slug, html }) => {
    const existing = await ctx.db
      .query("pages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { html, updatedAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("pages", { slug, html, updatedAt: Date.now() });
  },
});
