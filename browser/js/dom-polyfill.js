// ═══════════════════════════════════════════════════════════
// Minimal DOM polyfill for QuickJS — enough for Novoid core.js
// No layout, no computed styles, no rendering
// ═══════════════════════════════════════════════════════════

(function() {
  "use strict";

  let _nodeIdCounter = 1;
  const _capturedConsole = [];

  // ─── EventTarget ────────────────────────────────────────
  class EventTarget {
    constructor() {
      this._listeners = {};
    }
    addEventListener(type, fn) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(fn);
    }
    removeEventListener(type, fn) {
      if (!this._listeners[type]) return;
      this._listeners[type] = this._listeners[type].filter(f => f !== fn);
    }
    dispatchEvent(event) {
      event.target = this;
      const handlers = this._listeners[event.type] || [];
      for (const h of handlers) h(event);
      return !event.defaultPrevented;
    }
  }

  // ─── Event ──────────────────────────────────────────────
  class Event {
    constructor(type, opts) {
      this.type = type;
      this.bubbles = opts?.bubbles || false;
      this.cancelable = opts?.cancelable || false;
      this.defaultPrevented = false;
      this.target = null;
    }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() {}
  }

  // ─── Node ───────────────────────────────────────────────
  class Node extends EventTarget {
    constructor(nodeType) {
      super();
      this._id = _nodeIdCounter++;
      this.nodeType = nodeType;
      this.childNodes = [];
      this.parentNode = null;
    }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    get nextSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return this.parentNode.childNodes[idx + 1] || null;
    }
    get previousSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx > 0 ? this.parentNode.childNodes[idx - 1] : null;
    }
    appendChild(child) {
      if (child instanceof DocumentFragment) {
        const children = [...child.childNodes];
        for (const c of children) this.appendChild(c);
        return child;
      }
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx > -1) {
        this.childNodes.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }
    insertBefore(newChild, refChild) {
      if (newChild instanceof DocumentFragment) {
        const children = [...newChild.childNodes];
        for (const c of children) this.insertBefore(c, refChild);
        return newChild;
      }
      if (newChild.parentNode) newChild.parentNode.removeChild(newChild);
      if (!refChild) return this.appendChild(newChild);
      const idx = this.childNodes.indexOf(refChild);
      if (idx > -1) {
        newChild.parentNode = this;
        this.childNodes.splice(idx, 0, newChild);
      }
      return newChild;
    }
    replaceChild(newChild, oldChild) {
      const idx = this.childNodes.indexOf(oldChild);
      if (idx > -1) {
        if (newChild.parentNode) newChild.parentNode.removeChild(newChild);
        oldChild.parentNode = null;
        newChild.parentNode = this;
        this.childNodes[idx] = newChild;
      }
      return oldChild;
    }
    contains(other) {
      if (this === other) return true;
      for (const child of this.childNodes) {
        if (child === other || child.contains(other)) return true;
      }
      return false;
    }
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    }
    cloneNode(deep) {
      const clone = new this.constructor(this.nodeType);
      if (this instanceof Element) {
        clone.tagName = this.tagName;
        clone._attributes = { ...this._attributes };
        clone.className = this.className;
        clone._style = { ...this._style };
        clone._dataset = { ...this._dataset };
      }
      if (this instanceof Text) clone._text = this._text;
      if (deep) {
        for (const child of this.childNodes) {
          clone.appendChild(child.cloneNode(true));
        }
      }
      return clone;
    }
  }

  // ─── Text ───────────────────────────────────────────────
  class Text extends Node {
    constructor(data) {
      super(3); // TEXT_NODE
      this._text = data;
      this.tagName = undefined;
    }
    get textContent() { return this._text; }
    set textContent(v) { this._text = String(v); }
    get nodeValue() { return this._text; }
    set nodeValue(v) { this._text = String(v); }
    get data() { return this._text; }
    set data(v) { this._text = String(v); }
  }

  // ─── Comment ────────────────────────────────────────────
  class Comment extends Node {
    constructor(data) {
      super(8); // COMMENT_NODE
      this._text = data || '';
      this.tagName = undefined;
    }
    get textContent() { return this._text; }
    set textContent(v) { this._text = String(v); }
  }

  // ─── DocumentFragment ──────────────────────────────────
  class DocumentFragment extends Node {
    constructor() {
      super(11); // DOCUMENT_FRAGMENT_NODE
    }
    querySelector(sel) { return _querySelector(this, sel); }
    querySelectorAll(sel) { return _querySelectorAll(this, sel); }
  }

  // ─── ClassList ──────────────────────────────────────────
  class ClassList {
    constructor(el) { this._el = el; }
    _classes() { return (this._el.className || '').split(/\s+/).filter(Boolean); }
    add(...names) {
      const c = new Set(this._classes());
      names.forEach(n => c.add(n));
      this._el.className = [...c].join(' ');
    }
    remove(...names) {
      const c = new Set(this._classes());
      names.forEach(n => c.delete(n));
      this._el.className = [...c].join(' ');
    }
    contains(name) { return this._classes().includes(name); }
    toggle(name, force) {
      if (force !== undefined) {
        force ? this.add(name) : this.remove(name);
        return force;
      }
      if (this.contains(name)) { this.remove(name); return false; }
      this.add(name); return true;
    }
    get length() { return this._classes().length; }
    toString() { return this._el.className || ''; }
  }

  // ─── Style proxy ───────────────────────────────────────
  function createStyle(el) {
    return new Proxy(el._style, {
      get(target, prop) {
        if (prop === 'cssText') {
          return Object.entries(target)
            .map(([k, v]) => `${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}: ${v}`)
            .join('; ');
        }
        return target[prop] || '';
      },
      set(target, prop, value) {
        if (prop === 'cssText') {
          // Parse cssText
          const pairs = value.split(';').filter(Boolean);
          for (const pair of pairs) {
            const [k, v] = pair.split(':').map(s => s.trim());
            if (k && v) {
              const camel = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
              target[camel] = v;
            }
          }
        } else {
          target[prop] = value;
        }
        return true;
      }
    });
  }

  // ─── Element ────────────────────────────────────────────
  class Element extends Node {
    constructor(tagName) {
      super(1); // ELEMENT_NODE
      this.tagName = tagName.toUpperCase();
      this._attributes = {};
      this.className = '';
      this._style = {};
      this._dataset = {};
      this.value = '';
      this.checked = false;
      this.disabled = false;
      this.readonly = false;
      this.required = false;
      this.hidden = false;
      this.selected = false;
      this.multiple = false;
      this.autofocus = false;
      this.open = false;
      this.selectionStart = null;
      this.selectionEnd = null;
    }
    get id() { return this._attributes.id || ''; }
    set id(v) { this._attributes.id = v; }
    get classList() { return new ClassList(this); }
    get style() { return createStyle(this); }
    set style(v) {
      if (typeof v === 'object') Object.assign(this._style, v);
    }
    get dataset() {
      return new Proxy(this._dataset, {
        get: (t, p) => t[p],
        set: (t, p, v) => { t[p] = v; return true; }
      });
    }
    get children() {
      return this.childNodes.filter(c => c.nodeType === 1);
    }
    get innerHTML() {
      return this.childNodes.map(c => _serialize(c)).join('');
    }
    set innerHTML(html) {
      this.childNodes = [];
      if (html) {
        const text = new Text(html);
        this.appendChild(text);
      }
    }
    get textContent() {
      return this.childNodes.map(c => {
        if (c.nodeType === 3) return c._text;
        if (c.nodeType === 1) return c.textContent;
        return '';
      }).join('');
    }
    set textContent(v) {
      this.childNodes.forEach(c => c.parentNode = null);
      this.childNodes = [];
      if (v != null && v !== '') this.appendChild(new Text(String(v)));
    }
    get outerHTML() { return _serialize(this); }
    setAttribute(name, value) { this._attributes[name] = String(value); }
    getAttribute(name) { return this._attributes[name] ?? null; }
    hasAttribute(name) { return name in this._attributes; }
    removeAttribute(name) { delete this._attributes[name]; }
    querySelector(sel) { return _querySelector(this, sel); }
    querySelectorAll(sel) { return _querySelectorAll(this, sel); }
    focus() { _document.activeElement = this; }
    blur() { if (_document.activeElement === this) _document.activeElement = _document.body; }
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
    click() { this.dispatchEvent(new Event('click', { bubbles: true })); }
    getBoundingClientRect() {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
    }
  }

  // ─── querySelector helpers ──────────────────────────────
  function _matchesSelector(el, sel) {
    if (el.nodeType !== 1) return false;
    sel = sel.trim();
    if (sel.startsWith('#')) return el._attributes.id === sel.slice(1);
    if (sel.startsWith('.')) return (el.className || '').split(/\s+/).includes(sel.slice(1));
    if (sel.includes('.')) {
      const [tag, ...classes] = sel.split('.');
      if (tag && el.tagName !== tag.toUpperCase()) return false;
      const elClasses = (el.className || '').split(/\s+/);
      return classes.every(c => elClasses.includes(c));
    }
    if (sel.includes('[')) {
      const m = sel.match(/^(\w+)?\[([^\]]+)\]$/);
      if (m) {
        if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
        const attr = m[2].replace(/['"]/g, '');
        if (attr.includes('=')) {
          const [k, v] = attr.split('=');
          return el._attributes[k] === v;
        }
        return k in el._attributes;
      }
    }
    return el.tagName === sel.toUpperCase();
  }

  function _querySelector(root, sel) {
    if (!sel) return null;
    // Handle comma-separated selectors
    const parts = sel.split(',').map(s => s.trim());
    for (const part of parts) {
      const result = _querySelectorSingle(root, part);
      if (result) return result;
    }
    return null;
  }

  function _querySelectorSingle(root, sel) {
    for (const child of root.childNodes) {
      if (_matchesSelector(child, sel)) return child;
      if (child.nodeType === 1) {
        const found = _querySelectorSingle(child, sel);
        if (found) return found;
      }
    }
    return null;
  }

  function _querySelectorAll(root, sel) {
    const results = [];
    const parts = sel.split(',').map(s => s.trim());
    function walk(node) {
      for (const child of node.childNodes) {
        if (parts.some(p => _matchesSelector(child, p))) results.push(child);
        if (child.nodeType === 1) walk(child);
      }
    }
    walk(root);
    return results;
  }

  // ─── Serialize (for innerHTML) ─────────────────────────
  function _serialize(node) {
    if (node.nodeType === 3) return node._text;
    if (node.nodeType === 8) return '<!--' + node._text + '-->';
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    let attrs = '';
    for (const [k, v] of Object.entries(node._attributes)) {
      attrs += ` ${k}="${v}"`;
    }
    if (node.className) attrs += ` class="${node.className}"`;
    const children = node.childNodes.map(c => _serialize(c)).join('');
    return `<${tag}${attrs}>${children}</${tag}>`;
  }

  // ─── Document ──────────────────────────────────────────
  const _body = new Element('body');
  const _head = new Element('head');
  const _html = new Element('html');
  _html.appendChild(_head);
  _html.appendChild(_body);

  const _document = {
    nodeType: 9,
    documentElement: _html,
    head: _head,
    body: _body,
    activeElement: _body,
    createElement(tag) { return new Element(tag); },
    createTextNode(text) { return new Text(text); },
    createComment(text) { return new Comment(text); },
    createDocumentFragment() { return new DocumentFragment(); },
    querySelector(sel) {
      if (sel === 'body' || sel === 'BODY') return _body;
      if (sel === 'head' || sel === 'HEAD') return _head;
      if (sel === 'html' || sel === 'HTML') return _html;
      return _querySelector(_html, sel);
    },
    querySelectorAll(sel) { return _querySelectorAll(_html, sel); },
    getElementById(id) { return _querySelector(_html, '#' + id); },
    getElementsByTagName(tag) { return _querySelectorAll(_html, tag); },
    getElementsByClassName(cls) { return _querySelectorAll(_html, '.' + cls); },
    createEvent(type) { return new Event(type); },
    // EventTarget methods (document is not a Node but needs these)
    _listeners: {},
    addEventListener(type, fn) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!this._listeners[type]) return;
      this._listeners[type] = this._listeners[type].filter(f => f !== fn);
    },
    dispatchEvent(event) {
      event.target = this;
      const handlers = this._listeners[event.type] || [];
      for (const h of handlers) h(event);
      return !event.defaultPrevented;
    },
  };

  // ─── Window ─────────────────────────────────────────────
  const _timers = [];
  let _timerIdCounter = 1;

  const _window = {
    document: _document,
    location: { hash: '', href: 'file://local', pathname: '/', search: '', host: 'local', hostname: 'local', protocol: 'file:', origin: 'file://local' },
    navigator: { userAgent: 'novoid-browser/0.1.0', language: 'en-US' },
    localStorage: (() => {
      const store = {};
      return {
        getItem(k) { return store[k] ?? null; },
        setItem(k, v) { store[k] = String(v); },
        removeItem(k) { delete store[k]; },
        clear() { for (const k in store) delete store[k]; },
        get length() { return Object.keys(store).length; },
        key(i) { return Object.keys(store)[i] || null; },
      };
    })(),
    sessionStorage: (() => {
      const store = {};
      return {
        getItem(k) { return store[k] ?? null; },
        setItem(k, v) { store[k] = String(v); },
        removeItem(k) { delete store[k]; },
        clear() { for (const k in store) delete store[k]; },
      };
    })(),
    setTimeout(fn, ms) {
      const id = _timerIdCounter++;
      _timers.push({ id, fn, type: 'timeout' });
      // Execute immediately in headless mode (no real timer)
      try { fn(); } catch(e) { console.error(e); }
      return id;
    },
    clearTimeout(id) {},
    setInterval(fn, ms) {
      const id = _timerIdCounter++;
      _timers.push({ id, fn, type: 'interval' });
      return id;
    },
    clearInterval(id) {},
    requestAnimationFrame(fn) {
      const id = _timerIdCounter++;
      _timers.push({ id, fn, type: 'raf' });
      // Execute immediately
      try { fn(Date.now()); } catch(e) { console.error(e); }
      return id;
    },
    cancelAnimationFrame(id) {},
    queueMicrotask(fn) {
      try { fn(); } catch(e) { console.error(e); }
    },
    getComputedStyle() {
      return new Proxy({}, { get: () => '' });
    },
    addEventListener(type, fn) {},
    removeEventListener(type, fn) {},
    dispatchEvent(event) {},
    innerWidth: 1024,
    innerHeight: 768,
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
    matchMedia() {
      return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} };
    },
    Event: Event,
    CustomEvent: class CustomEvent extends Event {
      constructor(type, opts) {
        super(type, opts);
        this.detail = opts?.detail || null;
      }
    },
    HTMLElement: Element,
    Node: Node,
    DocumentFragment: DocumentFragment,
    MutationObserver: class MutationObserver {
      constructor(fn) { this._fn = fn; }
      observe() {}
      disconnect() {}
    },
    ResizeObserver: class ResizeObserver {
      constructor(fn) {}
      observe() {}
      disconnect() {}
    },
    IntersectionObserver: class IntersectionObserver {
      constructor(fn) {}
      observe() {}
      disconnect() {}
    },
    // fetch stub
    fetch() { return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') }); },
    XMLHttpRequest: class XMLHttpRequest {
      open() {} send() {} setRequestHeader() {}
      get readyState() { return 0; }
      get status() { return 0; }
      get responseText() { return ''; }
    },
    btoa(s) { return s; }, // stub
    atob(s) { return s; }, // stub
  };

  // ─── Console capture ───────────────────────────────────
  const _console = {
    log(...args) { _capturedConsole.push({ level: 'log', args: args.map(String) }); },
    warn(...args) { _capturedConsole.push({ level: 'warn', args: args.map(String) }); },
    error(...args) { _capturedConsole.push({ level: 'error', args: args.map(String) }); },
    info(...args) { _capturedConsole.push({ level: 'info', args: args.map(String) }); },
    debug(...args) { _capturedConsole.push({ level: 'debug', args: args.map(String) }); },
    table() {},
    group() {},
    groupEnd() {},
    time() {},
    timeEnd() {},
    trace() {},
    assert(cond, ...args) { if (!cond) _capturedConsole.push({ level: 'error', args: ['Assertion failed:', ...args.map(String)] }); },
    dir() {},
  };

  // ─── Expose globals ────────────────────────────────────
  globalThis.window = _window;
  globalThis.document = _document;
  globalThis.console = _console;
  globalThis.navigator = _window.navigator;
  globalThis.location = _window.location;
  globalThis.localStorage = _window.localStorage;
  globalThis.sessionStorage = _window.sessionStorage;
  globalThis.setTimeout = _window.setTimeout;
  globalThis.clearTimeout = _window.clearTimeout;
  globalThis.setInterval = _window.setInterval;
  globalThis.clearInterval = _window.clearInterval;
  globalThis.requestAnimationFrame = _window.requestAnimationFrame;
  globalThis.cancelAnimationFrame = _window.cancelAnimationFrame;
  globalThis.queueMicrotask = _window.queueMicrotask;
  globalThis.getComputedStyle = _window.getComputedStyle;
  globalThis.matchMedia = _window.matchMedia;
  globalThis.Event = Event;
  globalThis.CustomEvent = _window.CustomEvent;
  globalThis.HTMLElement = Element;
  globalThis.Node = Node;
  globalThis.DocumentFragment = DocumentFragment;
  globalThis.MutationObserver = _window.MutationObserver;
  globalThis.ResizeObserver = _window.ResizeObserver;
  globalThis.IntersectionObserver = _window.IntersectionObserver;
  globalThis.fetch = _window.fetch;
  globalThis.XMLHttpRequest = _window.XMLHttpRequest;
  globalThis.btoa = _window.btoa;
  globalThis.atob = _window.atob;
  globalThis.self = _window;

  // ─── Uncaught error capture ─────────────────────────────
  const _uncaughtErrors = [];

  // ─── Helpers for Rust to read ──────────────────────────
  globalThis.__novoid_browser = {
    getCapturedConsole() { return JSON.stringify(_capturedConsole); },
    getBody() { return _document.body; },
    flushRAFs() {
      for (const t of _timers) {
        if (t.type === 'raf') {
          try { t.fn(Date.now()); } catch(e) {
            _uncaughtErrors.push({ type: 'raf', message: e.message || String(e), stack: e.stack || '' });
          }
        }
      }
    },
    getUncaughtErrors() { return JSON.stringify(_uncaughtErrors); },
    captureError(type, message, stack) {
      _uncaughtErrors.push({ type, message: message || '', stack: stack || '' });
      _capturedConsole.push({ level: 'error', args: ['[uncaught] ' + message] });
    },
  };
})();
