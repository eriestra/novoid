# A Block Editor in a Single HTML File

**How no∅ (novoid) makes a Notion-class document editor possible in 2,178 lines — no frameworks, no dependencies, no build step — with a live MCP endpoint that lets AI agents read, write, and transform documents over the network.**

---

## What Is no∅?

no∅ (novoid) is an agent-first application platform. You write one HTML file and get a reactive UI, a real-time database, a live URL, an MCP endpoint, a verification pipeline, and E2E tests.

The platform covers the full stack:
- **Reactive core** — signals, computed values, effects, stores
- **Declarative render system** — typed sections (headers, tables, cards, forms, charts, stats) that map data to UI without manual DOM work
- **CSS design system** — variables, components, layout utilities, dark mode, theming
- **Convex backend** — real-time database, reactive queries, mutations, actions, file storage, crons, HTTP routes
- **Publishing pipeline** — `publish.sh` deploys, verifies, and runs E2E tests in one command
- **Verification pipeline** — static analysis (Nous), headless browser execution (novoid-browser), MCP test harness
- **MCP endpoints** — every app automatically gets an agent-accessible API over Streamable HTTP. Every `createStore` becomes a set of tools that agents can call.
- **Agent infrastructure** — Nex (autonomous agent), Vox (vibe-coded app builder), personas, memory, multi-channel

Apps are single `.html` files that load no∅ from a CDN. No bundler, no build step, no `node_modules`. The MCP surface is generated from the same store actions that drive the UI — there is no separate API layer. Describe it, it's live.

The block editor described in this paper is one application built on no∅. It is the most complex app built on the platform to date, and it serves as a benchmark: if no∅ can handle a Notion-class document editor in a single file, it can handle your app.

---

## The Claim

There is a fully functional block editor — slash commands, drag-and-drop, inline formatting, markdown shortcuts, undo/redo, dark mode, keyboard-driven editing, nested blocks, 20+ block types — running in production as a single `.html` file. It exposes 30 MCP tools that let any AI agent build, edit, and transform documents over HTTP. It's tested by 110 end-to-end tests that run through the same MCP interface.

No React. No ProseMirror. No Slate. No Lexical. No Tiptap. No virtual DOM. No bundler. No `node_modules`. No separate API layer.

One file. 2,178 lines. 30 agent-callable tools. Served from a CDN.

This document explains how it was built, why the architecture works, and what it means for the future of web editors.

---

## The Problem with Block Editors

Building a block editor is one of the hardest problems in frontend engineering. The standard approach looks like this:

1. **Pick a framework** — React, Vue, Svelte
2. **Pick an editor framework** — ProseMirror, Slate, Lexical, Tiptap
3. **Wire them together** — adapters, plugins, schemas, decorations
4. **Fight `contenteditable`** — the DOM API that every editor framework exists to tame
5. **Ship a bundle** — 200KB+ of JavaScript before your first keystroke

The result: months of integration work, a complex dependency tree, and a bundle that weighs more than entire applications used to.

Notion's editor is estimated at 10MB+ of JavaScript. Google Docs loads megabytes of code. Even "lightweight" editors like Tiptap start at 50KB+ gzipped with basic features.

The complexity isn't accidental — these tools solve real problems. But the question is: **do they solve the right problems at the right layer?**

---

## The Insight: Blocks Are Sections

no∅ has a declarative render system built around **sections** — typed, structured UI regions:

```
header  → title + subtitle
table   → columns + rows
cards   → grid of items
stat    → big number + label
form    → fields + validation
chart   → data visualization
list    → ordered/unordered items
divider → horizontal rule
```

A block editor is a document made of typed blocks: headings, paragraphs, code, images, tables, quotes, lists.

**Blocks and sections are the same abstraction.** A heading block is a header section. A data block is a table section. A quote block is a styled section. The block editor extends the render system with cursor management and keyboard handling — the structured rendering was already there.

