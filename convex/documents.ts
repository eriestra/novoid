import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { hashSecret } from "./lib";

export const save = mutation({
  args: {
    docId: v.string(),
    writeToken: v.string(),
    title: v.string(),
    icon: v.string(),
    blocks: v.string(),
    customBlocks: v.optional(v.string()),
  },
  handler: async (ctx, { docId, writeToken, title, icon, blocks, customBlocks }) => {
    const tokenHash = await hashSecret(writeToken);

    const existing = await ctx.db
      .query("documents")
      .withIndex("by_docId", (q) => q.eq("docId", docId))
      .first();

    const patch: Record<string, unknown> = {
      title,
      icon,
      blocks,
      updatedAt: Date.now(),
    };
    if (customBlocks !== undefined) patch.customBlocks = customBlocks;

    if (existing) {
      // Verify write token
      if (existing.writeToken !== tokenHash) {
        throw new Error("Invalid write token");
      }
      await ctx.db.patch(existing._id, patch);
    } else {
      // New document — store hashed token
      await ctx.db.insert("documents", {
        docId,
        writeToken: tokenHash,
        title,
        icon,
        blocks,
        customBlocks,
        updatedAt: Date.now(),
      });
    }
  },
});

export const load = query({
  args: { docId: v.string() },
  handler: async (ctx, { docId }) => {
    const doc = await ctx.db
      .query("documents")
      .withIndex("by_docId", (q) => q.eq("docId", docId))
      .first();
    if (!doc) return null;
    // Don't expose writeToken hash
    return {
      docId: doc.docId,
      title: doc.title,
      icon: doc.icon,
      blocks: doc.blocks,
      customBlocks: doc.customBlocks,
      updatedAt: doc.updatedAt,
    };
  },
});

// ─── Server-side store action execution ──────────────────

let _uidCounter = 0;
function uid(): string {
  return "sb" + Date.now().toString(36) + (++_uidCounter).toString(36);
}

type Block = {
  id: string;
  type: string;
  content: string;
  marks: Mark[];
  children: any[];
  parent: string | null;
  indent: number;
  meta: Record<string, any>;
};

type Mark = {
  type: string;
  from: number;
  to: number;
  meta?: Record<string, any>;
};

function makeBlock(type: string, content: string, meta?: Record<string, any>): Block {
  return { id: uid(), type: type || "paragraph", content: content || "", marks: [], children: [], parent: null, indent: 0, meta: meta || {} };
}

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function mergeSameTypeMarks(marks: Mark[], type: string): Mark[] {
  const ofType = marks.filter((m) => m.type === type).sort((a, b) => a.from - b.from);
  const other = marks.filter((m) => m.type !== type);
  const merged: Mark[] = [];
  ofType.forEach((m) => {
    const last = merged[merged.length - 1];
    if (last && last.to >= m.from) {
      last.to = Math.max(last.to, m.to);
    } else {
      merged.push({ ...m });
    }
  });
  return other.concat(merged);
}

// UI-only actions that don't affect persisted state
const UI_ONLY_ACTIONS = new Set([
  "setFocus", "selectBlocks", "clearSelection",
  "openSlash", "closeSlash", "filterSlash",
  "openHandleMenu", "closeHandleMenu",
  "toggleExpand", "undo", "redo",
  "removeSelectedBlocks", "registerBlock",
]);

