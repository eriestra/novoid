import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// --- Helper functions ---

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  if (text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize));
    start += chunkSize - overlap;
  }
  return chunks;
}

async function getEmbedding(apiKey: string, text: string): Promise<number[]> {
  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://eriestra.github.io/novoid/",
      "X-Title": "novoid-nex",
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: text,
    }),
  });
  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  return data.data[0].embedding;
}

// --- Internal queries ---

export const getApiKey = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const key = await ctx.db
      .query("keys")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    return key?.value || null;
  },
});

export const searchByContent = internalQuery({
  args: {
    orgId: v.string(),
    queryText: v.string(),
    type: v.optional(v.string()),
    slug: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { orgId, queryText, type, slug, limit }) => {
    const q = ctx.db
      .query("nex_memory")
      .withSearchIndex("by_content", (search: any) => {
        let s = search.search("content", queryText).eq("orgId", orgId);
        if (type) s = s.eq("type", type);
        if (slug) s = s.eq("slug", slug);
        return s;
      });
    return await q.take(limit || 16);
  },
});

export const getByIds = internalQuery({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, { ids }) => {
    const results = [];
    for (const id of ids) {
      const doc = await ctx.db.get(id as any);
      if (doc) results.push({
        _id: doc._id,
        content: (doc as any).content,
        type: (doc as any).type,
        metadata: (doc as any).metadata,
        createdAt: (doc as any).createdAt,
        conversationId: (doc as any).conversationId,
      });
    }
    return results;
  },
});

// --- Internal mutation ---

export const insertMemory = internalMutation({
  args: {
    orgId: v.string(),
    slug: v.optional(v.string()),
    conversationId: v.optional(v.string()),
    type: v.string(),
    content: v.string(),
    embedding: v.array(v.float64()),
    metadata: v.optional(
      v.object({
        source: v.optional(v.string()),
        importance: v.optional(v.float64()),
        tags: v.optional(v.array(v.string())),
      })
    ),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("nex_memory", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// --- Public actions ---

export const memorize = action({
  args: {
    orgId: v.string(),
    content: v.string(),
    type: v.string(),
    slug: v.optional(v.string()),
    conversationId: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        source: v.optional(v.string()),
        importance: v.optional(v.float64()),
        tags: v.optional(v.array(v.string())),
      })
    ),
  },
  handler: async (ctx, { orgId, content, type, slug, conversationId, metadata }) => {
    const apiKey = await ctx.runQuery(internal.nexMemory.getApiKey, {
      name: "OPENROUTER_KEY",
    });
    if (!apiKey) throw new Error("OPENROUTER_KEY not found in keys table");

    const DEDUP_THRESHOLD = 0.92; // cosine similarity above this = duplicate
    const chunks = chunkText(content, 1600, 320);
    const expiresAt =
      type === "short" ? Date.now() + 7 * 24 * 60 * 60 * 1000 : undefined;

    let stored = 0;
    let skipped = 0;
    for (const chunk of chunks) {
      const embedding = await getEmbedding(apiKey, chunk);

      // Dedup guard: check if a near-identical memory already exists
      const similar = await ctx.vectorSearch("nex_memory", "by_embedding", {
        vector: embedding,
        limit: 1,
        filter: (q: any) => q.eq("orgId", orgId),
      });
      if (similar.length > 0 && similar[0]._score >= DEDUP_THRESHOLD) {
        skipped++;
        continue;
      }

      await ctx.runMutation(internal.nexMemory.insertMemory, {
        orgId,
        slug,
        conversationId,
        type,
        content: chunk,
        embedding,
        metadata,
        expiresAt,
      });
      stored++;
    }

    return { chunksStored: stored, chunksSkipped: skipped };
  },
});

export const recall = action({
  args: {
    orgId: v.string(),
    query: v.string(),
    type: v.optional(v.string()),
    slug: v.optional(v.string()),
    conversationId: v.optional(v.string()),
    crosstalk: v.optional(v.float64()),  // 0.0 = focused (this conv only), 1.0 = creative (all memories)
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { orgId, query: queryText, type, slug, conversationId, crosstalk, limit }) => {
    const apiKey = await ctx.runQuery(internal.nexMemory.getApiKey, {
      name: "OPENROUTER_KEY",
    });
    if (!apiKey) throw new Error("OPENROUTER_KEY not found in keys table");

    const k = limit || 8;
    const ct = crosstalk ?? 0.5;  // default balanced
    const queryEmbedding = await getEmbedding(apiKey, queryText);

    // Vector search — always org-wide (we apply crosstalk weighting after)
    const vectorResults = await ctx.vectorSearch("nex_memory", "by_embedding", {
      vector: queryEmbedding,
      limit: k * 3,  // fetch more to have enough after crosstalk filtering
      filter: (q: any) => {
        const conditions = [q.eq("orgId", orgId)];
        if (type) conditions.push(q.eq("type", type));
        if (slug) conditions.push(q.eq("slug", slug));
        return conditions.length === 1 ? conditions[0] : q.and(...conditions);
      },
    });

    // Full-text search — org-wide
    const textResults = await ctx.runQuery(
      internal.nexMemory.searchByContent,
      { orgId, queryText, type, slug, limit: k * 3 }
    );

    // Merge with weighted fusion: 0.7 vector + 0.3 text
    const scoreMap = new Map<
      string,
      { content: string; score: number; id: string; type?: string; metadata?: any; createdAt?: number; conversationId?: string }
    >();

    for (let i = 0; i < vectorResults.length; i++) {
      const r = vectorResults[i];
      const vectorScore = 1 - i / vectorResults.length;
      scoreMap.set(r._id as string, {
        content: "",
        score: 0.7 * vectorScore,
        id: r._id as string,
      });
    }

    for (let i = 0; i < textResults.length; i++) {
      const r = textResults[i];
      const textScore = 1 - i / textResults.length;
      const id = r._id as string;
      const existing = scoreMap.get(id);
      if (existing) {
        existing.score += 0.3 * textScore;
        existing.content = r.content;
      } else {
        scoreMap.set(id, {
          content: r.content,
          score: 0.3 * textScore,
          id,
        });
      }
    }

    // Fetch full docs for all results (need type, metadata, createdAt, conversationId)
    const allIds = [...scoreMap.keys()];
    if (allIds.length > 0) {
      const docs = await ctx.runQuery(internal.nexMemory.getByIds, {
        ids: allIds,
      });
      for (const doc of docs) {
        const entry = scoreMap.get(doc._id as string);
        if (entry) {
          entry.content = entry.content || doc.content;
          entry.type = doc.type;
          entry.metadata = doc.metadata;
          entry.createdAt = doc.createdAt;
          entry.conversationId = doc.conversationId;
        }
      }
    }

    // Apply crosstalk weighting: memories from same conversation get full score,
    // memories from other conversations get score × crosstalk
    if (conversationId) {
      for (const entry of scoreMap.values()) {
        const sameConv = entry.conversationId === conversationId;
        if (!sameConv) {
          entry.score *= ct;  // dampen cross-conversation memories
        }
      }
    }

    // Sort by score, return top-K
    return [...scoreMap.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  },
});