---

## Architecture

### The Document Is a Store

The entire editor state lives in a single reactive store:

```js
const store = createStore({
  doc: { title: '', icon: '📝' },
  blocks: [
    { id: 'b1', type: 'heading', content: 'Welcome', meta: { level: 1 }, marks: [] },
    { id: 'b2', type: 'paragraph', content: 'Start typing...', marks: [] },
  ],
  focusId: null,
  focusOffset: 0,
  selectedBlocks: [],
  slashMenu: null,
  undoStack: [],
  redoStack: [],
}, actions);
```

Every interaction — typing, formatting, reordering, deleting — is a **store action** that returns partial state. The reactive system patches the DOM. No diffing. No reconciliation. Signal-driven updates that touch only what changed.

### One `contenteditable` Surface Per Block

The critical design decision: `contenteditable` is used **only** for text input in individual blocks. It is not used to manage document structure.

This sidesteps the `contenteditable` nightmare entirely. When you press Enter, the editor doesn't ask the browser to split a DOM node — it runs a store action that creates a new block. When you press Backspace at the start of a block, it merges two data objects, not two DOM trees.

The browser handles what it's good at (text cursor, IME, selection within a paragraph). The store handles what it's good at (document structure, block ordering, type conversions).

### Enter Behavior Registry

Different block types need different Enter behavior. This is declared statically:

| Behavior | Block Types | What Enter Does |
|---|---|---|
| `split` | paragraph, heading, toggle | Split block at cursor, new block below |
| `continue` | bullet list, numbered list, todo | New sibling item; empty item exits to paragraph |
| `newline` | quote, callout, code, math | Newline inside block; double-Enter exits |
| `cell` | table | Move to next cell |
| `none` | divider, image, embed | New paragraph below |

One `handleEnter` action reads the registry and dispatches. No per-block-type spaghetti. Adding a new block type means adding one line to the registry.

### Marks as Ranges, Not HTML

Inline formatting (bold, italic, links, highlights) is stored as offset ranges on plain text:

```js
{
  content: 'Hello world, this is important',
  marks: [
    { type: 'bold', from: 0, to: 5 },
    { type: 'highlight', from: 22, to: 31 }
  ]
}
```

The content is always plain text. Formatting is data. This means:

- **Searchable** — `content.includes('world')` works
- **Diffable** — version control sees text changes, not HTML soup
- **Transformable** — an agent can add formatting without parsing HTML
- **Portable** — export to Markdown, import to any format

The renderer applies marks at paint time, constructing styled spans on the fly.

---

## What Ships in 2,178 Lines

### Block Types (20+)

**Text**: paragraph, heading (H1–H3), quote, callout, toggle, bullet list, numbered list, todo list

**Code & Technical**: code (with syntax highlighting), math (KaTeX), mermaid (diagrams)

**Media**: image, video, audio, file, embed, bookmark

**Structure**: table, columns, divider, spacer

**Interactive**: AI generation block

### Editor Features

