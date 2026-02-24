# blox — Delta Sync and Agent Authoring Standard

> Every block is a row. Every edit is a surgical mutation. Every agent targets a delimited region. The document is not a blob — it is a reactive collection of individually addressable blocks, authored in a single file whose structure agents can parse without AST tools.

---

## Status Quo

| Aspect | Current implementation | Problem |
|---|---|---|
| Storage | `documents.blocks` — JSON-encoded array in one Convex row (`convex/schema.ts:11`) | Every save serializes the entire document |
| Mutation | `applyAction` parses full blob, `clone(blocks)`, modifies, re-serializes (`convex/documents.ts:153-442`) | O(n) clone on every keystroke |
| Reactivity | Single `documents:load` query per document | Any block change invalidates all subscribers |
| Agent authoring | `bloox.html` is a flat 1500+ line file | No structural boundaries — agents must grep for landmarks |
| Collaboration | Full-document save with `writeToken` auth | Last-write-wins at document granularity |
| Transfer | Every connected client receives full `blocks` JSON on any change | Bandwidth ∝ document size × connected clients |

---

## Part I — Per-Block Delta Sync

### Motivation

| Problem | Impact | Delta sync fix |
|---|---|---|
| Full clone on every edit | Latency grows with doc size | Mutate one row |
| Full blob over the wire | Bandwidth waste for multi-user | Granular subscription per block |
| No surgical agent edits | Agent must read/rewrite entire doc | `updateBlock` targets one `_id` |
| Last-write-wins conflicts | Lost edits in concurrent sessions | Per-block conflict boundary |
| Undo/redo clones entire state | Memory ∝ edits × doc size | Per-block undo entries |

### Schema Design

New `blocks` table alongside existing `documents`:

```ts
// convex/schema.ts — new table
blocks: defineTable({
  docId: v.string(),           // references documents.docId
  blockId: v.string(),         // client-generated stable id (e.g. "b1", nanoid)
  type: v.string(),            // "paragraph", "heading", "code", etc.
  content: v.string(),         // plain text content
  marks: v.string(),           // JSON-encoded Mark[]
  meta: v.string(),            // JSON-encoded type-specific metadata
  indent: v.number(),          // 0-3
  parent: v.optional(v.string()),  // parent blockId for nesting
  orderKey: v.string(),        // fractional ordering key (see below)
  updatedAt: v.number(),
})
  .index("by_doc_order", ["docId", "orderKey"])
  .index("by_doc_block", ["docId", "blockId"])
  .index("by_doc_updated", ["docId", "updatedAt"])
```

The `documents` table retains `title`, `icon`, `ribbon`, `writeToken`, `userId`, `updatedAt`. The `blocks` field becomes `v.optional(v.string())` during migration, then is removed.

### Fractional Key Design

Ordering keys are string-comparable values that allow insertion between any two adjacent blocks without rewriting other rows.

```
Key space: strings from alphabet [A-Za-z0-9]
Initial:   "N" (midpoint)
Between:   midpoint("N", "V") → "R"
Append:    after("z") → "z" + "N"
```

Rules:
1. Keys are variable-length strings. Lexicographic comparison determines order.
2. `midpoint(a, b)` finds the string midpoint. If adjacent in character space, extend with a new character.
3. Keys never collide — ties broken by `blockId` (deterministic fallback).
4. Rebalance when any key exceeds 16 characters (see Emergent Concerns).

```ts
// convex/lib.ts — fractional key helpers
function midpoint(a: string, b: string): string {
  // Find first differing character, compute midpoint
  // If adjacent, append midpoint character to longer prefix
}

function keyBetween(before: string | null, after: string | null): string {
  if (!before && !after) return "N";
  if (!before) return midpoint("", after!);
  if (!after) return after! + "N";  // extend beyond last
  return midpoint(before, after);
}
```

### New Convex Functions

