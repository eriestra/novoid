# A Block Editor in a Single HTML File

**A Notion-class document editor in 2,178 lines of HTML — no frameworks, no dependencies, no build step. 30 MCP tools execute server-side, letting AI agents read, write, and transform documents over HTTP without a browser.**

---

## What Is no∅?

no∅ (novoid) is an agent-first application platform for building any web application — dashboards, tools, editors, landing pages, multi-page apps — as single HTML files with reactive state, a real-time database, live URLs, and auto-generated MCP endpoints.

The platform:
- **Reactive core** — signals, computed values, effects, stores
- **Declarative render system** — typed sections (headers, tables, cards, forms, charts, stats) that map data to UI without manual DOM work
- **CSS design system** — variables, components, layout utilities, dark mode, theming
- **Convex backend** — real-time database, reactive queries, mutations, actions, file storage, crons, HTTP routes
- **Publishing pipeline** — `publish.sh` deploys, verifies, and runs E2E tests in one command
- **Verification pipeline** — static analysis (Nous), headless browser execution (novoid-browser), MCP test harness
- **MCP endpoints** — every `createStore` app gets an agent API over Streamable HTTP. Store actions execute server-side as Convex mutations when called with a document ID and write token.
- **Agent infrastructure** — Nex (autonomous agent), Vox (vibe-coded app builder), personas, memory, multi-channel

Apps are single `.html` files that load no∅ from a CDN. No bundler, no build step, no `node_modules`. The MCP surface is generated from the same store actions that drive the UI.

This paper examines one application built on no∅: a block editor. It was chosen because block editors are among the most complex frontend applications to build, making it a useful benchmark for the platform's capabilities. The architecture and patterns described here — stores, server-executable MCP tools, single-file deployment — apply to any no∅ application.

---

## Summary

A block editor — slash commands, drag-and-drop, inline formatting, markdown shortcuts, undo/redo, dark mode, keyboard-driven editing, nested blocks, 20+ block types — running in production as a single `.html` file. 30 MCP tools execute server-side via Convex mutations, persisting changes to the database. 110 end-to-end tests run through the same MCP interface.

No React. No ProseMirror. No Slate. No Lexical. No Tiptap. No virtual DOM. No bundler. No `node_modules`. No separate API layer.

One file. 2,178 lines. 30 server-executable tools. Served from a CDN.

---

## The Problem with Block Editors

The standard approach to building a block editor:

1. Pick a framework — React, Vue, Svelte
2. Pick an editor framework — ProseMirror, Slate, Lexical, Tiptap
3. Wire them together — adapters, plugins, schemas, decorations
4. Fight `contenteditable` — the DOM API that every editor framework exists to tame
5. Ship a bundle — 200KB+ of JavaScript before the first keystroke

Notion's editor is estimated at 10MB+ of JavaScript. Google Docs loads megabytes of code. Tiptap starts at 50KB+ gzipped with basic features.

The complexity solves real problems. The question is whether it solves them at the right layer.

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

Blocks and sections are the same abstraction. A heading block is a header section. A data block is a table section. A quote block is a styled section. The block editor extends the render system with cursor management and keyboard handling — the structured rendering was already there.

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

Every interaction — typing, formatting, reordering, deleting — is a store action that returns partial state. The reactive system patches the DOM. Signal-driven updates touch only what changed.

Store actions are pure functions: `(state, args) → partial state`. This makes them executable in two contexts:
- **Browser** — the reactive runtime applies the partial state to signals, DOM updates follow
- **Server** — a Convex mutation (`documents:applyAction`) pattern-matches on action name, applies the same data transformation, and persists the result

The same logic runs in both places. The browser version is defined in the HTML file. The server version reimplements the data transformations as a Convex mutation — no `eval`, no client code on the server. The operations are simple array/object manipulations (insert, filter, splice, map) that produce identical results.

### One `contenteditable` Surface Per Block

`contenteditable` is used only for text input in individual blocks. It does not manage document structure.

When you press Enter, the editor runs a store action that creates a new block — it doesn't ask the browser to split a DOM node. When you press Backspace at the start of a block, it merges two data objects, not two DOM trees.

The browser handles text cursor, IME, and selection within a paragraph. The store handles document structure, block ordering, and type conversions.

### Enter Behavior Registry

Different block types need different Enter behavior, declared statically:

| Behavior | Block Types | What Enter Does |
|---|---|---|
| `split` | paragraph, heading, toggle | Split block at cursor, new block below |
| `continue` | bullet list, numbered list, todo | New sibling item; empty item exits to paragraph |
| `newline` | quote, callout, code, math | Newline inside block; double-Enter exits |
| `cell` | table | Move to next cell |
| `none` | divider, image, embed | New paragraph below |