- **Slash commands** — type `/` for a fuzzy-searchable command menu with 20+ options
- **Markdown shortcuts** — `# ` for headings, `- ` for bullets, `> ` for quotes, `---` for dividers, ``` for code
- **Inline formatting toolbar** — floating toolbar on text selection (bold, italic, underline, strikethrough, code, link, highlight)
- **Keyboard shortcuts** — Cmd+B/I/U/E/K, Cmd+Z/Shift+Z, Cmd+Shift+Up/Down to move blocks
- **Block handles** — hover to reveal drag handle, click for context menu (delete, duplicate, convert type)
- **Drag and drop** — reorder blocks by dragging
- **Multi-block selection** — Shift+Click or Shift+Arrow to select multiple blocks, then delete/duplicate/move
- **Undo/redo** — full operation history
- **Indentation** — Tab/Shift+Tab for nesting
- **Smart backspace** — empty block deletes, typed block (heading/list) converts to paragraph first, start-of-block merges with previous
- **Auto-save** — debounced persistence to Convex
- **Dark mode** — full theme toggle with CSS custom properties
- **Responsive** — works on mobile viewports

### What's Next — and Why It's Close

The editor doesn't yet ship collaboration, comments, version history, or file uploads. But unlike editors built on static stacks, the infrastructure for these features already exists in no∅:

- **Real-time collaboration** — Convex subscriptions are reactive by default. The store already syncs to Convex with auto-save. Adding presence cursors and live block updates means subscribing multiple clients to the same document query — not integrating a CRDT library from scratch.
- **Version history** — every store mutation pushes to the undo stack. Persisting that stack to Convex (or snapshotting the block array on save) gives you full document history with rollback. The data model is already diffable — blocks are plain JSON.
- **Comments** — a comment is a mark with metadata (`{ type: 'comment', from, to, meta: { threadId, author } }`). The mark system already supports arbitrary metadata ranges. Thread storage is a Convex table.
- **File uploads** — Convex has built-in file storage. The asset pipeline (`seed.sh`) already uploads framework files. Extending it to user uploads is plumbing, not architecture.

The single-file editor is the foundation, not the ceiling.

---

## Size Comparison

| Editor | Base Bundle | Dependencies | Build Required | Agent API |
|---|---|---|---|---|
| **no∅ Blocks** | **~45KB** (single HTML) | **0** (loads core.js + core.css from CDN) | **No** | **30 MCP tools (built-in)** |
| Notion | ~10MB | hundreds | Yes | REST API (separate system) |
| Tiptap + ProseMirror | ~150KB gzipped | 30+ packages | Yes | In-process JS only |
| Lexical (Meta) | ~50KB gzipped | 10+ packages | Yes | In-process JS only |
| Slate | ~80KB gzipped | 15+ packages | Yes | In-process JS only |
| Editor.js | ~60KB gzipped | core + plugins | Yes | In-process JS only |
| Quill | ~40KB gzipped | monolith | Yes | In-process JS only |

### Lines of Code

| Editor | Core LOC | Total LOC (with plugins) | Language | Files |
|---|---|---|---|---|
| **no∅ Blocks** | **2,178** | **2,178** | HTML/JS/CSS | **1** |
| ProseMirror | ~15,000 (core) | ~35,000 (with essential plugins) | TypeScript | ~200 |
| Lexical (Meta) | ~20,000 (core) | ~60,000+ (with plugins) | TypeScript | ~400 |
| Slate | ~8,000 (core) | ~15,000 (with slate-react) | TypeScript | ~100 |
| Tiptap | ~5,000 (wrapper) | ~50,000+ (ProseMirror + extensions) | TypeScript | ~300 |
| Quill | ~10,000 | ~10,000 (monolith) | JavaScript | ~60 |
| Editor.js | ~4,000 (core) | ~12,000 (with block plugins) | TypeScript | ~80 |

These numbers count source code only (no tests, no docs, no configs). ProseMirror/Lexical/Tiptap numbers include only the packages needed for a block editor equivalent to no∅ Blocks — not their full monorepo.

The comparison is not entirely fair: those frameworks are general-purpose toolkits designed for extensibility across thousands of use cases. no∅ Blocks is a specific editor. But that's the point — when your framework already speaks in blocks and sections, you don't need a general-purpose toolkit. You just describe the editor.

The no∅ block editor is not a toy comparison against production editors. It implements the same interaction model (Enter behaviors, backspace merging, slash commands, inline marks, drag reorder, multi-select) that these editors ship. The difference is architectural: it doesn't need the abstraction layers they require, because the platform *is* the editor engine.

---

## Why It Works: The Architectural Advantages

### 1. No Abstraction Gap

In a React + ProseMirror stack, the editor framework maintains its own document model, React maintains its own virtual DOM, and the real DOM is the ground truth for cursor position. Three representations of the same document, constantly synchronized.

In no∅ Blocks, the store is the document. Signals drive DOM updates directly. The cursor lives in the browser's native `contenteditable`. One source of truth, one update path.

### 2. No Plugin System Required

ProseMirror and Slate are powerful because they're extensible — you build your editor from plugins. But that extensibility has a cost: you need plugins for basic functionality (lists, history, keymaps, input rules, drop cursor...).

In no∅ Blocks, features are store actions. Adding a block type means: define its render output, add its Enter behavior to the registry, add it to the slash command list. Three touch points, all in the same file.

### 3. No Schema Migration

ProseMirror requires a formal schema definition for every node and mark type. Changing the schema requires migration logic. Slate has similar constraints.

In no∅ Blocks, a block is a plain object: `{ id, type, content, marks, meta }`. New block types are new `type` strings. New metadata is new `meta` keys. The store doesn't validate structure — it trusts the actions that produce it.

### 4. No Build Step

The file loads two assets from CDN: `core.js` (the reactive runtime) and `core.css` (the design system). Everything else — all 20+ block types, the slash command system, the inline toolbar, drag-and-drop, undo/redo — is authored directly in the HTML file.

This means:
- **Instant deployment** — upload one file
- **Zero configuration** — no webpack, vite, esbuild, rollup
- **Inspectable** — View Source shows the entire editor
- **Forkable** — copy the file, modify it, ship your own editor

### 5. Agent-Native by Design

Covered in depth in the next section — this is the editor's most radical differentiator.

---

## MCP: The Editor That Agents Can Use

This is not a footnote. This is the headline.

The no∅ block editor ships with a **live MCP (Model Context Protocol) endpoint**. Every published app built with `createStore` automatically exposes its store actions as MCP tools and its state as MCP resources. The block editor has **30 tools and 4 resources**, accessible over HTTP with Streamable HTTP transport.

```
GET  /mcp/bloox   → JSON manifest (tools, resources, state)
POST /mcp/bloox   → MCP JSON-RPC
```

### What This Means in Practice

An AI agent — Claude, GPT, a custom LLM, any MCP-compatible client — can connect to the block editor and:

**Read the document:**
```json
// MCP resource: "blocks" → returns full block array
// MCP resource: "doc" → returns { title, icon }
// MCP resource: "focusId" → returns currently focused block
```

**Write the document:**
```json
// MCP tool: addBlock
{ "type": "heading", "afterId": "b1", "meta": { "level": 2 } }

