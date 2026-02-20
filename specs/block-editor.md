# no∅ Block Editor — Spec

> Codename: **Blocks** — a document-native block editor built entirely on novoid render sections.

## Vision

A block editor where **every block is a render section**. No ProseMirror, no Slate, no contenteditable hacks. The document is a reactive store of typed blocks. The renderer owns all DOM. Agents can read, write, and transform the document as fluently as a human drags a block.

The key insight: novoid's render system already speaks in sections (metrics, table, cards, form, header, chart, stat, list, empty, divider). A block editor extends this vocabulary with **content blocks** (text, heading, code, image, etc.) and adds **document-level orchestration** (ordering, selection, slash commands, drag-drop).

---

## Architecture

```
┌─────────────────────────────────────────┐
│              Block Document              │
│                                          │
│  store = createStore(documentState, {    │
│    addBlock, removeBlock, moveBlock,     │
│    updateBlock, convertBlock,            │
│    splitBlock, mergeBlocks,              │
│    duplicateBlock, indentBlock,          │
│    setSelection, openSlashMenu,          │
│    undo, redo                            │
│  })                                      │
│                                          │
│  render('#editor', store, {              │
│    sections: $blocks.map(blockToSection) │
│  })                                      │
└─────────────────────────────────────────┘
```

### Document State

```js
{
  // Document metadata
  title: '',
  icon: '',
  cover: null,

  // Block tree (flat list with parent refs for nesting)
  blocks: [
    { id: 'b1', type: 'heading', level: 1, content: 'Welcome', children: [] },
    { id: 'b2', type: 'paragraph', content: 'Start writing...', children: [] },
    { id: 'b3', type: 'toggle', content: 'Click to expand', children: ['b4', 'b5'] },
    { id: 'b4', type: 'paragraph', content: 'Nested content', parent: 'b3', children: [] },
    ...
  ],

  // Editor state
  focusedBlock: null,       // id of block with cursor
  selectedBlocks: [],       // ids for multi-select
  slashMenu: null,          // { blockId, query, position }
  inlineToolbar: null,      // { blockId, range, position }
  dragState: null,          // { blockId, overBlockId, position }

  // History
  undoStack: [],
  redoStack: [],

  // Persistence
  dirty: false,
  lastSaved: null
}
```

### Block Schema

Every block has:

```js
{
  id: string,          // unique, stable (nanoid)
  type: string,        // block type key
  content: string,     // primary text content (with inline marks as ranges)
  children: string[],  // nested block ids (for toggles, columns, etc.)
  parent: string|null, // parent block id (null = root level)
  indent: number,      // indentation level (0-based)
  meta: object,        // type-specific metadata
  marks: [             // inline formatting as ranges (not HTML)
    { type: 'bold', from: 5, to: 12 },
    { type: 'link', from: 20, to: 30, href: 'https://...' },
    { type: 'code', from: 33, to: 41 },
    ...
  ]
}
```

Marks are stored as **offset ranges**, not inline HTML. This keeps content plain-text searchable, agent-readable, and format-agnostic. The renderer applies marks at paint time.

### Enter Behavior Registry

Block types declare how Enter behaves via a static registry (not per-instance — determined by type):

```js
const ENTER_BEHAVIOR = {
  // split: Enter splits at cursor, creates new block below
  paragraph: 'split',
  heading:   'split',
  toggle:    'split',

  // continue: Enter creates a new sibling of same type; empty → exit to paragraph
  bulletList:   'continue',
  numberedList: 'continue',
  todoList:     'continue',

  // newline: Enter inserts newline inside block; Esc or double-Enter exits
  quote:   'newline',
  callout: 'newline',
  code:    'newline',
  math:    'newline',
  mermaid: 'newline',
  ai:      'newline',

  // cell: Enter moves to next cell; Esc exits
  table: 'cell',

  // none: Enter creates new paragraph below (non-editable blocks)
  divider:  'none',
  spacer:   'none',
  image:    'none',
  video:    'none',
  audio:    'none',
  file:     'none',
  embed:    'none',
  bookmark: 'none',
  columns:  'none',
  database: 'none',
  synced:   'none',
  template: 'none',
};
```