One `handleEnter` action reads the registry and dispatches. Adding a new block type means adding one line to the registry.

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

The content is always plain text. Formatting is data:

- **Searchable** — `content.includes('world')` works
- **Diffable** — version control sees text changes, not HTML
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

### What's Next

The editor does not yet ship collaboration, comments, version history, or file uploads. The infrastructure for these features exists in no∅:

- **Real-time collaboration** — Convex subscriptions are reactive by default. The store already syncs to Convex with auto-save. Adding presence cursors and live block updates means subscribing multiple clients to the same document query.
- **Version history** — every store mutation pushes to the undo stack. Persisting that stack to Convex gives full document history with rollback. The data model is diffable — blocks are plain JSON.
- **Comments** — a comment is a mark with metadata (`{ type: 'comment', from, to, meta: { threadId, author } }`). The mark system supports arbitrary metadata ranges. Thread storage is a Convex table.
- **File uploads** — Convex has built-in file storage. The asset pipeline (`seed.sh`) already uploads framework files.

---

## Size Comparison

| Editor | Base Bundle | Dependencies | Build Required | Agent API |
|---|---|---|---|---|
| **no∅ Blocks** | **~45KB** (single HTML) | **0** (loads core.js + core.css from CDN) | **No** | **30 MCP tools (server-executable)** |
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

Source code only (no tests, docs, or configs). ProseMirror/Lexical/Tiptap numbers include only the packages needed for a block editor equivalent to no∅ Blocks.

Those frameworks are general-purpose toolkits designed for extensibility across thousands of use cases. no∅ Blocks is a specific editor. When the framework already speaks in blocks and sections, a general-purpose toolkit is unnecessary.

The no∅ block editor implements the same interaction model (Enter behaviors, backspace merging, slash commands, inline marks, drag reorder, multi-select) that these editors ship. The difference is architectural: the platform is the editor engine.

---

## Architectural Properties

### 1. No Abstraction Gap

In a React + ProseMirror stack, the editor framework maintains its own document model, React maintains its own virtual DOM, and the real DOM is the ground truth for cursor position. Three representations of the same document, constantly synchronized.

In no∅ Blocks, the store is the document. Signals drive DOM updates directly. The cursor lives in the browser's native `contenteditable`. One source of truth, one update path.

### 2. No Plugin System

ProseMirror and Slate require plugins for basic functionality (lists, history, keymaps, input rules, drop cursor).

In no∅ Blocks, features are store actions. Adding a block type: define its render output, add its Enter behavior to the registry, add it to the slash command list. Three touch points, one file.

### 3. No Schema Migration

ProseMirror requires a formal schema definition for every node and mark type. Changing the schema requires migration logic. Slate has similar constraints.

In no∅ Blocks, a block is a plain object: `{ id, type, content, marks, meta }`. New block types are new `type` strings. New metadata is new `meta` keys.

### 4. No Build Step

The file loads two assets from CDN: `core.js` (the reactive runtime) and `core.css` (the design system). Everything else is authored directly in the HTML file.

- Upload one file to deploy
- No webpack, vite, esbuild, rollup
- View Source shows the entire editor
- Copy the file, modify it, ship a different editor

### 5. Agent-Native

Store actions execute on the server. An agent does not need a browser to modify a document — it calls MCP tools over HTTP. The Convex mutation applies the same data transformation and persists the result. Any browser viewing the same document sees the change on next load.

---

## MCP: Server-Executable Store Actions

The no∅ block editor exposes a live MCP (Model Context Protocol) endpoint. Every `createStore` app automatically gets its store actions as MCP tools and its state as MCP resources. The block editor has 30 tools and 4 resources, accessible over Streamable HTTP.

```
GET  /mcp/bloox   → JSON manifest (tools, resources, state)
POST /mcp/bloox   → MCP JSON-RPC
```

### Two Execution Modes

Each store action tool accepts an optional `docId` and `writeToken` in its arguments:

- **With `docId` + `writeToken`** — the MCP endpoint routes to a Convex mutation (`documents:applyAction`) that loads the document, applies the action server-side, and persists the result. No browser required.
- **Without `docId`** — the endpoint returns the action's schema and current state snapshot (read-only). This is useful for introspection.

The write token is hashed with SHA-256 before storage. It is never exposed in queries.

### Operations

An agent can:

**Read the document:**
```json
// MCP resource: "blocks" → full block array
// MCP resource: "doc" → { title, icon }
```

**Add a block:**
```json
// MCP tool: addBlock
{ "docId": "abc", "writeToken": "xyz", "type": "heading", "afterId": "b1", "meta": { "level": 2 } }
```

