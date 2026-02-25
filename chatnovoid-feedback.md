# Framework Feedback: ChatNovoid Build Experience

**Date:** 2026-02-24
**Context:** Built a ChatGPT replica (chatnovoid) using the no∅ framework. 534 LOC, 15/15 MCP tests, deployed to Convex with real AI streaming via OpenRouter. The build took ~33 minutes and 7 publish iterations — most of the friction came from framework behaviors that were non-obvious and required trial-and-error debugging.

This document captures actionable improvements based on real bugs encountered during the build.

---

## 1. Add `store.state` as an alias for `store.get()`

**Problem:** `createStore` exposes state via `store.get()`, but every reactive framework convention (React, Vue, Svelte, Solid) uses `.state` or `.value`. I wrote `store.state.X` throughout the app, which silently returned `undefined` in the browser and caused 3 runtime errors in novoid-browser.

**Fix:** One line in `createStore` (src/core.js ~L226):

```js
Object.defineProperty(store, 'state', { get: getState });
```

Keep `.get()` for backward compatibility. Make `.state` the documented primary API.

**Impact:** Eliminates the most common first-time mistake. Every agent and developer will try `.state` first.

---

## 2. Make `N.list` composable as a child of `h()`

**Problem:** This natural pattern doesn't work:

```js
h('div', { class: 'sidebar' },
  N.list(h('div', {}), () => store.get().items, i => i.id, i => renderItem(i))
)
```

The `N.list` call returns a container element with an internal effect, but when `_appendChildren` processes it, the reactive tracking doesn't connect properly to the store signal. The list renders once but never updates.

**Workaround required:**

```js
const container = h('div', {});
N.list(container, () => store.get().items, i => i.id, i => renderItem(i));
parent.appendChild(container);
```

**Fix:** Either tag the `N.list` container so `_appendChildren` recognizes it has live effects, or make `N.list` return a function (like `N.when`) that `_appendChildren` wraps in its own effect.

---

## 3. Make `N.when` work reliably inside `h()` children

**Problem:** Nesting `N.when` as a child of `h()` rendered blank content:

```js
h('div', { class: 'messages' },
  N.when(
    () => hasMessages(),
    () => MessagesList(),
    () => EmptyState()
  )
)
```

The empty state and message list both failed to render. The `N.when` function was processed by `_appendChildren` as a reactive child, but the DOM replacement cycle produced blank output.

**Workaround required:**

```js
const container = h('div', { class: 'messages' });
const emptyEl = EmptyState();
const msgsEl = h('div', {});
container.appendChild(emptyEl);
container.appendChild(msgsEl);
N.effect(() => {
  emptyEl.style.display = hasMessages() ? 'none' : '';
  msgsEl.style.display = hasMessages() ? '' : 'none';
});
```

**Impact:** `N.when` is a core primitive. If it doesn't compose inside `h()`, developers must drop down to imperative DOM code, which defeats the purpose of the declarative API.

---

## 4. Freeze store state in dev mode to catch mutations

**Problem:** Store actions that mutate objects in place silently fail. `N.list` uses `JSON.stringify(prev) !== JSON.stringify(item)` for change detection. When an action does:

```js
appendToLastMessage: (s, delta) => {
  const conv = s.conversations.find(c => c.id === s.activeConvId);
  conv.messages[conv.messages.length - 1].content += delta;  // MUTATION
  return { conversations: [...s.conversations] };
}
```

`N.list` stores the message object reference in `dataMap`. Next render, `prev === item` (same object, mutated) and `JSON.stringify(prev) === JSON.stringify(item)` (same object serializes identically). The list never re-renders. No error, no warning — just silent failure.

**Fix:** Freeze state after every update:

```js
store.set = (updater) => {
  const next = Object.freeze(updater);
  setState(next);
  listeners.forEach(fn => fn(next));
};
```

With `Object.freeze`, the mutation attempt throws `TypeError: Cannot assign to read only property` immediately. This is what Redux Toolkit does via Immer's freeze, and it eliminates an entire class of silent bugs.