// MCP tool: updateBlock
{ "id": "b2", "content": "This paragraph was written by an agent" }

// MCP tool: toggleMark
{ "blockId": "b2", "type": "bold", "from": 0, to: 14 }
```

**Transform the document:**
```json
// MCP tool: convertBlock — turn a paragraph into a callout
{ "id": "b3", "type": "callout", "meta": { "icon": "⚠️", "color": "orange" } }

// MCP tool: moveBlock — reorder
{ "id": "b5", "afterId": "b1" }

// MCP tool: splitBlock, mergeBlocks, duplicateBlock, indentBlock...
```

All 30 store actions are MCP tools. Not a separate API. Not a wrapper. The same actions a human triggers with keystrokes.

### No Other Block Editor Has This

Let's be explicit about what's different:

| Editor | Programmatic API | Agent Access | Transport |
|---|---|---|---|
| **no∅ Blocks** | **30 MCP tools, 4 resources** | **Any MCP client (Claude, etc.)** | **HTTP (Streamable HTTP)** |
| Notion | REST API (separate from editor) | API ≠ editor actions | HTTP |
| ProseMirror | JS transforms (in-process only) | None | N/A |
| Lexical | JS commands (in-process only) | None | N/A |
| Slate | JS transforms (in-process only) | None | N/A |
| Tiptap | JS commands (in-process only) | Cloud API (paid) | HTTP |
| Google Docs | Apps Script (limited) | None natively | N/A |

Every other editor's programmatic interface is either (a) in-process JavaScript that requires running inside the same browser tab, or (b) a REST API that's a separate system from the editor itself, with different semantics.

no∅ Blocks is the only editor where **the UI and the agent API are the same interface**. When a human presses Enter, it calls `handleEnter`. When an agent calls `handleEnter` over MCP, the same code runs. The document updates. The DOM patches. The cursor moves. In real time. There is no translation layer.

### 110 E2E Tests via MCP

The MCP endpoint isn't just for agents to use the editor — it's how the editor is **tested**. The block editor ships with 110 end-to-end tests defined in `blocks.test.json`, executed by the no∅ verification pipeline through the same MCP interface.

The test harness:
1. Loads the editor in a headless browser
2. Connects to the MCP endpoint
3. Calls store actions (add blocks, type text, press Enter, toggle marks)
4. Reads state back via MCP resources
5. Asserts on the result

This means the test suite validates the exact same code path that agents use. If an agent can't `addBlock`, the tests fail. If `handleEnter` regresses, the tests catch it. The MCP surface is the contract, and it's tested on every publish.

### The Implication

The block editor isn't just a document you can edit in a browser. It's a document that AI agents can read, write, and transform as a first-class operation — over a standard protocol, with no custom integration, no SDK, no API key beyond the publish secret.

This is what "agent-native" actually means. Not "we added an AI feature." Not "you can prompt it." The editor's entire interaction surface — every action a human can take — is available to machines over the network, tested, and documented by the MCP manifest.

Connect Claude to `/mcp/bloox`. Ask it to write a document. Watch the blocks appear in real time.

---

## The Single-File Philosophy

The block editor is the strongest proof point for a broader thesis: **the modern web is over-architected for what most applications actually need**.

A block editor is considered one of the hardest frontend challenges. The conventional wisdom says you need:
- A framework (React/Vue/Svelte) for reactivity
- An editor framework (ProseMirror/Slate/Lexical) for document modeling
- A build toolchain (Vite/Webpack) for bundling
- A package manager (npm) for dependencies
- A backend (Express/Django/Rails) for persistence
- An API layer (REST/GraphQL) for programmatic access
- A deployment pipeline for shipping
- A testing framework for verification

no∅ replaces all of this with:
- **Signals** for reactivity
- **Store actions** for document modeling (in the same file)
- **Convex** for the backend, persistence, and real-time sync
- **MCP** for the agent API (auto-generated from store actions)
- **`publish.sh`** for deployment, verification, and E2E testing in one command
- **CDN** for loading (two URLs, no bundler)

The result isn't a compromise. It's a block editor with the same interaction model as Notion — slash commands, inline formatting, drag-and-drop, markdown shortcuts, keyboard navigation, undo/redo — in a file you can email as an attachment.

---

## Limitations and Trade-offs

This approach is honest about what it trades away:

- **No TypeScript** — the editor is plain JavaScript. Type safety comes from discipline, not a compiler.
- **No tree-shaking** — unused block types ship with the file. For a 45KB file, this doesn't matter.
- **No accessibility audit yet** — `contenteditable` has known a11y gaps. A production deployment would need ARIA roles and screen reader testing.

These are conscious trade-offs, not oversights. The editor optimizes for **shipping speed, architectural clarity, and single-developer productivity**.

---

## Conclusion

The no∅ block editor demonstrates that the complexity ceiling for web applications has been artificially raised by the tools we've chosen. When the platform is designed around the right primitives — reactive signals, typed sections, store actions, a real-time backend, and an auto-generated agent API — a block editor stops being a 6-month project with 50 dependencies and becomes a single file you can read top to bottom in an afternoon.

2,178 lines. Zero dependencies. One HTML file.

Describe it, it's live.

---

*Built with no∅ — agent-first application platform.*
*https://novoid.dev*