The `editable` section reads this registry to route Enter/Shift+Enter/Esc correctly per block type.

---

## Block Types

### Text Blocks

| Type | Meta | Description |
|---|---|---|
| `paragraph` | — | Default block. Plain text with inline marks. |
| `heading` | `{ level: 1|2|3 }` | H1–H3. Slash: `/h1`, `/h2`, `/h3` |
| `quote` | — | Blockquote with left border accent. |
| `callout` | `{ icon: '💡', color: 'blue' }` | Highlighted box with icon + background. |
| `toggle` | — | Collapsible. `children` rendered when expanded. |
| `bulletList` | — | Unordered list item. Nesting via `indent`. |
| `numberedList` | — | Ordered list item. Auto-numbering by position + indent. |
| `todoList` | `{ checked: false }` | Checkbox list item. |

### Code & Technical

| Type | Meta | Description |
|---|---|---|
| `code` | `{ language: 'js' }` | Syntax-highlighted code block. Language selector. |
| `math` | — | KaTeX-rendered equation (edit TeX, display rendered). |
| `mermaid` | — | Diagram from Mermaid DSL (edit text, display SVG). |

### Media & Embeds

| Type | Meta | Description |
|---|---|---|
| `image` | `{ src, alt, width, caption }` | Image with optional caption. Upload/URL/paste. |
| `video` | `{ src, poster }` | Video embed or uploaded file. |
| `audio` | `{ src, title }` | Audio player. |
| `file` | `{ src, name, size, type }` | File attachment with download. |
| `embed` | `{ url, provider }` | iframe embed (YouTube, Figma, CodePen, etc.) |
| `bookmark` | `{ url, title, description, favicon, image }` | Rich link preview card. |

### Data & Structured

| Type | Meta | Description |
|---|---|---|
| `table` | `{ columns: [...], rows: [...] }` | Editable data table. Add/remove rows and cols. |
| `database` | `{ schema, views, data }` | Mini inline database with filter/sort/views. Maps directly to novoid render `table`/`cards` sections. |

### Layout

| Type | Meta | Description |
|---|---|---|
| `columns` | `{ ratios: [1, 1] }` | Multi-column layout. Each column is a block container. Children are column blocks. |
| `divider` | — | Horizontal rule. |
| `spacer` | `{ height: 'sm'|'md'|'lg' }` | Vertical whitespace. |

### Interactive & AI

| Type | Meta | Description |
|---|---|---|
| `ai` | `{ prompt, model, status }` | AI-generated content block. Shows prompt, streams response, saves result. Editable after generation. |
| `synced` | `{ sourceDocId, sourceBlockId }` | Mirrors a block from another document. Updates reactively. |
| `template` | `{ templateId, label }` | Button that inserts a predefined block pattern on click. |

---

## Inline Marks

Applied as ranges on any text block's `content`:

| Mark | Shortcut | Rendering |
|---|---|---|
| `bold` | `Cmd+B` | **bold** |
| `italic` | `Cmd+I` | *italic* |
| `underline` | `Cmd+U` | underline |
| `strikethrough` | `Cmd+Shift+S` | ~~struck~~ |
| `code` | `Cmd+E` | `inline code` |
| `link` | `Cmd+K` | clickable URL (meta: `{ href }`) |
| `highlight` | `Cmd+Shift+H` | colored background (meta: `{ color }`) |
| `mention` | `@` trigger | user/page reference (meta: `{ type, id, label }`) |
| `equation` | `$` delimiters | inline KaTeX |
| `color` | toolbar | text color (meta: `{ color }`) |

---

## Interaction Model

### Editor Modes