| Function | Type | Purpose |
|---|---|---|
| `blocks:list` | query | All blocks for a docId, ordered by `orderKey` |
| `blocks:get` | query | Single block by docId + blockId |
| `blocks:range` | query | Blocks within orderKey range (viewport optimization) |
| `blocks:insert` | mutation | Create block with computed `orderKey` |
| `blocks:update` | mutation | Patch one block (content, marks, meta, type) |
| `blocks:remove` | mutation | Delete one block row |
| `blocks:move` | mutation | Rewrite `orderKey` for one block |
| `blocks:reorder` | mutation | Batch-rewrite keys when rebalance needed |
| `blocks:batchInsert` | mutation | Insert multiple blocks (paste, migration) |

Auth: All mutations require `writeToken` or session `token`, same pattern as `documents:save`.

Each mutation is self-contained — no read-modify-write of the full document. The client sends the exact change; the server validates auth and writes one row.

### Client-Side Changes

**Before (current):**
```js
// Every action clones all blocks, modifies, re-serializes
addBlock: (state, { type, afterId }) => {
  const blocks = clone(state.blocks);       // O(n) clone
  const b = makeBlock(type, "");
  const idx = blocks.findIndex(x => x.id === afterId);
  blocks.splice(idx + 1, 0, b);
  return { blocks };                         // full array replace
}
```

**After (delta sync):**
```js
// Store action computes local optimistic update + sends surgical mutation
addBlock: (state, { type, afterId }) => {
  const afterBlock = state.blocks.find(x => x.id === afterId);
  const nextBlock = /* next block by orderKey */;
  const orderKey = keyBetween(afterBlock?.orderKey, nextBlock?.orderKey);
  const b = { id: uid(), type, content: "", marks: [], meta: {}, indent: 0, orderKey };

  // Optimistic local insert
  convex.mutation("blocks:insert", { docId: state.docId, blockId: b.id, type, content: "", marks: "[]", meta: "{}", indent: 0, orderKey });

  // Local state sees it immediately
  return { blocks: [...state.blocks, b].sort(byOrderKey) };
}
```

Key difference: the mutation payload is the **delta** (one block), not the full document. Convex's optimistic updates make it feel instant.

### Viewport-Scoped Subscriptions (P2)

For large documents (100+ blocks), subscribe only to visible blocks:

```js
// Subscribe to blocks within viewport orderKey range
const visibleBlocks = useQuery("blocks:range", {
  docId,
  fromKey: viewportStart,
  toKey: viewportEnd,
});
```

This requires the client to track which `orderKey` range is in the viewport (via IntersectionObserver or scroll position). Not required for launch — full `blocks:list` subscription works for documents under ~500 blocks.

### Migration Strategy

Four phases, zero downtime:

| Phase | What happens | Rollback |
|---|---|---|
| **1. Schema** | Add `blocks` table. Make `documents.blocks` optional. Deploy. | Drop table |
| **2. Dual-write** | `applyAction` writes both blob and individual rows. `save` writes both. | Revert to blob-only |
| **3. Read-switch** | Client reads from `blocks:list` instead of `documents:load` for block data. `documents:load` still returns metadata. | Revert client |
| **4. Cleanup** | Remove `documents.blocks` field. Remove dual-write code. | Cannot roll back — commit only after soak period |

Migration script for existing documents:

```ts
// convex/migrate.ts — one-time migration action
export const migrateDocBlocks = internalAction({
  handler: async (ctx) => {
    const docs = await ctx.runQuery(internal.documents.listAll);
    for (const doc of docs) {
      const blocks = JSON.parse(doc.blocks);
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const orderKey = String(i).padStart(8, "0"); // initial linear keys
        await ctx.runMutation(internal.blocks.insertInternal, {
          docId: doc.docId, blockId: b.id, type: b.type,
          content: b.content, marks: JSON.stringify(b.marks),
          meta: JSON.stringify(b.meta), indent: b.indent,
          parent: b.parent || undefined, orderKey,
        });
      }
    }
  },
});
```

---

## Part II — Single-File Agent Authoring Standard

