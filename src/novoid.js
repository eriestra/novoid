/**
 * ═══════════════════════════════════════════════════════════
 * NOVOID.js v1.0 — Vanilla Reactive Framework
 * All React features. Zero build tools. Instant deployment.
 * ═══════════════════════════════════════════════════════════
 */

const Novoid = (() => {
  // ─── Internal State ────────────────────────────────────
  const _subscribers = new Map();
  const _effects = [];
  const _cleanups = new Map();
  const _contexts = new Map();
  const _components = new Map();
  const _refs = new Map();
  const _memos = new Map();
  const _errorHandlers = [];
  const _routes = [];
  let _activeEffect = null;
  let _batchQueue = [];
  let _isBatching = false;
  let _componentId = 0;
  let _mountCallbacks = [];
  let _unmountCallbacks = new Map();

  // ─── 1. SIGNAL (Reactive State — like useState) ────────
  function signal(initialValue) {
    let _value = initialValue;
    const _subs = new Set();
    const id = Symbol('signal');

    const getter = () => {
      if (_activeEffect) _subs.add(_activeEffect);
      return _value;
    };

    const setter = (newValue) => {
      const resolved = typeof newValue === 'function' ? newValue(_value) : newValue;
      if (Object.is(_value, resolved)) return;
      _value = resolved;
      if (_isBatching) {
        _batchQueue.push(() => _subs.forEach(fn => fn()));
      } else {
        _subs.forEach(fn => fn());
      }
    };

    getter.peek = () => _value;
    getter.subscribe = (fn) => { _subs.add(fn); return () => _subs.delete(fn); };
    getter.id = id;

    return [getter, setter];
  }

  // ─── 2. COMPUTED (Derived State — like useMemo) ────────
  function computed(fn) {
    let cached;
    let dirty = true;
    const [get, set] = signal(undefined);

    effect(() => {
      cached = fn();
      dirty = false;
      set(cached);
    });

    return () => {
      return get();
    };
  }

  // ─── 3. EFFECT (Side Effects — like useEffect) ─────────
  function effect(fn, deps) {
    let cleanup;
    let prevDeps;

    const execute = () => {
      if (deps) {
        const newDeps = deps();
        if (prevDeps && newDeps.every((d, i) => Object.is(d, prevDeps[i]))) return;
        prevDeps = newDeps;
      }
      if (cleanup) cleanup();
      const prev = _activeEffect;
      _activeEffect = execute;
      try {
        cleanup = fn();
      } catch (e) {
        _handleError(e);
      }
      _activeEffect = prev;
    };

    execute();
    _effects.push(execute);

    return () => {
      if (cleanup) cleanup();
      const idx = _effects.indexOf(execute);
      if (idx > -1) _effects.splice(idx, 1);
    };
  }

  // ─── 4. BATCH (Like React 18 automatic batching) ──────
  function batch(fn) {
    _isBatching = true;
    fn();
    _isBatching = false;
    const queued = [..._batchQueue];
    _batchQueue = [];
    const unique = new Set(queued);
    unique.forEach(f => f());
  }

  // ─── 5. REF (DOM Reference — like useRef) ──────────────
  function ref(initialValue = null) {
    return { current: initialValue };
  }

  // ─── 6. CONTEXT (Shared State — like useContext) ───────
  function createContext(defaultValue) {
    const id = Symbol('context');
    _contexts.set(id, defaultValue);

    return {
      id,
      Provider: (value, children) => {
        _contexts.set(id, value);
        const result = typeof children === 'function' ? children() : children;
        return result;
      },
      use: () => _contexts.get(id),
    };
  }

  // ─── 7. STORE (Global State — like Redux/Zustand) ─────
  function createStore(initialState, actions = {}) {
    const [getState, setState] = signal(initialState);
    const listeners = new Set();

    const store = {
      get: getState,
      set: (updater) => {
        setState(updater);
        listeners.forEach(fn => fn(getState()));
      },
      subscribe: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      actions: {},
    };

    for (const [key, action] of Object.entries(actions)) {
      store.actions[key] = (...args) => {
        const newState = action(getState(), ...args);
        store.set(newState);
      };
    }

    return store;
  }

  // ─── 8. COMPONENT (Declarative Components) ─────────────
  function component(name, renderFn) {
    _components.set(name, renderFn);

    return (props = {}) => {
      const id = `nv-${name}-${_componentId++}`;
      try {
        const el = renderFn({ ...props, _id: id });
        if (el instanceof HTMLElement) {
          el.dataset.novaComponent = name;
          el.dataset.novaId = id;
        }
        return el;
      } catch (e) {
        return _handleError(e, name);
      }
    };
  }

  // ─── 9. REACTIVE DOM HELPERS ───────────────────────────

  // Create element with reactive bindings
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);

    for (const [key, value] of Object.entries(attrs || {})) {
      if (key === 'ref' && value && typeof value === 'object') {
        value.current = el;
      } else if (key === 'className' || key === 'class') {
        if (typeof value === 'function') {
          effect(() => { el.className = value(); });
        } else {
          el.className = value;
        }
      } else if (key === 'style' && typeof value === 'object') {
        if (typeof value === 'function') {
          effect(() => { Object.assign(el.style, value()); });
        } else {
          Object.assign(el.style, value);
        }
      } else if (key.startsWith('on')) {
        const event = key.slice(2).toLowerCase();
        el.addEventListener(event, value);
      } else if (key === 'html') {
        if (typeof value === 'function') {
          effect(() => { el.innerHTML = value(); });
        } else {
          el.innerHTML = value;
        }
      } else if (key === 'show') {
        effect(() => {
          const visible = typeof value === 'function' ? value() : value;
          el.style.display = visible ? '' : 'none';
        });
      } else if (key === 'bind') {
        // Two-way binding
        const [getter, setter] = value;
        el.value = getter();
        effect(() => { const v = getter(); if (el.value !== v) el.value = v; });
        el.addEventListener('input', (e) => setter(e.target.value));
      } else {
        if (typeof value === 'function' && key !== 'onclick') {
          effect(() => { el.setAttribute(key, value()); });
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
        effect(() => {
          const result = child();
          current.forEach(n => n.remove());
          current = [];
          if (result == null || result === false) return;
          const nodes = Array.isArray(result)
            ? result.flat(Infinity)
            : [result];
          const frag = document.createDocumentFragment();
          nodes.forEach(n => {
            const node = n instanceof Node ? n : document.createTextNode(String(n));
            current.push(node);
            frag.appendChild(node);
          });
          placeholder.parentNode.insertBefore(frag, placeholder.nextSibling);
        });
      } else {
        parent.appendChild(document.createTextNode(String(child)));
      }
    }
  }

  // ─── 10. LIST RENDERING (with keyed reconciliation) ───
  function list(container, items, keyFn, renderFn) {
    const nodeMap = new Map();
    let currentKeys = [];

    effect(() => {
      const data = typeof items === 'function' ? items() : items;
      const newKeys = data.map(keyFn);
      const newKeySet = new Set(newKeys);

      // Remove nodes whose keys no longer exist
      for (const key of currentKeys) {
        if (!newKeySet.has(key)) {
          const node = nodeMap.get(key);
          if (node) node.remove();
          nodeMap.delete(key);
        }
      }

      // Create missing nodes, reuse existing ones
      for (let i = 0; i < data.length; i++) {
        const key = newKeys[i];
        if (!nodeMap.has(key)) {
          const node = renderFn(data[i], i);
          node.dataset.novaKey = key;
          nodeMap.set(key, node);
        }
      }

      // In-place reorder with minimal DOM mutations
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
  }

  // ─── 11. CONDITIONAL RENDERING ─────────────────────────
  function when(condition, thenFn, elseFn) {
    return () => {
      const result = typeof condition === 'function' ? condition() : condition;
      return result ? thenFn() : (elseFn ? elseFn() : null);
    };
  }

  function show(condition, content) {
    return () => {
      const result = typeof condition === 'function' ? condition() : condition;
      return result ? (typeof content === 'function' ? content() : content) : null;
    };
  }

  function match(value, cases) {
    return () => {
      const resolved = typeof value === 'function' ? value() : value;
      const handler = cases[resolved] || cases.default;
      return handler ? handler() : null;
    };
  }

  // ─── 12. PORTAL (Render into different DOM node) ──────
  function portal(target, content) {
    const container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!container) {
      console.warn(`Novoid: Portal target "${target}" not found`);
      return;
    }
    const wrapper = document.createElement('div');
    wrapper.dataset.novaPortal = 'true';

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

    return () => wrapper.remove();
  }

  // ─── 13. ERROR BOUNDARY ─────────────────────────────────
  function errorBoundary(renderFn, fallbackFn) {
    const container = document.createElement('div');
    container.dataset.novaErrorBoundary = 'true';

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

  // ─── 14. SUSPENSE (Async loading) ─────────────────────
  function suspense(asyncFn, fallback) {
    const container = document.createElement('div');
    container.dataset.novaSuspense = 'true';

    // Show fallback
    if (fallback) {
      const fb = typeof fallback === 'function' ? fallback() : fallback;
      if (fb instanceof Node) container.appendChild(fb);
      else container.innerHTML = fb;
    }

    // Load async content
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

  // ─── 15. LAZY LOADING (Code Splitting equivalent) ─────
  function lazy(importFn) {
    let loaded = null;

    return (props) => {
      if (loaded) return loaded(props);
      return suspense(
        async () => {
          const module = await importFn();
          loaded = module.default || module;
          return loaded(props);
        },
        () => {
          const spinner = document.createElement('div');
          spinner.className = 'nv-flex nv-justify-center nv-p-8';
          spinner.innerHTML = '<div class="nv-spinner"></div>';
          return spinner;
        }
      );
    };
  }

  // ─── 16. ROUTER (Client-side routing) ─────────────────
  function createRouter(routes, container) {
    const [currentRoute, setRoute] = signal(window.location.hash.slice(1) || '/');
    let currentCleanup = null;

    function navigate(path) {
      window.location.hash = path;
    }

    function renderRoute() {
      const path = currentRoute();
      let matched = null;
      let params = {};

      for (const route of routes) {
        const routeParts = route.path.split('/');
        const pathParts = path.split('/');

        if (routeParts.length !== pathParts.length) continue;

        let isMatch = true;
        const extractedParams = {};

        for (let i = 0; i < routeParts.length; i++) {
          if (routeParts[i].startsWith(':')) {
            extractedParams[routeParts[i].slice(1)] = pathParts[i];
          } else if (routeParts[i] !== pathParts[i]) {
            isMatch = false;
            break;
          }
        }

        if (isMatch) {
          matched = route;
          params = extractedParams;
          break;
        }
      }

      if (currentCleanup) currentCleanup();
      container.innerHTML = '';

      if (matched) {
        if (matched.guard && !matched.guard()) {
          if (matched.redirect) {
            navigate(matched.redirect);
            return;
          }
        }
        const content = matched.component({ params, navigate });
        if (content instanceof Node) container.appendChild(content);
      } else {
        const notFound = routes.find(r => r.path === '*');
        if (notFound) {
          const content = notFound.component({ params: {}, navigate });
          if (content instanceof Node) container.appendChild(content);
        } else {
          container.innerHTML = '<div class="nv-alert nv-alert-warning">404 — Route not found</div>';
        }
      }
    }

    window.addEventListener('hashchange', () => {
      setRoute(window.location.hash.slice(1) || '/');
    });

    effect(renderRoute);

    return { navigate, currentRoute };
  }

  // Navigation Link helper
  function link(text, path, className = '') {
    const a = document.createElement('a');
    a.href = `#${path}`;
    a.textContent = text;
    a.className = className;
    return a;
  }

  // ─── 17. LIFECYCLE HOOKS ──────────────────────────────
  function onMount(fn) {
    _mountCallbacks.push(fn);
  }

  function onUnmount(id, fn) {
    _unmountCallbacks.set(id, fn);
  }

  // ─── 18. TRANSITION (Animations) ──────────────────────
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

  // ─── 19. EVENT BUS (Custom Events) ────────────────────
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

  // ─── 20. FORM HANDLING ────────────────────────────────
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

  // ─── 21. ASYNC DATA (like React Query / useSWR) ──────
  function useAsync(asyncFn, deps = []) {
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

  // ─── 22. MEMO (Prevent unnecessary recalculation) ────
  function memo(fn, deps) {
    let cached;
    let prevDeps;

    return () => {
      const newDeps = deps();
      if (prevDeps && newDeps.every((d, i) => Object.is(d, prevDeps[i]))) return cached;
      prevDeps = newDeps;
      cached = fn();
      return cached;
    };
  }

  // ─── 23. TEMPLATE RENDERING ────────────────────────────
  function template(html, data = {}) {
    let result = html;
    for (const [key, value] of Object.entries(data)) {
      const resolved = typeof value === 'function' ? value() : value;
      result = result.replaceAll(`{{${key}}}`, resolved);
    }
    const temp = document.createElement('template');
    temp.innerHTML = result.trim();
    return temp.content.firstElementChild || temp.content;
  }

  // ─── 24. TOAST SYSTEM ─────────────────────────────────
  const toast = (() => {
    let container;
    function ensureContainer() {
      if (!container) {
        container = document.createElement('div');
        container.className = 'nv-toast-container';
        document.body.appendChild(container);
      }
    }

    function show(message, type = '', duration = 3000) {
      ensureContainer();
      const el = document.createElement('div');
      el.className = `nv-toast ${type ? `nv-toast-${type}` : ''}`;
      el.textContent = message;
      container.appendChild(el);
      setTimeout(() => {
        el.classList.add('nv-toast-exit');
        setTimeout(() => el.remove(), 300);
      }, duration);
    }

    return {
      info: (msg, d) => show(msg, '', d),
      success: (msg, d) => show(msg, 'success', d),
      danger: (msg, d) => show(msg, 'danger', d),
      warning: (msg, d) => show(msg, 'warning', d),
    };
  })();

  // ─── 25. MOUNT APP ────────────────────────────────────
  function mount(selector, appFn) {
    const root = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!root) { console.error(`Novoid: Mount target "${selector}" not found`); return; }
    root.innerHTML = '';
    const content = appFn();
    if (content instanceof Node) root.appendChild(content);
    _mountCallbacks.forEach(fn => fn());
    _mountCallbacks = [];
    return root;
  }

  // ─── 26. CONVEX INTEGRATION (Optional) ────────────────
  function _requireConvex() {
    if (typeof window === 'undefined' || typeof window.convex === 'undefined') {
      throw new Error(
        'Novoid: Convex not found. Add <scr' + 'ipt src="https://unpkg.com/convex@latest/dist/browser.bundle.js"><\/scr' + 'ipt> before your app script.'
      );
    }
  }

  function createClient(url) {
    _requireConvex();
    return new window.convex.ConvexClient(url);
  }

  function useQuery(client, queryRef, args) {
    const [data, setData] = signal(undefined);
    const [loading, setLoading] = signal(true);
    const [error, setError] = signal(undefined);

    effect(() => {
      const resolvedArgs = typeof args === 'function' ? args() : args;

      if (resolvedArgs === 'skip') {
        batch(() => { setLoading(false); setData(undefined); setError(undefined); });
        return;
      }

      batch(() => { setLoading(true); setError(undefined); });

      const unsub = client.onUpdate(
        queryRef,
        resolvedArgs || {},
        (result) => { batch(() => { setData(result); setLoading(false); setError(undefined); }); },
        (err) => { batch(() => { setError(err); setLoading(false); }); }
      );

      return () => unsub();
    });

    return { data, loading, error };
  }

  function useMutation(client, mutationRef) {
    const [isLoading, setIsLoading] = signal(false);
    const [error, setError] = signal(undefined);

    async function mutate(args) {
      batch(() => { setIsLoading(true); setError(undefined); });
      try {
        const result = await client.mutation(mutationRef, args || {});
        setIsLoading(false);
        return result;
      } catch (err) {
        batch(() => { setIsLoading(false); setError(err); });
        throw err;
      }
    }

    mutate.isLoading = isLoading;
    mutate.error = error;
    return mutate;
  }

  function useAction(client, actionRef) {
    const [isLoading, setIsLoading] = signal(false);
    const [error, setError] = signal(undefined);

    async function act(args) {
      batch(() => { setIsLoading(true); setError(undefined); });
      try {
        const result = await client.action(actionRef, args || {});
        setIsLoading(false);
        return result;
      } catch (err) {
        batch(() => { setIsLoading(false); setError(err); });
        throw err;
      }
    }

    act.isLoading = isLoading;
    act.error = error;
    return act;
  }

  function useAuth(client, fetchToken) {
    const [isAuthenticated, setIsAuthenticated] = signal(false);
    const [isLoading, setIsLoading] = signal(true);

    client.setAuth(async ({ forceRefreshToken }) => {
      setIsLoading(true);
      try {
        const token = await fetchToken({ forceRefreshToken });
        batch(() => {
          setIsAuthenticated(!!token);
          setIsLoading(false);
        });
        return token || null;
      } catch (err) {
        batch(() => {
          setIsAuthenticated(false);
          setIsLoading(false);
        });
        return null;
      }
    });

    function logout() {
      client.setAuth(null);
      batch(() => { setIsAuthenticated(false); setIsLoading(false); });
    }

    return { isAuthenticated, isLoading, logout };
  }

  function useConnectionState(client) {
    const [state, setState] = signal('connecting');

    const interval = setInterval(() => {
      const cs = client.connectionState();
      if (cs !== state.peek()) setState(cs);
    }, 500);

    // If we're in an effect context, clean up on disposal
    if (_activeEffect) {
      const cleanup = () => clearInterval(interval);
      return Object.assign(state, { destroy: cleanup });
    }

    return state;
  }

  function useAI(client, actionRef) {
    const [response, setResponse] = signal(null);
    const [isLoading, setIsLoading] = signal(false);
    const [error, setError] = signal(undefined);
    const [history, setHistory] = signal([]);

    async function send(args) {
      batch(() => { setIsLoading(true); setError(undefined); });
      try {
        const result = await client.action(actionRef, args || {});
        batch(() => {
          setResponse(result);
          setHistory(h => [...h, { args: args || {}, result, ts: Date.now() }]);
          setIsLoading(false);
        });
        return result;
      } catch (err) {
        batch(() => { setError(err); setIsLoading(false); });
        throw err;
      }
    }

    send.response = response;
    send.isLoading = isLoading;
    send.error = error;
    send.history = history;
    send.clear = () => batch(() => { setResponse(null); setHistory([]); setError(undefined); });

    return send;
  }

  // ─── PUBLIC API ───────────────────────────────────────
  return {
    // Reactivity
    signal, computed, effect, batch, memo,
    // References
    ref,
    // Context & State
    createContext, createStore,
    // Components
    component, h,
    // Rendering
    list, when, show, match, template,
    // Portals & Boundaries
    portal, errorBoundary, suspense, lazy,
    // Routing
    createRouter, link,
    // Lifecycle
    onMount, onUnmount,
    // Animation
    transition,
    // Events
    bus,
    // Forms
    createForm,
    // Async
    useAsync,
    // Toast
    toast,
    // Error
    onError,
    // App
    mount,
    // Convex (optional)
    createClient, useQuery, useMutation, useAction, useAuth, useConnectionState, useAI,
  };
})();

// Make available globally
if (typeof window !== 'undefined') window.Novoid = Novoid;
