/**
 * ═══════════════════════════════════════════════════════════
 * NOVOID Core v1.0 — Reactive Primitives
 * signal, computed, effect, batch, ref, createContext, createStore,
 * component, h, list, when, match, portal, errorBoundary, suspense,
 * onMount, transition, bus, createForm, useAsync, template, onError, mount
 * ═══════════════════════════════════════════════════════════
 */
const Novoid = (() => {
  // ─── Internal State ────────────────────────────────────
  const _components = new Map();
  const _errorHandlers = [];
  const _ownerNodes = new WeakMap();
  let _currentOwner = null;
  let _activeEffect = null;
  let _batchQueue = [];
  let _isBatching = false;
  let _notifying = false;
  let _pendingNotifications = [];
  let _componentId = 0;
  let _mountCallbacks = [];
  let _hasMounted = false;

  // ─── Ownership Primitives ────────────────────────────
  function _createOwner() {
    const owner = { owned: [], cleanups: [], owner: _currentOwner };
    if (_currentOwner) _currentOwner.owned.push(owner);
    return owner;
  }

  function _disposeOwner(owner) {
    if (!owner) return;
    // Dispose children LIFO
    for (let i = owner.owned.length - 1; i >= 0; i--) _disposeOwner(owner.owned[i]);
    owner.owned.length = 0;
    // Run cleanups LIFO
    for (let i = owner.cleanups.length - 1; i >= 0; i--) owner.cleanups[i]();
    owner.cleanups.length = 0;
    // Detach from parent
    if (owner.owner) {
      const idx = owner.owner.owned.indexOf(owner);
      if (idx > -1) owner.owner.owned.splice(idx, 1);
    }
  }

  function createRoot(fn) {
    const owner = _createOwner();
    const prev = _currentOwner;
    _currentOwner = owner;
    try {
      return fn(() => _disposeOwner(owner));
    } finally {
      _currentOwner = prev;
    }
  }

  function onCleanup(fn) {
    if (_currentOwner) _currentOwner.cleanups.push(fn);
  }

  // ─── 1. SIGNAL ─────────────────────────────────────────
  function signal(initialValue, name) {
    let _value = initialValue;
    const _subs = new Set();
    const id = Symbol('signal');

    const getter = () => {
      if (_activeEffect) {
        _subs.add(_activeEffect);
        if (_activeEffect._trackedSubs) _activeEffect._trackedSubs.push(_subs);
      }
      return _value;
    };

    const setter = (newValue) => {
      const resolved = typeof newValue === 'function' ? newValue(_value) : newValue;
      if (Object.is(_value, resolved)) return;
      _value = resolved;
      if (_isBatching) {
        _batchQueue.push(() => [..._subs].forEach(fn => fn()));
      } else if (_notifying) {
        // Re-entrant: queue for after current notification pass
        for (const fn of _subs) _pendingNotifications.push(fn);
      } else {
        _notifying = true;
        try {
          [..._subs].forEach(fn => fn());
        } finally {
          // Drain pending (deduplicated)
          while (_pendingNotifications.length) {
            const pending = [...new Set(_pendingNotifications)];
            _pendingNotifications = [];
            pending.forEach(fn => fn());
          }
          _notifying = false;
        }
      }
    };

    getter.peek = () => _value;
    getter.subscribe = (fn) => { _subs.add(fn); return () => _subs.delete(fn); };
    getter.id = id;
    if (name) getter.signalName = name;

    return [getter, setter];
  }

  // ─── 2. COMPUTED ───────────────────────────────────────
  function computed(fn) {
    const [get, set] = signal(undefined);
    let _isRunning = false;
    effect(() => {
      if (_isRunning) { console.warn('Novoid: circular computed detected'); return; }
      _isRunning = true;
      try { set(fn()); } finally { _isRunning = false; }
    });
    return get;
  }

  // ─── 3. EFFECT ─────────────────────────────────────────
  function effect(fn, deps) {
    let cleanup;
    let prevDeps;
    const owner = _createOwner();

    const execute = () => {
      // Unsubscribe from old signals before re-running
      if (execute._trackedSubs) {
        for (const subSet of execute._trackedSubs) subSet.delete(execute);
      }
      execute._trackedSubs = [];

      if (deps) {
        const newDeps = deps();
        if (prevDeps && newDeps.every((d, i) => Object.is(d, prevDeps[i]))) return;
        prevDeps = newDeps;
      }
      if (cleanup) cleanup();
      // Dispose child owners before re-running
      for (let i = owner.owned.length - 1; i >= 0; i--) _disposeOwner(owner.owned[i]);
      owner.owned.length = 0;
      owner.cleanups.length = 0;

      const prevOwner = _currentOwner;
      _currentOwner = owner;
      const prev = _activeEffect;
      _activeEffect = execute;
      try {
        cleanup = fn();
      } catch (e) {
        _handleError(e);
      }
      _activeEffect = prev;
      _currentOwner = prevOwner;
    };

    execute._trackedSubs = [];
    execute();

    return () => {
      if (cleanup) cleanup();
      // Unsubscribe from all signals
      if (execute._trackedSubs) {
        for (const subSet of execute._trackedSubs) subSet.delete(execute);
        execute._trackedSubs = null;
      }
      _disposeOwner(owner);
    };
  }

  function _trackDisposer(node, disposeFn) {
    let arr = _ownerNodes.get(node);
    if (!arr) { arr = []; _ownerNodes.set(node, arr); }
    arr.push(disposeFn);
  }

  function _disposeTree(node) {
    const disposers = _ownerNodes.get(node);
    if (disposers) { disposers.forEach(d => d()); _ownerNodes.delete(node); }
    if (node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) _disposeTree(node.childNodes[i]);
    }
  }

  // ─── 4. BATCH ──────────────────────────────────────────
  function batch(fn) {
    const wasAlreadyBatching = _isBatching;
    _isBatching = true;
    fn();
    if (!wasAlreadyBatching) {
      _isBatching = false;
      const queued = [..._batchQueue];
      _batchQueue = [];
      const unique = new Set(queued);
      unique.forEach(f => f());
    }
  }

  // ─── 5. REF ────────────────────────────────────────────
  function ref(initialValue = null) {
    return { current: initialValue };
  }

  // ─── 6. CONTEXT ────────────────────────────────────────
  function createContext(defaultValue) {
    const id = Symbol('context');
    const stack = [defaultValue];

    return {
      id,
      Provider: (value, children) => {
        stack.push(value);
        const result = typeof children === 'function' ? children() : children;
        stack.pop();
        return result;
      },
      use: () => stack[stack.length - 1],
    };
  }

  // ─── 7. STORE ──────────────────────────────────────────
  function createStore(initialState, actions = {}) {
    if (typeof initialState === 'object' && initialState !== null) Object.freeze(initialState);
    const [getState, setState] = signal(initialState);
    const listeners = new Set();

    const store = {
      get: getState,
      set: (updater) => {
        const next = typeof updater === 'function' ? updater(getState()) : updater;
        if (typeof next === 'object' && next !== null) Object.freeze(next);
        setState(next);
        listeners.forEach(fn => fn(getState()));
      },
      subscribe: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      actions: {},
    };

    Object.defineProperty(store, 'state', { get: getState });
    store.select = (key) => computed(() => getState()[key]);

    for (const [key, action] of Object.entries(actions)) {
      store.actions[key] = (...args) => {
        const partial = action(getState(), ...args);
        store.set(Object.assign({}, getState(), partial));
      };
    }

    return store;
  }

  // ─── 8. COMPONENT ──────────────────────────────────────
  function component(name, renderFn) {
    _components.set(name, renderFn);

    return (props = {}) => {
      const id = `nv-${name}-${_componentId++}`;
      try {
        const el = renderFn({ ...props, _id: id });
        if (el instanceof HTMLElement) {
          el.dataset.nvComponent = name;
          el.dataset.nvId = id;
        }
        return el;
      } catch (e) {
        return _handleError(e, name);
      }
    };
  }

  // ─── Focus restoration helper ─────────────────────────
  function _restoreFocus(original, id, name, tag, value, selPos) {
    if (!tag) return; // nothing was focused
    if (document.activeElement === original) return; // still focused, no action needed
    // Only restore if the original was an input-like element worth restoring
    const inputTags = ['INPUT', 'TEXTAREA', 'SELECT'];
    if (!inputTags.includes(tag)) return;
    // Try to find the original element — it must still be connected to the DOM
    let target = null;
    if (original && original.isConnected) {
      target = original;
    }
    // Fallback: find by id
    if (!target && id) target = document.getElementById(id);
    // Fallback: find by name
    if (!target && name) target = document.querySelector('[name="' + name + '"]');
    if (target && target !== document.activeElement) {
      try { target.focus(); } catch {}
      if (value != null && 'value' in target && target.value !== value) target.value = value;
      if (selPos != null && target.setSelectionRange) {
        try { target.setSelectionRange(selPos, selPos); } catch {}
      }
    }
  }

  // ─── 9. REACTIVE DOM (h + _appendChildren) ────────────
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);

    for (const [key, value] of Object.entries(attrs || {})) {
      if (key === 'ref' && value && typeof value === 'object') {
        value.current = el;
      } else if (key === 'className' || key === 'class') {
        if (typeof value === 'function') {
          _trackDisposer(el, effect(() => { el.className = value(); }));
        } else {
          el.className = value;
        }
      } else if (key === 'style' && typeof value === 'function') {
        _trackDisposer(el, effect(() => { const v = value(); if (typeof v === 'string') { el.style.cssText = v; } else { Object.assign(el.style, v); } }));
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(el.style, value);
      } else if (key.startsWith('on')) {
        const event = key.slice(2).toLowerCase();
        el.addEventListener(event, value);
        if (_currentOwner) onCleanup(() => el.removeEventListener(event, value));
      } else if (key === 'html') {
        const _sanitize = (v) => {
          if (typeof v !== 'string') return v;
          const temp = document.createElement('div');
          temp.innerHTML = v;
          temp.querySelectorAll('script,iframe,object,embed,form,math,annotation-xml').forEach(n => n.remove());
          temp.querySelectorAll('svg').forEach(svg => {
            svg.querySelectorAll('foreignObject,script,set,animate,animateTransform').forEach(n => n.remove());
          });
          temp.querySelectorAll('*').forEach(n => {
            for (const attr of [...n.attributes]) {
              const name = attr.name.toLowerCase();
              const val = attr.value.trimStart().toLowerCase();
              if (name.startsWith('on') || name === 'srcdoc' ||
                  ((name === 'href' || name === 'xlink:href' || name === 'action' || name === 'formaction' || name === 'data') && val.startsWith('javascript:'))) {
                n.removeAttribute(attr.name);
              }
            }
          });
          return temp.innerHTML;
        };
        if (typeof value === 'function') {
          _trackDisposer(el, effect(() => { el.innerHTML = _sanitize(value()); }));
        } else {
          el.innerHTML = _sanitize(value);
        }
      } else if (key === 'show') {
        _trackDisposer(el, effect(() => {
          const visible = typeof value === 'function' ? value() : value;
          el.style.display = visible ? '' : 'none';
        }));
      } else if (key === 'bind') {
        const [getter, setter] = value;
        el.value = getter();
        _trackDisposer(el, effect(() => { const v = getter(); if (el.value !== v) el.value = v; }));
        const _bindHandler = (e) => setter(e.target.value);
        el.addEventListener('input', _bindHandler);
        if (_currentOwner) onCleanup(() => el.removeEventListener('input', _bindHandler));
      } else if (key === 'disabled' || key === 'checked' || key === 'readonly' || key === 'required' || key === 'hidden' || key === 'selected' || key === 'multiple' || key === 'autofocus' || key === 'open') {
        if (typeof value === 'function') {
          _trackDisposer(el, effect(() => { const v = value(); el[key] = !!v; }));
        } else {
          el[key] = !!value;
        }
      } else {
        if (typeof value === 'function' && key !== 'onclick') {
          _trackDisposer(el, effect(() => { el.setAttribute(key, value()); }));
        } else {
          el.setAttribute(key, value);
        }
      }
    }

    _appendChildren(el, children);
    return el;
  }

  function _appendChildren(parent, children) {
    for (const child of children.flat(Infinity)) {
      if (child == null || child === false) continue;
      if (child instanceof Node) {
        parent.appendChild(child);
      } else if (typeof child === 'function') {
        const placeholder = document.createComment('reactive');
        parent.appendChild(placeholder);
        let current = [];
        let innerDisposers = [];
        effect(() => {
          const result = child();
          // Save focus state before ANY DOM mutation — focus can be lost
          // even when the focused element is a sibling, not inside this block
          const focused = document.activeElement;
          const focusId = focused?.id;
          const focusName = focused?.getAttribute?.('name');
          const focusTag = (focused && focused !== document.body && focused !== document.documentElement) ? focused.tagName : null;
          const focusValue = focusTag ? focused.value : null;
          const focusPos = focusTag ? focused.selectionStart : null;
          innerDisposers.forEach(d => d());
          innerDisposers = [];
          current.forEach(n => { _disposeTree(n); n.remove(); });
          current = [];
          if (result == null || result === false) {
            _restoreFocus(focused, focusId, focusName, focusTag, focusValue, focusPos);
            return;
          }
          const nodes = Array.isArray(result)
            ? result.flat(Infinity)
            : [result];
          const frag = document.createDocumentFragment();
          nodes.forEach(n => {
            if (typeof n === 'function') {
              const inner = document.createComment('reactive');
              frag.appendChild(inner);
              current.push(inner);
              let innerCurrent = [];
              const dispose = effect(() => {
                const r = n();
                const f2Focused = document.activeElement;
                const f2Tag = (f2Focused && f2Focused !== document.body) ? f2Focused.tagName : null;
                const f2Id = f2Focused?.id;
                const f2Name = f2Focused?.getAttribute?.('name');
                const f2Val = f2Tag ? f2Focused.value : null;
                const f2Pos = f2Tag ? f2Focused.selectionStart : null;
                innerCurrent.forEach(x => { _disposeTree(x); x.remove(); });
                innerCurrent = [];
                if (r == null || r === false) {
                  _restoreFocus(f2Focused, f2Id, f2Name, f2Tag, f2Val, f2Pos);
                  return () => {};
                }
                const items = Array.isArray(r) ? r.flat(Infinity) : [r];
                const f2Frag = document.createDocumentFragment();
                items.forEach(item => {
                  const node = item instanceof Node ? item : document.createTextNode(String(item));
                  innerCurrent.push(node);
                  f2Frag.appendChild(node);
                });
                if (inner.parentNode) inner.parentNode.insertBefore(f2Frag, inner.nextSibling);
                _restoreFocus(f2Focused, f2Id, f2Name, f2Tag, f2Val, f2Pos);
                return () => { innerCurrent.forEach(x => { _disposeTree(x); x.remove(); }); innerCurrent = []; };
              });
              innerDisposers.push(dispose);
            } else {
              const node = n instanceof Node ? n : document.createTextNode(String(n));
              current.push(node);
              frag.appendChild(node);
            }
          });
          if (placeholder.parentNode) placeholder.parentNode.insertBefore(frag, placeholder.nextSibling);
          _restoreFocus(focused, focusId, focusName, focusTag, focusValue, focusPos);
        });
      } else {
        parent.appendChild(document.createTextNode(String(child)));
      }
    }
  }

  // ─── 10. LIST ──────────────────────────────────────────
  function list(container, items, keyFn, renderFn) {
    const nodeMap = new Map();
    const signalMap = new Map();
    let currentKeys = [];

    effect(() => {
      const data = typeof items === 'function' ? items() : items;
      if (!data) return;
      const newKeys = data.map(keyFn);
      const newKeySet = new Set(newKeys);

      // Remove nodes whose keys no longer exist
      for (const key of currentKeys) {
        if (!newKeySet.has(key)) {
          const node = nodeMap.get(key);
          if (node) { _disposeTree(node); node.remove(); }
          nodeMap.delete(key);
          signalMap.delete(key);
        }
      }

      // Create or update items
      for (let i = 0; i < data.length; i++) {
        const key = newKeys[i];
        const item = data[i];

        if (!nodeMap.has(key)) {
          // New key — create signal + render once
          const [getItem, setItem] = signal(item);
          signalMap.set(key, [getItem, setItem]);
          const node = renderFn(item, i);
          node.dataset.nvKey = key;
          nodeMap.set(key, node);
        } else {
          // Existing key — update the signal (no DOM replacement)
          const [, setItem] = signalMap.get(key);
          setItem(item);
        }
      }

      // Reorder
      let prevNode = null;
      for (let i = 0; i < newKeys.length; i++) {
        const node = nodeMap.get(newKeys[i]);
        const expected = prevNode ? prevNode.nextSibling : container.firstChild;
        if (node !== expected) {
          container.insertBefore(node, expected);
        }
        prevNode = node;
      }

      currentKeys = newKeys;
    });

    return container;
  }

  // ─── 11. CONDITIONAL RENDERING ─────────────────────────
  function when(condition, thenFn, elseFn) {
    return () => {
      const result = typeof condition === 'function' ? condition() : condition;
      return result ? thenFn() : (elseFn ? elseFn() : null);
    };
  }

  function match(value, cases) {
    return () => {
      const resolved = typeof value === 'function' ? value() : value;
      const handler = cases[resolved] || cases.default;
      return handler ? handler() : null;
    };
  }

  // ─── 12. PORTAL ────────────────────────────────────────
  function portal(target, content) {
    const container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!container) {
      console.warn(`Novoid: Portal target "${target}" not found`);
      return;
    }
    const wrapper = document.createElement('div');
    wrapper.dataset.nvPortal = 'true';

    if (typeof content === 'function') {
      effect(() => {
        wrapper.innerHTML = '';
        const result = content();
        if (result instanceof Node) wrapper.appendChild(result);
      });
    } else if (content instanceof Node) {
      wrapper.appendChild(content);
    }

    container.appendChild(wrapper);
    if (_currentOwner) onCleanup(() => wrapper.remove());
    return () => wrapper.remove();
  }

  // ─── 13. ERROR BOUNDARY ────────────────────────────────
  function errorBoundary(renderFn, fallbackFn) {
    const container = document.createElement('div');
    container.dataset.nvErrorBoundary = 'true';

    try {
      const content = renderFn();
      if (content instanceof Node) container.appendChild(content);
    } catch (error) {
      const fallback = fallbackFn(error);
      if (fallback instanceof Node) container.appendChild(fallback);
    }

    return container;
  }

  function _handleError(error, componentName) {
    console.error(`Novoid Error${componentName ? ` in <${componentName}>` : ''}:`, error);
    for (const handler of _errorHandlers) {
      handler(error, componentName);
    }
    const el = document.createElement('div');
    el.className = 'nv-alert nv-alert-danger';
    el.textContent = `Error${componentName ? ` in <${componentName}>` : ''}: ${error.message}`;
    return el;
  }

  function onError(handler) {
    _errorHandlers.push(handler);
  }

  // ─── 14. SUSPENSE ──────────────────────────────────────
  function suspense(asyncFn, fallback) {
    const container = document.createElement('div');
    container.dataset.nvSuspense = 'true';

    if (fallback) {
      const fb = typeof fallback === 'function' ? fallback() : fallback;
      if (fb instanceof Node) container.appendChild(fb);
      else container.innerHTML = fb;
    }

    asyncFn().then(content => {
      container.innerHTML = '';
      if (content instanceof Node) container.appendChild(content);
      else if (typeof content === 'string') container.innerHTML = content;
    }).catch(err => {
      container.innerHTML = '';
      container.appendChild(_handleError(err));
    });

    return container;
  }

  // ─── 15. LIFECYCLE ─────────────────────────────────────
  function onMount(fn) {
    if (_hasMounted) { queueMicrotask(fn); }
    else { _mountCallbacks.push(fn); }
  }

  // ─── 16. TRANSITION ────────────────────────────────────
  function transition(el, { enter, leave, duration = 300 }) {
    return {
      in: () => {
        el.style.transition = `all ${duration}ms ease`;
        if (enter) Object.assign(el.style, enter.from || {});
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            Object.assign(el.style, enter.to || {});
          });
        });
      },
      out: () => new Promise(resolve => {
        el.style.transition = `all ${duration}ms ease`;
        if (leave) Object.assign(el.style, leave.to || {});
        setTimeout(() => { resolve(); }, duration);
      }),
    };
  }

  // ─── 17. EVENT BUS ─────────────────────────────────────
  const bus = (() => {
    const handlers = new Map();
    return {
      on(event, fn) {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event).add(fn);
        return () => handlers.get(event).delete(fn);
      },
      emit(event, data) {
        if (handlers.has(event)) handlers.get(event).forEach(fn => fn(data));
      },
      off(event, fn) {
        if (fn) handlers.get(event)?.delete(fn);
        else handlers.delete(event);
      },
    };
  })();

  // ─── 18. FORM HANDLING ─────────────────────────────────
  function createForm(schema) {
    const fields = {};
    const errors = {};
    const [isValid, setValid] = signal(true);
    const [isSubmitting, setSubmitting] = signal(false);

    for (const [name, config] of Object.entries(schema)) {
      const [value, setValue] = signal(config.initial || '');
      const [error, setError] = signal('');
      fields[name] = { get: value, set: setValue };
      errors[name] = { get: error, set: setError };
    }

    function validate() {
      let valid = true;
      for (const [name, config] of Object.entries(schema)) {
        const value = fields[name].get();
        let err = '';
        if (config.required && !value) err = `${name} is required`;
        else if (config.minLength && value.length < config.minLength) err = `Min ${config.minLength} characters`;
        else if (config.maxLength && value.length > config.maxLength) err = `Max ${config.maxLength} characters`;
        else if (config.pattern && !config.pattern.test(value)) err = config.message || 'Invalid format';
        else if (config.validate) err = config.validate(value) || '';
        errors[name].set(err);
        if (err) valid = false;
      }
      setValid(valid);
      return valid;
    }

    async function handleSubmit(onSubmit) {
      if (!validate()) return;
      setSubmitting(true);
      const data = {};
      for (const [name, field] of Object.entries(fields)) data[name] = field.get();
      try {
        await onSubmit(data);
      } catch (e) {
        _handleError(e);
      }
      setSubmitting(false);
    }

    function reset() {
      for (const [name, config] of Object.entries(schema)) {
        fields[name].set(config.initial || '');
        errors[name].set('');
      }
      setValid(true);
    }

    return { fields, errors, isValid, isSubmitting, validate, handleSubmit, reset };
  }

  // ─── 19. ASYNC DATA ────────────────────────────────────
  function useAsync(asyncFn) {
    const [data, setData] = signal(null);
    const [loading, setLoading] = signal(true);
    const [error, setError] = signal(null);

    async function execute() {
      setLoading(true);
      setError(null);
      try {
        const result = await asyncFn();
        setData(result);
      } catch (e) {
        setError(e);
      }
      setLoading(false);
    }

    execute();

    return { data, loading, error, refetch: execute };
  }

  // ─── 20. TEMPLATE ──────────────────────────────────────
  function template(html, data = {}) {
    const escapeHTML = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    let result = html;
    for (const [key, value] of Object.entries(data)) {
      const resolved = typeof value === 'function' ? value() : value;
      result = result.replaceAll(`{{{${key}}}}`, String(resolved));
      result = result.replaceAll(`{{${key}}}`, escapeHTML(resolved));
    }
    const temp = document.createElement('template');
    temp.innerHTML = result.trim();
    return temp.content.firstElementChild || temp.content;
  }

  // ─── 21. MOUNT ─────────────────────────────────────────
  function mount(selector, appFn) {
    const root = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!root) { console.error(`Novoid: Mount target "${selector}" not found`); return; }
    // Dispose previous mount
    if (root._nvDispose) { root._nvDispose(); }
    root.innerHTML = '';
    createRoot((dispose) => {
      root._nvDispose = dispose;
      const content = appFn();
      if (content instanceof Node) root.appendChild(content);
    });
    _hasMounted = true;
    // Run mount callbacks after layout settles (no setTimeout needed by user)
    requestAnimationFrame(() => {
      _mountCallbacks.forEach(fn => fn());
      _mountCallbacks = [];
    });
    return root;
  }

  // ─── PUBLIC API ────────────────────────────────────────
  return {
    signal, computed, effect, batch,
    ref,
    createContext, createStore,
    component, h,
    list, when, match, template,
    portal, errorBoundary, suspense,
    onMount, createRoot, onCleanup,
    transition,
    bus,
    createForm,
    useAsync,
    onError,
    mount,
    // Expose internals for plugins
    _components, _errorHandlers,
    _appendChildren,
    get _activeEffect() { return _activeEffect; },
    set _activeEffect(v) { _activeEffect = v; },
    get _batchQueue() { return _batchQueue; },
    set _batchQueue(v) { _batchQueue = v; },
    get _isBatching() { return _isBatching; },
    set _isBatching(v) { _isBatching = v; },
    get _componentId() { return _componentId; },
    set _componentId(v) { _componentId = v; },
    get _mountCallbacks() { return _mountCallbacks; },
    set _mountCallbacks(v) { _mountCallbacks = v; },
    get _hasMounted() { return _hasMounted; },
    set _hasMounted(v) { _hasMounted = v; },
    _handleError,
    _disposeTree,
    _trackDisposer,
  };
})();

// ─── INTROSPECTION (for novoid-browser) ──────────────
Novoid.__introspect = function() {
  const signals = [];
  const stores = [];
  const components = [...Novoid._components.keys()];
  return { signals, stores, components };
};

if (typeof window !== 'undefined') window.Novoid = Novoid;