### Delimiter Format

Agents need to locate, read, and replace regions of `bloox.html` without parsing the full file. Delimiter comments define named regions:

```html
<!-- #region block:paragraph -->
function renderParagraph(block, el) { ... }
<!-- #endregion block:paragraph -->

<!-- #region block:heading -->
function renderHeading(block, el) { ... }
<!-- #endregion block:heading -->

<!-- #region store -->
const store = createStore(initialState, { ... });
<!-- #endregion store -->
```

Rules:
1. Delimiters are HTML comments: `<!-- #region <name> -->` and `<!-- #endregion <name> -->`.
2. Region names use colon-separated namespaces: `block:<type>`, `config`, `store`, `render`, `styles`, `init`.
3. Regions do not nest (flat structure — one level only).
4. Every region is self-contained — valid JS/CSS in isolation.
5. Delimiters are preserved across edits. Agents must not remove or rename them.
6. Whitespace between delimiters and content is insignificant.

### Block Registry Pattern

Each block type is a self-contained region that registers itself:

```html
<!-- #region block:poll -->
<script>
registerBlockType('poll', {
  render(block, el) { /* ... */ },
  placeholder: 'Ask a question...',
  enter: 'newline',
  icon: '📊',
  label: 'Poll',
  keywords: ['poll', 'vote', 'survey'],
  meta: { options: [], allowMultiple: false },
});
</script>
<!-- #endregion block:poll -->
```

Agent workflow for adding a new block type:
1. Read the `block:paragraph` region for the pattern.
2. Write a new `<!-- #region block:<type> -->` region.
3. The `registerBlockType` call makes it available to slash commands, rendering, and MCP.

### Regions Beyond Block Types

| Region | Contains | Purpose |
|---|---|---|
| `config` | App metadata, Convex URL, feature flags | Agent reads to understand deployment |
| `store` | `createStore()` call, initial state, all actions | Agent adds/modifies store actions |
| `render` | `render()` call, section mapping, layout | Agent modifies document-level rendering |
| `styles` | `<style>` block with all CSS | Agent adds block-specific styles |
| `init` | `mount()`, event listeners, startup logic | Agent modifies initialization sequence |
| `block:<type>` | One `registerBlockType` call per type | Agent adds or edits block types |

### Agent Authoring Protocol

When an agent edits `bloox.html`:

1. **Read the file** — parse region delimiters to build a map of `{ name → [startLine, endLine] }`.
2. **Identify target region** — determine which region(s) the edit affects.
3. **Read region content** — extract only the target region, not the full file.
4. **Generate replacement** — produce new content for that region, preserving delimiters.
5. **Write region** — replace lines between (exclusive of) delimiters.
6. **Verify** — run `sh verify.sh src/app/bloox.html` to confirm no structural regressions.

This protocol means an agent never needs to understand the full file. It targets a region, edits it, and the delimiter boundaries guarantee isolation.

---

## Part III — Emergent Concerns

### Undo/Redo Across Block Boundaries

Current undo stores full `blocks` array snapshots. With per-block rows, undo must track individual mutations.

| Approach | Trade-off |
|---|---|
| **Client-side undo stack of deltas** | Fast, no server cost. Lost on page refresh. |
| **Server-side undo log** | Persistent, multi-device. Storage cost per edit. |
| **Hybrid** | Client stack for session; server log for cross-session recovery. |

Recommended: client-side delta stack for V1. Each undo entry is `{ blockId, field, oldValue, newValue }`. Multi-block operations (e.g., paste 5 blocks) produce a single compound undo entry.

Compound operations that span blocks (e.g., `mergeBlocks` deletes one row and modifies another) are grouped into a single undo transaction:

```js
undoStack.push({
  type: 'compound',
  ops: [
    { action: 'update', blockId: 'b1', field: 'content', old: 'Hello', new: 'Hello world' },
    { action: 'remove', blockId: 'b2', snapshot: { /* full block data */ } },
  ]
});
```