function executeAction(
  actionName: string,
  state: { doc: { title: string; icon: string }; blocks: Block[] },
  args: any,
): Record<string, any> {
  const blocks = state.blocks;

  switch (actionName) {
    case "addBlock": {
      const type = args.type || "paragraph";
      const afterId = args.afterId;
      const content = args.content || "";
      const meta = args.meta || {};
      const b = makeBlock(type, content, meta);
      const newBlocks = clone(blocks);
      if (afterId) {
        const idx = newBlocks.findIndex((x: Block) => x.id === afterId);
        if (idx >= 0) newBlocks.splice(idx + 1, 0, b);
        else newBlocks.push(b);
      } else {
        newBlocks.push(b);
      }
      return { blocks: newBlocks, newBlockId: b.id };
    }

    case "removeBlock": {
      if (blocks.length <= 1) return {};
      const newBlocks = blocks.filter((x: Block) => x.id !== args.id);
      return { blocks: newBlocks };
    }

    case "updateContent": {
      const newBlocks = clone(blocks);
      const b = newBlocks.find((x: Block) => x.id === args.id);
      if (!b) return {};
      const oldLen = b.content.length;
      b.content = args.content;
      if (b.marks.length && args.editPos != null) {
        const delta = args.content.length - oldLen;
        b.marks = b.marks.map((m: Mark) => {
          const mc = { ...m };
          if (mc.from >= args.editPos) mc.from = Math.max(0, mc.from + delta);
          if (mc.to >= args.editPos) mc.to = Math.max(mc.from, mc.to + delta);
          return mc;
        }).filter((m: Mark) => m.from < m.to);
      }
      return { blocks: newBlocks };
    }

    case "setBlockMeta": {
      const newBlocks = clone(blocks);
      const b = newBlocks.find((x: Block) => x.id === args.id);
      if (!b) return {};
      b.meta = { ...b.meta, ...args.meta };
      return { blocks: newBlocks };
    }

    case "convertBlock": {
      const newBlocks = clone(blocks);
      const b = newBlocks.find((x: Block) => x.id === args.id);
      if (!b) return {};
      b.type = args.type;
      if (args.meta) b.meta = { ...b.meta, ...args.meta };
      if (args.content != null) b.content = args.content;
      return { blocks: newBlocks };
    }

    case "splitBlock": {
      const newBlocks = clone(blocks);
      const idx = newBlocks.findIndex((x: Block) => x.id === args.id);
      if (idx < 0) return {};
      const b = newBlocks[idx];
      const offset = args.offset || 0;
      const after = b.content.slice(offset);
      b.content = b.content.slice(0, offset);
      const leftMarks: Mark[] = [];
      const rightMarks: Mark[] = [];
      (b.marks || []).forEach((m: Mark) => {
        if (m.to <= offset) leftMarks.push(m);
        else if (m.from >= offset) rightMarks.push({ type: m.type, from: m.from - offset, to: m.to - offset, meta: m.meta });
        else {
          leftMarks.push({ type: m.type, from: m.from, to: offset, meta: m.meta });
          rightMarks.push({ type: m.type, from: 0, to: m.to - offset, meta: m.meta });
        }
      });
      b.marks = leftMarks;
      const newB = makeBlock("paragraph", after);
      newB.marks = rightMarks;
      newB.indent = b.indent;
      newBlocks.splice(idx + 1, 0, newB);
      return { blocks: newBlocks, newBlockId: newB.id };
    }

    case "mergeBlocks": {
      const newBlocks = clone(blocks);
      const idx = newBlocks.findIndex((x: Block) => x.id === args.id);
      if (idx <= 0) return {};
      const prev = newBlocks[idx - 1];
      const cur = newBlocks[idx];
      if (prev.type === "divider") {
        newBlocks.splice(idx - 1, 1);
        return { blocks: newBlocks };
      }
      const prevLen = prev.content.length;
      prev.content += cur.content;
      const shifted = (cur.marks || []).map((m: Mark) => ({ type: m.type, from: m.from + prevLen, to: m.to + prevLen, meta: m.meta }));
      prev.marks = (prev.marks || []).concat(shifted);
      newBlocks.splice(idx, 1);
      return { blocks: newBlocks };
    }

    case "indentBlock": {
      const newBlocks = clone(blocks);
      const b = newBlocks.find((x: Block) => x.id === args.id);
      if (!b || b.indent >= 3) return {};
      b.indent++;
      return { blocks: newBlocks };
    }

    case "outdentBlock": {
      const newBlocks = clone(blocks);
      const b = newBlocks.find((x: Block) => x.id === args.id);
      if (!b || b.indent <= 0) return {};
      b.indent--;
      return { blocks: newBlocks };
    }

    case "moveBlock": {
      const newBlocks = clone(blocks);
      const fromIdx = newBlocks.findIndex((x: Block) => x.id === args.id);
      if (fromIdx < 0) return {};
      const moved = newBlocks.splice(fromIdx, 1)[0];
      if (args.afterId) {
        const toIdx = newBlocks.findIndex((x: Block) => x.id === args.afterId);
        newBlocks.splice(toIdx + 1, 0, moved);
      } else if (args.direction === "up" && fromIdx > 0) {
        newBlocks.splice(fromIdx - 1, 0, moved);
      } else if (args.direction === "down" && fromIdx < newBlocks.length) {
        newBlocks.splice(fromIdx + 1, 0, moved);
      } else {
        newBlocks.splice(fromIdx, 0, moved);
        return {};
      }
      return { blocks: newBlocks };
    }

    case "duplicateBlock": {
      const newBlocks = clone(blocks);
      const idx = newBlocks.findIndex((x: Block) => x.id === args.id);
      if (idx < 0) return {};
      const dup = clone(newBlocks[idx]);
      dup.id = uid();
      newBlocks.splice(idx + 1, 0, dup);
      return { blocks: newBlocks, newBlockId: dup.id };
    }

    case "continueList": {
      const newBlocks = clone(blocks);
      const idx = newBlocks.findIndex((x: Block) => x.id === args.id);
      if (idx < 0) return {};
      const b = newBlocks[idx];
      if (!b.content.trim()) {
        if (b.indent > 0) { b.indent--; return { blocks: newBlocks }; }
        b.type = "paragraph";
        b.meta = {};
        return { blocks: newBlocks };
      }
      const offset = args.offset || 0;
      const after = b.content.slice(offset);
      b.content = b.content.slice(0, offset);
      const leftMarks: Mark[] = [];
      const rightMarks: Mark[] = [];
      (b.marks || []).forEach((m: Mark) => {
        if (m.to <= offset) leftMarks.push(m);
        else if (m.from >= offset) rightMarks.push({ type: m.type, from: m.from - offset, to: m.to - offset, meta: m.meta });
        else {
          leftMarks.push({ type: m.type, from: m.from, to: offset, meta: m.meta });
          rightMarks.push({ type: m.type, from: 0, to: m.to - offset, meta: m.meta });
        }
      });
      b.marks = leftMarks;
      const newB = makeBlock(b.type, after, b.type === "todoList" ? { checked: false } : { ...b.meta });
      newB.marks = rightMarks;
      newB.indent = b.indent;
      newBlocks.splice(idx + 1, 0, newB);
      return { blocks: newBlocks, newBlockId: newB.id };
    }

    case "mergeWithNext": {
      const newBlocks = clone(blocks);
      const idx = newBlocks.findIndex((x: Block) => x.id === args.id);
      if (idx < 0 || idx >= newBlocks.length - 1) return {};
      const cur = newBlocks[idx];
      const next = newBlocks[idx + 1];
      if (next.type === "divider") {
        newBlocks.splice(idx + 1, 1);
        return { blocks: newBlocks };
      }
      const curLen = cur.content.length;
      cur.content += next.content;
      const shifted = (next.marks || []).map((m: Mark) => ({ type: m.type, from: m.from + curLen, to: m.to + curLen, meta: m.meta }));
      cur.marks = (cur.marks || []).concat(shifted);
      newBlocks.splice(idx + 1, 1);
      return { blocks: newBlocks };
    }

    case "toggleMark": {
      const newBlocks = clone(blocks);
      const b = newBlocks.find((x: Block) => x.id === args.id);
      if (!b) return {};
      const { from, to, type } = args;
      if (from == null || to == null || from === to) return {};
      const meta = args.meta || undefined;
      const existing = b.marks.findIndex((m: Mark) => m.type === type && m.from <= from && m.to >= to);
      if (existing >= 0) {
        const em = b.marks[existing];
        b.marks.splice(existing, 1);
        if (em.from < from) b.marks.push({ type, from: em.from, to: from, meta: em.meta });
        if (em.to > to) b.marks.push({ type, from: to, to: em.to, meta: em.meta });
      } else {
        b.marks.push({ type, from, to, meta });
        b.marks = mergeSameTypeMarks(b.marks, type);
      }
      return { blocks: newBlocks };
    }

    case "toggleCheck": {
      const newBlocks = clone(blocks);
      const b = newBlocks.find((x: Block) => x.id === args.id);
      if (!b || b.type !== "todoList") return {};
      b.meta = { ...b.meta, checked: !b.meta.checked };
      return { blocks: newBlocks };
    }

    case "setTitle":
      return { doc: { title: args.title, icon: state.doc.icon } };

    case "setIcon":
      return { doc: { title: state.doc.title, icon: args.icon } };

    default:
      if (UI_ONLY_ACTIONS.has(actionName)) {
        return { _uiOnly: true, note: `${actionName} is a UI-only action, not persisted.` };
      }
      throw new Error(`Unknown action: ${actionName}`);
  }
}