The editor uses a two-mode model, consistent with Notion, Craft, and Linear:

```
┌──────────────────────────────────────────────────────────┐
│  EDIT MODE (cursor visible, typing active)               │
│    ↓ Esc                                                 │
│  BLOCK-SELECT MODE (block highlighted, no cursor)        │
│    ↓ Enter → back to EDIT MODE in selected block         │
│    ↓ Esc again → deselect all                            │
│    ↓ ↑/↓ → navigate between blocks without editing       │
│    ↓ Shift+↑/↓ → extend multi-block selection            │
│    ↓ Delete/Backspace → delete selected block(s)         │
└──────────────────────────────────────────────────────────┘
```

- **Edit mode**: cursor is inside a block, typing modifies content. All inline shortcuts active.
- **Block-select mode**: one or more blocks are highlighted. Arrow keys move selection, not cursor. Typing replaces selected blocks with a new paragraph.

### Enter Key Behavior by Block Type

Enter is not one-size-fits-all. Each block type declares an `enterBehavior`:

| Block Type | `enterBehavior` | Enter | Shift+Enter | Exit Pattern |
|---|---|---|---|---|
| `paragraph` | `split` | New block below at cursor | Soft `<br>` | — |
| `heading` | `split` | New paragraph below (not new heading) | Soft `<br>` | — |
| `bulletList` | `continue` | New list item sibling | Soft `<br>` | Enter on empty item → paragraph |
| `numberedList` | `continue` | New list item sibling | Soft `<br>` | Enter on empty item → paragraph |
| `todoList` | `continue` | New todo item sibling | Soft `<br>` | Enter on empty item → paragraph |
| `quote` | `newline` | Newline inside quote | Newline | Double-Enter on empty line → exit to paragraph below |
| `callout` | `newline` | Newline inside callout | Newline | Double-Enter on empty line → exit to paragraph below |
| `code` | `newline` | Newline inside code | Newline | `Esc` → block-select mode, or `Cmd+Enter` → new block below |
| `math` | `newline` | Newline inside TeX source | Newline | `Esc` → block-select mode |
| `mermaid` | `newline` | Newline inside DSL source | Newline | `Esc` → block-select mode |
| `toggle` | `split` | New block inside children | Soft `<br>` | — |
| `table` | `cell` | Move to next cell (Tab also) | Newline in cell | `Esc` → block-select mode |
| `divider` | `none` | New paragraph below | — | — (non-editable) |
| `spacer` | `none` | New paragraph below | — | — (non-editable) |
| `image` | `none` | New paragraph below | — | — (non-editable) |
| `video` | `none` | New paragraph below | — | — (non-editable) |
| `audio` | `none` | New paragraph below | — | — (non-editable) |
| `file` | `none` | New paragraph below | — | — (non-editable) |
| `embed` | `none` | New paragraph below | — | — (non-editable) |
| `bookmark` | `none` | New paragraph below | — | — (non-editable) |
| `ai` | `newline` | Newline in prompt | Newline | `Esc` → block-select; after generation, behaves as paragraph |

**List auto-continuation**: When Enter creates a new list item and the *current* item is empty, the empty item converts to a paragraph instead (exiting the list). If indented, it first de-dents one level. This matches Notion, Craft, and every major editor.

**Double-Enter exit**: For `newline` blocks (quote, callout), pressing Enter on an empty trailing line converts that line into a new paragraph block below the container. The container keeps its prior content.

### Block Deletion

Five deletion paths, ordered by frequency of use:

1. **Backspace on empty block** — the primary path. Block vanishes, cursor moves to end of previous block. If the block has a typed prefix (e.g. heading, list), first press converts to paragraph; second press on still-empty block deletes it.

2. **Block-select + Delete/Backspace** — `Esc` to select block, then Delete removes it. Cursor moves to the nearest remaining block.

3. **Multi-block select + Delete** — `Shift+Click` between blocks, or `Shift+↑/↓` in block-select mode to extend selection, then Delete removes all selected blocks.