**Edit content:**
```json
// MCP tool: updateContent
{ "docId": "abc", "writeToken": "xyz", "id": "b2", "content": "Updated by agent" }
```

**Apply formatting:**
```json
// MCP tool: toggleMark
{ "docId": "abc", "writeToken": "xyz", "id": "b2", "type": "bold", "from": 0, "to": 7 }
```

**Transform structure:**
```json
// MCP tool: convertBlock
{ "docId": "abc", "writeToken": "xyz", "id": "b3", "type": "callout", "meta": { "icon": "⚠️" } }

// MCP tool: moveBlock
{ "docId": "abc", "writeToken": "xyz", "id": "b5", "afterId": "b1" }

// Also: splitBlock, mergeBlocks, duplicateBlock, indentBlock, outdentBlock, toggleCheck, setTitle, setIcon
```

All 30 store actions are MCP tools. The same actions a human triggers with keystrokes. When called with a document ID, they execute as Convex mutations and persist the result.

UI-only actions (setFocus, selectBlocks, openSlash, closeSlash, etc.) return a no-op response identifying them as browser-only state.

### Comparison

| Editor | Programmatic API | Server-Side Execution | Transport |
|---|---|---|---|
| **no∅ Blocks** | **30 MCP tools, 4 resources** | **Yes (Convex mutations)** | **HTTP (Streamable HTTP)** |
| Notion | REST API (separate from editor) | Yes (but different semantics from UI) | HTTP |
| ProseMirror | JS transforms (in-process) | No | N/A |
| Lexical | JS commands (in-process) | No | N/A |
| Slate | JS transforms (in-process) | No | N/A |
| Tiptap | JS commands (in-process) | Cloud API (paid, separate) | HTTP |
| Google Docs | Apps Script (limited) | No | N/A |

In other editors, the programmatic interface is either in-process JavaScript that requires the same browser tab, or a REST API that is a separate system from the editor with different semantics.

In no∅ Blocks, the UI and the agent API use the same store actions. When a human presses Enter, it calls `splitBlock`. When an agent calls `splitBlock` over MCP with a `docId`, the same data transformation runs as a Convex mutation. The document updates. The result persists.

### 110 E2E Tests via MCP

The block editor ships with 110 end-to-end tests in `bloox.test.json`, executed through the MCP interface by the no∅ verification pipeline.

The test harness:
1. Loads the editor in a headless browser
2. Connects to the MCP endpoint
3. Calls store actions (add blocks, type text, press Enter, toggle marks)
4. Reads state back via MCP resources
5. Asserts on the result

The test suite validates the same code path that agents use. The MCP surface is the contract, tested on every publish.

---

## The Single-File Approach

A block editor is typically built with:
- A framework (React/Vue/Svelte) for reactivity
- An editor framework (ProseMirror/Slate/Lexical) for document modeling
- A build toolchain (Vite/Webpack) for bundling
- A package manager (npm) for dependencies
- A backend (Express/Django/Rails) for persistence
- An API layer (REST/GraphQL) for programmatic access
- A deployment pipeline for shipping
- A testing framework for verification

no∅ replaces this with:
- **Signals** for reactivity
- **Store actions** for document modeling (in the same file, executable on server)
- **Convex** for backend, persistence, and real-time sync
- **MCP** for the agent API (auto-generated from store actions)
- **`publish.sh`** for deployment, verification, and E2E testing in one command
- **CDN** for loading (two URLs, no bundler)

The result is a block editor with the same interaction model as Notion — slash commands, inline formatting, drag-and-drop, markdown shortcuts, keyboard navigation, undo/redo — in a single file.

---

## Limitations and Trade-offs

- **No TypeScript** — the editor is plain JavaScript. Type safety comes from discipline, not a compiler.
- **No tree-shaking** — unused block types ship with the file. For a 45KB file, this is acceptable.
- **No accessibility audit** — `contenteditable` has known a11y gaps. A production deployment would need ARIA roles and screen reader testing.
- **Server actions are reimplemented** — the Convex mutation reimplements store action logic rather than sharing code with the browser. The operations are simple enough (array insert, filter, map) that divergence risk is low, but it is a duplication.

---

## Conclusion

The no∅ block editor is a single HTML file containing a block editor with 20+ block types, 30 server-executable MCP tools, and 110 E2E tests. Store actions run in the browser for interactive editing and on the server as Convex mutations for agent access. The same data transformations, two execution contexts, one persisted document.

2,178 lines. Zero dependencies. One file.

---

*Built with no∅ — agent-first application platform.*
*https://eriestra.github.io/novoid/*