export const applyAction = mutation({
  args: {
    docId: v.string(),
    writeToken: v.string(),
    actionName: v.string(),
    actionArgs: v.any(),
  },
  handler: async (ctx, { docId, writeToken, actionName, actionArgs }) => {
    const tokenHash = await hashSecret(writeToken);
    const doc = await ctx.db
      .query("documents")
      .withIndex("by_docId", (q) => q.eq("docId", docId))
      .first();
    if (!doc) throw new Error("Document not found");
    if (doc.writeToken !== tokenHash) throw new Error("Invalid write token");

    // UI-only actions — no DB write needed
    if (UI_ONLY_ACTIONS.has(actionName)) {
      return { _uiOnly: true, note: `${actionName} is a UI-only action, not persisted.` };
    }

    const blocks: Block[] = JSON.parse(doc.blocks);
    const state = { doc: { title: doc.title, icon: doc.icon }, blocks };

    const result = executeAction(actionName, state, actionArgs || {});

    // Merge result into state
    const newBlocks = result.blocks || blocks;
    const newTitle = result.doc?.title ?? doc.title;
    const newIcon = result.doc?.icon ?? doc.icon;

    await ctx.db.patch(doc._id, {
      blocks: JSON.stringify(newBlocks),
      title: newTitle,
      icon: newIcon,
      updatedAt: Date.now(),
    });

    return { action: actionName, blocks: newBlocks, doc: { title: newTitle, icon: newIcon }, ...(result.newBlockId ? { newBlockId: result.newBlockId } : {}) };
  },
});

export const list = query({
  handler: async (ctx) => {
    const docs = await ctx.db
      .query("documents")
      .order("desc")
      .take(50);
    return docs.map((d) => ({
      docId: d.docId,
      title: d.title,
      icon: d.icon,
      updatedAt: d.updatedAt,
    }));
  },
});