4. **Backspace at start of non-empty block** — merges content into previous block. If previous block is a different type (e.g. heading), content appends to it.

5. **Drag handle menu → Delete** — hover reveals handle, click opens context menu with Delete option. Safety net for mouse-primary users.

Also supported:
- `Cmd+Shift+Delete` — force-delete focused block (shortcut for block-select + delete)
- Slash command: blocks can be deleted from block action menu via handle

### Slash Commands

Triggered by typing `/` at the start of an empty block or after a space:

```
/text         → paragraph
/h1           → heading 1
/h2           → heading 2
/h3           → heading 3
/bullet       → bullet list
/numbered     → numbered list
/todo         → todo/checklist
/toggle       → toggle/collapsible
/quote        → blockquote
/callout      → callout box
/divider      → horizontal rule
/code         → code block
/math         → equation
/mermaid      → diagram
/image        → image (upload dialog)
/video        → video embed
/embed        → URL embed
/bookmark     → link preview
/table        → data table
/columns      → column layout
/ai           → AI generation block
/template     → insert template
/file         → file upload
/delete       → delete current block
/duplicate    → duplicate current block
/turn-into    → convert block type submenu
```

**Fuzzy search** — typing `/cod` matches "code", `/bull` matches "bullet list". Menu renders as an overlay positioned at the cursor.

**Context-aware** — slash commands do not activate inside `code`, `math`, or `mermaid` blocks (where `/` is literal content).

### Block Handle (Drag + Menu)

On hover, a grip icon appears left of each block:

- **Click** → block actions menu (delete, duplicate, convert type, color, comment, copy link, move to)
- **Drag** → reorder blocks (drop indicator line between blocks)
- **Shift+Click** → add to multi-block selection

The menu always shows **Delete** as the last item with a destructive style (red text).

### Inline Formatting Toolbar

On text selection within a block, a floating toolbar appears above the selection:

```
[ B  I  U  S  </>  🔗  🎨  H1▾  ⋮ ]
  │  │  │  │   │    │   │   │    └ more (highlight, color, equation, mention)
  │  │  │  │   │    │   │   └ turn into (heading, list, quote, etc.)
  │  │  │  │   │    │   └ highlight color picker
  │  │  │  │   │    └ insert/edit link
  │  │  │  │   └ inline code
  │  │  │  └ strikethrough
  │  │  └ underline
  │  └ italic
  └ bold
```

### Keyboard Shortcuts

#### Edit Mode (cursor in block)