### Conflict Resolution

Per-block rows reduce the conflict surface from "entire document" to "one block." Two users editing different blocks never conflict.

Same-block conflicts:

| Scenario | Resolution |
|---|---|
| Both edit `content` of same block | Last-write-wins (Convex default). Acceptable for V1 — blocks are small. |
| One deletes block, other edits it | Delete wins. Editor sees block disappear. |
| Both reorder same block | Last-write-wins on `orderKey`. |

P2: Operational transform or CRDT for same-block character-level merging. Not required until real-time collaborative editing is a priority.

### Ordering Key Rebalance

Fractional keys grow unbounded with repeated adjacent insertions (always inserting between the same two blocks). When any key exceeds 16 characters:

1. Server detects during `blocks:insert` or `blocks:move`.
2. Triggers `blocks:reorder` — reads all blocks for the document, assigns fresh linear keys (`"00000001"`, `"00000002"`, ...).
3. Rebalance is a single mutation — atomic from Convex's perspective.
4. Clients see a burst of updates but ordering is unchanged.

Frequency: rare in practice. Requires ~16 consecutive insertions at the same position without any other edits elsewhere.

### Document-Level Operations

Some operations span the full document and don't fit the per-block model:

| Operation | Approach |
|---|---|
| Export (markdown, HTML) | Read all blocks via `blocks:list`, assemble client-side |
| Import (paste, markdown) | Parse into blocks, `blocks:batchInsert` |
| Duplicate document | Query all blocks, `batchInsert` with new docId |
| Delete document | Delete `documents` row + all `blocks` rows for docId |
| Search across document | `blocks:list` + client-side filter (P1); full-text index (P2) |

### Viewport Subscription Lifecycle

When viewport subscriptions are active (P2):

1. Client computes visible `orderKey` range from scroll position.
2. Subscribes to `blocks:range` for that range, with buffer (±20 blocks).
3. On scroll, recomputes range and updates subscription.
4. Blocks outside the range are evicted from local state (but cached for fast re-entry).
5. Total block count is tracked separately via a lightweight `blocks:count` query.

Edge case: a block is deleted while outside the viewport. The client never sees the deletion event. On re-scroll, the block simply isn't in the query result. No conflict.

### Delimiter Governance

Delimiters in `bloox.html` are structural — breaking them breaks agent authoring. Governance rules:

1. `verify.sh` Phase 1 (Nous) validates delimiter integrity: matching open/close, no nesting, no duplicates.
2. Publish rejects files with broken delimiters.
3. Delimiter names are immutable once published. Renaming requires a migration (old name → new name in the same commit).
4. The `block:<type>` namespace is reserved for `registerBlockType` calls. Other namespaces are open.

---

## Implementation Phases

| Phase | Scope | Depends on |
|---|---|---|
| **P0 — Delimiters** | Add `#region`/`#endregion` comments to `bloox.html`. Update `verify.sh` to check delimiter integrity. | Nothing |
| **P1 — Schema + dual-write** | Add `blocks` table. Implement `blocks:*` functions. Dual-write from `applyAction`. Migrate existing docs. | P0 (delimiters make client changes easier to isolate) |
| **P2 — Read-switch** | Client reads from `blocks:list`. Store actions send surgical mutations. Per-block undo. | P1 |
| **P3 — Cleanup + viewport** | Remove `documents.blocks`. Implement viewport-scoped subscriptions. Same-block conflict resolution. | P2 + soak period |

---

## Relationship to Other Specs

| Spec | Relationship |
|---|---|
| `block-editor.md` | Block schema source of truth. Delta sync implements the storage layer for that schema. |
| `composable-apps.md` | Reactive subscription pattern. Delta sync extends it to per-block granularity within a single app. |
| `agent-first.md` | Agent authoring principles. Delimiter regions are the concrete implementation for block editor apps. |
| `skills-system.md` | Skills reference block types and store actions. Delta sync doesn't change the skill interface. |