---

## 5. Add `connect-src` escape hatch for apps needing external APIs

**Problem:** The CSP in `http.ts` restricts `connect-src` to `self`, `*.convex.cloud`, `*.convex.site`, and `unpkg.com`. Any app calling an external API (OpenRouter, Stripe, any third-party) gets blocked at runtime with no useful error during verification.

**Fix options:**

a) **Meta tag declaration** — Let apps declare needed domains:
```html
<meta name="novoid-connect" content="https://openrouter.ai https://api.stripe.com">
```
Parse server-side in the `/app/:slug` handler and inject into the CSP.

b) **Built-in API proxy** — Provide `/api/proxy` as a framework-level HTTP action that reads credentials from the `keys` table and proxies to declared endpoints. AI apps will always need this.

c) **Per-app CSP override** — Store CSP extensions in the `pages` table alongside the HTML.

**Impact:** I had to write ~70 LOC of Convex HTTP action boilerplate (`/api/chat` + OPTIONS handler), fix unrelated schema validation errors to deploy it, and republish. This alone cost ~8 minutes.

---

## 6. Add item-level reactivity to `N.list`

**Problem:** When a single field changes on a list item, `N.list` calls `renderFn(item)` and replaces the entire DOM node. During streaming, every token appended to a message triggered a full row re-render with the `fadeIn` CSS animation, causing visible blinking.

**Workaround required:** Accumulate streaming text in a separate signal (`streamText`) outside the store, have the message row's `html` attribute read from the signal during streaming, and commit to the store once at the end.

**Ideal behavior:** `N.list` should detect which fields changed and only re-run the reactive bindings inside the existing row that depend on those fields — not destroy and recreate the entire row.

This is how Solid.js `<For>` works: the row is created once, and reactive expressions inside it update independently.

**Impact:** This is the hardest fix (requires rethinking list reconciliation) but would eliminate the most code workarounds. The streaming signal bypass pattern adds ~20 LOC of complexity that shouldn't exist.

---

## 7. Document common mistakes in skills/novoid-core.md

Until fixes 1-4 are implemented, add a "Common Mistakes" section to the skills file:

```markdown
## Common Mistakes

1. **`store.get()` not `store.state`** — createStore returns `{get, set, actions, select}`.
   There is no `.state` property. Use `store.get().fieldName`.

2. **Never mutate store objects** — Always return new objects via spread.
   Wrong: `conv.messages.push(msg)` / `msg.content += delta`
   Right: `{ ...conv, messages: [...conv.messages, msg] }`

3. **Use N.list on pre-created containers** — Don't pass N.list as a child of h().
   Wrong: `h('div', {}, N.list(h('div'), items, ...))`
   Right: `const c = h('div'); N.list(c, items, ...); parent.appendChild(c);`

4. **Same for N.when** — Use direct DOM + N.effect with display toggling
   instead of nesting N.when inside h() children.

5. **CSP blocks external APIs** — Use Convex HTTP actions to proxy external
   API calls. The browser can only connect to *.convex.cloud/site.
```

---

## Summary

| Issue | Severity | Fix Effort | Time Lost |
|-------|----------|------------|-----------|
| `store.state` missing | High | 1 line | ~5 min |
| `N.list` not composable in `h()` | High | Medium | ~8 min |
| `N.when` broken in `h()` | High | Medium | ~5 min |
| Silent mutations | High | ~5 lines | ~5 min |
| CSP blocks external APIs | Medium | Medium | ~8 min |
| No item-level list reactivity | Medium | Large | ~5 min |
| Undocumented gotchas | Low | Docs only | preventive |

Total friction: ~33 min build vs ~90 sec for the same app in Flask. ~80x token cost (250K vs 3K). Most of the difference is debugging framework behaviors, not building features.

Fixes 1 and 4 are one-liners. Fix 7 is pure documentation. These three alone would prevent most of the friction for the next developer or agent building on no∅.