| Key | Action |
|---|---|
| `Enter` | Depends on block `enterBehavior` (see table above) |
| `Shift+Enter` | Soft newline / `<br>` (in `split` and `continue` blocks) |
| `Cmd+Enter` | Force new block below (works in all block types, including `newline` blocks) |
| `Backspace` (at start) | Merge with previous block, or convert typed block to paragraph |
| `Backspace` (empty block) | Delete block, cursor to end of previous block |
| `Delete` (at end) | Merge with next block |
| `Tab` | Indent block (nest under previous sibling) / next cell in table |
| `Shift+Tab` | Outdent block / previous cell in table |
| `Cmd+Shift+↑` | Move block up |
| `Cmd+Shift+↓` | Move block down |
| `Cmd+D` | Duplicate block |
| `Cmd+Shift+Delete` | Delete block |
| `Cmd+/` | Open slash command |
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` | Redo |
| `Escape` | Exit edit → block-select mode |
| `↑` (at top of block) | Move cursor to end of previous block |
| `↓` (at bottom of block) | Move cursor to start of next block |

#### Block-Select Mode (block highlighted, no cursor)

| Key | Action |
|---|---|
| `Enter` | Enter edit mode in selected block |
| `↑` / `↓` | Move selection to previous/next block |
| `Shift+↑` / `Shift+↓` | Extend multi-block selection |
| `Delete` / `Backspace` | Delete selected block(s) |
| `Escape` | Deselect all |
| `Cmd+D` | Duplicate selected block(s) |
| `Cmd+C` | Copy selected block(s) |
| `Cmd+X` | Cut selected block(s) |
| `Tab` | Indent selected block(s) |
| `Shift+Tab` | Outdent selected block(s) |
| `Cmd+A` | Select all blocks |
| Typing any character | Replace selection with new paragraph containing that character |

### Markdown Shortcuts

Auto-convert on `Space` at block start:

| Input | Result |
|---|---|
| `# ` | Heading 1 |
| `## ` | Heading 2 |
| `### ` | Heading 3 |
| `- ` or `* ` | Bullet list |
| `1. ` | Numbered list |
| `[] ` or `[ ] ` | Todo item |
| `> ` | Quote |
| `--- ` | Divider |
| `` ``` `` | Code block |
| `$$` | Math block |

Inline markdown on typing:
| Input | Result |
|---|---|
| `**text**` | Bold |
| `*text*` | Italic |
| `` `text` `` | Inline code |
| `~~text~~` | Strikethrough |

### Smart Paste

The editor interprets clipboard content and converts it to structured blocks:

| Pasted Content | Result |
|---|---|
| Bare URL on empty block | Bookmark block (rich link preview) with fallback to paragraph + link |
| YouTube / Figma / CodePen URL | Embed block with iframe |
| Markdown text | Parsed into typed blocks (headings, lists, code, etc.) |
| Rich text (HTML from browser) | Converted to blocks with inline marks, unsafe tags stripped |
| Image data (screenshot paste) | Image block with uploaded asset |
| URL pasted over selected text | Selected text becomes a link mark with pasted URL as href |
| Code (detected by indentation or backticks) | Code block with auto-detected language |

---

## Store Actions

```js
createStore(documentState, {
  // Block CRUD
  addBlock(state, { type, afterId, meta }) → inserts block after target
  removeBlock(state, { id }) → removes block and re-parents children
  updateBlock(state, { id, content, meta }) → updates block content/meta
  convertBlock(state, { id, type, meta }) → changes block type (preserves content)
  duplicateBlock(state, { id }) → deep-clones block (and children)

  // Block movement
  moveBlock(state, { id, afterId, parentId }) → reorder/reparent
  indentBlock(state, { id }) → nest under previous sibling
  outdentBlock(state, { id }) → move to parent's level

  // Text operations
  splitBlock(state, { id, offset }) → split at cursor into two blocks
  mergeBlocks(state, { id, withId }) → merge two adjacent blocks

  // Enter routing (dispatches based on ENTER_BEHAVIOR registry)
  handleEnter(state, { id, offset }) →
    split:    splitBlock at offset, new block inherits paragraph type
    continue: addBlock with same type as sibling; if empty → convertBlock to paragraph
    newline:  insert \n at offset; if trailing empty line → splitBlock + convert to paragraph (double-Enter exit)
    cell:     move focus to next table cell
    none:     addBlock paragraph after current block

  // Backspace routing
  handleBackspace(state, { id, offset }) →
    offset > 0:  normal text delete (no store action — DOM handles it)
    offset == 0, empty block:  removeBlock, setFocus to previous block end
    offset == 0, typed block (heading/list/quote):  convertBlock to paragraph (first press)
    offset == 0, paragraph:  mergeBlocks with previous block

  // Delete routing
  handleDelete(state, { id, offset }) →
    offset < content.length:  normal text delete
    offset == content.length:  mergeBlocks with next block

  // Editor modes
  enterBlockSelect(state, { blockId }) → set mode to 'block-select', highlight block, hide cursor
  exitBlockSelect(state) → clear selection, clear mode
  enterEditMode(state, { blockId, offset }) → set mode to 'edit', focus block at offset

  // Smart paste
  smartPaste(state, { blockId, offset, clipboard }) →
    URL on empty block → addBlock bookmark/embed (detect provider)
    URL over selection → toggleMark link with href
    Markdown text → parse + insertBlocks (multiple blocks)
    Rich HTML → convert to blocks with marks
    Image data → upload + addBlock image

  // Inline marks
  toggleMark(state, { blockId, type, from, to, meta }) → add/remove mark

  // Selection
  setFocus(state, { blockId, offset }) → move cursor
  setSelection(state, { blockIds }) → multi-block select
  extendSelection(state, { blockId, direction }) → add block to selection (Shift+Arrow)
  clearSelection(state) → deselect all

  // Slash menu
  openSlashMenu(state, { blockId, query }) → show menu
  closeSlashMenu(state) → hide menu
  executeSlashCommand(state, { command }) → insert block from menu

  // Toggle
  toggleExpand(state, { id }) → expand/collapse toggle block

  // Todo
  toggleCheck(state, { id }) → check/uncheck todo item

  // Table operations
  addTableRow(state, { blockId }) → append row
  addTableColumn(state, { blockId, label }) → append column
  updateCell(state, { blockId, row, col, value }) → edit cell
  removeTableRow(state, { blockId, rowIndex })
  removeTableColumn(state, { blockId, colIndex })

  // History
  undo(state) → pop undoStack, push to redoStack
  redo(state) → pop redoStack, push to undoStack

  // Persistence
  save(state) → mark clean, set lastSaved

  // AI block
  generateAI(state, { id, prompt }) → trigger AI generation

  // Document meta
  setTitle(state, { title })
  setIcon(state, { icon })
  setCover(state, { cover })
})
```

Every action returns partial state → auto-merged. Every mutation pushes to `undoStack`. All actions are MCP-addressable — agents can programmatically build documents.

---

## Rendering Strategy

### Block → Section Mapping

The core renderer maps each block to a novoid render section:

```js
function blockToSection(block) {
  switch (block.type) {
    case 'paragraph':    return { html: renderMarkedText(block) };
    case 'heading':      return { header: { title: block.content, level: block.meta.level } };
    case 'quote':        return { html: `<blockquote>${renderMarkedText(block)}</blockquote>` };
    case 'callout':      return { card: { icon: block.meta.icon, content: block.content, color: block.meta.color } };
    case 'code':         return { code: { content: block.content, language: block.meta.language } };
    case 'image':        return { html: `<figure>...</figure>` };
    case 'table':        return { table: { columns: block.meta.columns, source: block.meta.rows } };
    case 'divider':      return { divider: true };
    case 'math':         return { math: { content: block.content } };
    case 'todoList':     return { /* checkbox + text */ };
    case 'bulletList':   return { /* bullet + text */ };
    // ... etc
  }
}
```

**However** — the render system is declarative and section-based. For a block editor, we need **editable** sections. This is the key extension point:

### New Render Section: `editable`

The block editor introduces an **editable text section** — a contenteditable region managed by the renderer:

```js
{ editable: {
  blockId: 'b1',
  content: '$blocks.b1.content',
  marks: '$blocks.b1.marks',
  placeholder: 'Type / for commands...',
  enterBehavior: ENTER_BEHAVIOR[block.type],  // 'split' | 'continue' | 'newline' | 'cell' | 'none'
  onInput: 'updateBlock',
  onEnter: 'handleEnter',       // routes via enterBehavior
  onBackspace: 'handleBackspace', // empty → delete, start → merge, typed → convert
  onDelete: 'handleDelete',     // end → merge with next
  onEscape: 'enterBlockSelect', // exit edit → block-select mode
  onSlash: 'openSlashMenu',
  onMarkdown: 'autoConvert',
  onSelect: 'showInlineToolbar',
  onPaste: 'smartPaste'         // URL → embed/link, markdown → blocks, image → upload
}}
```

This is the **only** contenteditable surface in the system. All other block types (image, embed, divider, table, chart) are non-editable sections rendered by the standard renderer. This hybrid approach avoids the contenteditable nightmare — only plain text + marks use it. Structured blocks use standard novoid sections.

### Block Wrapper

Every block is wrapped in a container that provides:

```html
<div class="nv-block" data-block-id="b1" data-block-type="paragraph" data-indent="0">
  <div class="nv-block-handle" draggable="true">⠿</div>
  <div class="nv-block-content">
    <!-- section content here -->
  </div>
</div>
```

The wrapper handles:
- Drag handle visibility on hover
- Drop target indicators
- Multi-select highlighting
- Indent level (CSS margin-left)
- Focus ring on active block
- Block type icon gutter (optional)

---

## Hybrid Implementation

Since the block editor needs custom event handling (contenteditable, drag-and-drop, keyboard), it uses a **hybrid app** architecture:

```html
<!-- h() shell for editor chrome -->
<div id="toolbar"></div>       <!-- slash menu, inline toolbar -->
<div id="editor"></div>        <!-- block list (render sections) -->

<script>
const store = createStore(documentState, documentActions);

// h() components for overlays
mount('#toolbar', () => SlashMenu(store));
mount('#toolbar', () => InlineToolbar(store));

// render() for block list — each block is a section
render('#editor', store, {
  sections: computeBlockSections(store)
});
</script>
```

The **h() layer** handles:
- Slash command menu (overlay, positioned at cursor)
- Inline formatting toolbar (floating above selection)
- Drag preview ghost element
- Block action context menu
- Cover image picker
- Icon picker

The **render layer** handles:
- Block content display (text, tables, metrics, charts, etc.)
- Block ordering (from store's `blocks` array)
- Conditional rendering (toggle expand/collapse)
- Responsive layout (columns, mobile stacking)

---

## Document Persistence

### Convex Schema

```ts
// Document table
defineTable({
  title: v.string(),
  icon: v.optional(v.string()),
  cover: v.optional(v.string()),
  blocks: v.array(v.object({
    id: v.string(),
    type: v.string(),
    content: v.string(),
    children: v.array(v.string()),
    parent: v.optional(v.string()),
    indent: v.number(),
    meta: v.any(),
    marks: v.array(v.object({
      type: v.string(),
      from: v.number(),
      to: v.number(),
      meta: v.optional(v.any())
    }))
  })),
  slug: v.string(),
  orgId: v.optional(v.string()),
  createdBy: v.optional(v.string()),
  updatedAt: v.number()
})
```

### Auto-Save

- Debounced save on every block mutation (500ms)
- Manual save on `Cmd+S`
- Dirty indicator in header
- Last saved timestamp

---

## AI Blocks

The AI block is a first-class citizen:

1. User types `/ai` or clicks AI in slash menu
2. Prompt input appears (textarea block)
3. User types prompt, hits Enter
4. Block transitions to `loading` state (skeleton/spinner)
5. Response streams in, rendered as rich text with marks
6. Final state: editable block with AI badge
7. User can edit the result, regenerate, or delete

Store action: `generateAI({ id, prompt })` → calls Convex action → streams to block content.

**AI context**: The AI receives the full document (all blocks as plain text) plus the prompt, so it can write contextually aware content.

---

## New Section Types Required

To support the full block editor, these sections need to be added to the render system:

| Section | Purpose | Priority |
|---|---|---|
| `editable` | contenteditable text with marks | P0 — core |
| `code` | syntax-highlighted editable code | P0 |
| `image` | image display with caption + resize | P0 |
| `math` | KaTeX rendered equation | P1 |
| `mermaid` | diagram renderer | P2 |
| `embed` | iframe with URL parsing | P1 |
| `bookmark` | rich link preview | P1 |
| `audio` | audio player | P2 |
| `video` | video player | P2 |
| `columns` | multi-column container | P1 |
| `toggle` | collapsible container | P0 |

Existing sections that map directly: `table`, `divider`, `header`, `cards`, `form`, `stat`, `metrics`, `chart`.

---

## Implementation Phases

### Phase 1 — Core Document (MVP)

**Blocks**: paragraph, heading (1-3), bulletList, numberedList, todoList, quote, callout, divider, toggle, code
**Interactions**: slash commands, Enter/Backspace split/merge, Tab indent, keyboard shortcuts, markdown auto-convert
**Inline**: bold, italic, code, link, strikethrough, highlight
**Editor**: block handles (drag reorder), inline toolbar, focus management
**Persistence**: createStore with undo/redo, auto-save to Convex

This alone is a fully functional document editor — comparable to a clean Notion page.

### Phase 2 — Rich Media

**Blocks**: image (upload/paste/URL), embed (YouTube/Figma/etc.), bookmark, file, video, audio
**Features**: image resize handles, embed URL detection, drag-drop file upload, clipboard paste handling

### Phase 3 — Advanced Structure

**Blocks**: columns, table (editable cells), math, mermaid
**Features**: column resize, table row/col add/remove, KaTeX live preview, Mermaid rendering

### Phase 4 — Intelligence

**Blocks**: ai, synced, template, database
**Features**: AI streaming, document-aware prompts, synced block subscription, template library, inline database with views

### Phase 5 — Collaboration

**Features**: CRDT document model (Yjs integration), presence cursors, block-level comments, version history, sharing permissions

---

## Design Tokens

The editor uses novoid's existing design system:

```
--nv-block-gap: 2px              space between blocks
--nv-block-padding: 4px 0        block content padding
--nv-block-radius: 4px           rounded corners for callouts, code, etc.
--nv-block-handle-size: 24px     drag handle icon size
--nv-block-indent: 24px          per-level indent width
--nv-block-max-width: 720px      content max width (centered)
--nv-block-focus: var(--nv-accent-subtle)
--nv-block-selected: var(--nv-accent-bg)
--nv-block-drop-indicator: var(--nv-accent)
```

Typography: DM Sans (body), Outfit (headings), JetBrains Mono (code). Dark mode via `[data-theme="dark"]`.

---

## Agent API

Because the document is a `createStore`, every action is an MCP tool:

```
blocks.addBlock({ type: 'heading', afterId: 'b1', meta: { level: 2 } })
blocks.updateBlock({ id: 'b2', content: 'Updated text' })
blocks.moveBlock({ id: 'b5', afterId: 'b1' })
blocks.convertBlock({ id: 'b3', type: 'callout', meta: { icon: '⚠️', color: 'orange' } })
blocks.toggleMark({ blockId: 'b2', type: 'bold', from: 0, to: 5 })
blocks.save()
```

An agent can build an entire document programmatically — or modify a human-authored document. The block schema is the shared contract between human and machine.

---

## What Makes This Forward-Looking

1. **Blocks are render sections** — not contenteditable soup. Structured, typed, declarative.
2. **Agent-native** — every block operation is a store action → MCP tool. Agents build documents as fluently as humans.
3. **No framework dependency** — no ProseMirror, Slate, Lexical. The novoid renderer IS the editor engine.
4. **Marks as ranges** — content stays plain text. Formatting is data, not HTML. Searchable, diffable, transformable.
5. **Hybrid rendering** — contenteditable only for text input. Everything else uses standard novoid sections. Best of both worlds.
6. **Reactive by default** — signal-driven updates. Change a block, the DOM patches. No virtual DOM diffing.
7. **Convex-backed** — real-time persistence, ready for collaboration. Documents are live queries.
8. **AI as a block type** — not a bolt-on. AI generation is a first-class document operation.
9. **Composable** — blocks can contain other blocks (toggles, columns). The tree structure enables rich layouts within a linear document flow.
10. **Portable** — the document is a JSON blob of typed blocks. Export to Markdown, HTML, PDF. Import from Notion, Google Docs.
