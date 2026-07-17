// ═══════════════════════════════════════════════════════════
// Novoid Observer — Instrument framework internals before app runs
// Injected after core.js, before app script
// ═══════════════════════════════════════════════════════════

(function() {
  "use strict";

  if (typeof Novoid === 'undefined') {
    globalThis.__novoid_observed = { error: 'Novoid not found' };
    return;
  }

  const _signals = [];
  const _stores = [];
  const _components = [];
  const _routes = [];
  const _forms = [];
  const _errors = [];
  const _queries = [];
  const _mutations = [];
  const _actions = [];

  // ─── Patch signal() ────────────────────────────────────
  const _origSignal = Novoid.signal;
  Novoid.signal = function(init, name) {
    const [get, set] = _origSignal(init, name);
    const entry = {
      id: _signals.length,
      initialValue: init,
      getter: get,
      setter: set,
      name: name || get.signalName || null,
    };
    _signals.push(entry);
    return [get, set];
  };

  // ─── Patch createStore() ───────────────────────────────
  const _origCreateStore = Novoid.createStore;
  Novoid.createStore = function(initialState, actions) {
    const store = _origCreateStore(initialState, actions);
    _stores.push({
      id: _stores.length,
      initialState: initialState,
      actionNames: actions ? Object.keys(actions) : [],
      store: store,
    });
    return store;
  };

  // ─── Patch component() ─────────────────────────────────
  const _origComponent = Novoid.component;
  Novoid.component = function(name, renderFn) {
    _components.push(name);
    return _origComponent(name, renderFn);
  };

  // ─── Patch createForm() ────────────────────────────────
  const _origCreateForm = Novoid.createForm;
  if (_origCreateForm) {
    Novoid.createForm = function(schema) {
      const form = _origCreateForm(schema);
      _forms.push({
        id: _forms.length,
        fields: Object.keys(schema),
        schema: schema,
        form: form,
      });
      return form;
    };
  }

  // ─── Patch onError() ───────────────────────────────────
  const _origOnError = Novoid.onError;
  Novoid.onError = function(handler) {
    _origOnError(function(error, componentName) {
      _errors.push({ message: error?.message || String(error), component: componentName });
      handler(error, componentName);
    });
  };

  // ─── Patch Convex helpers (if convex plugin loaded) ────
  const _origCreateClient = Novoid.createClient;
  if (_origCreateClient) {
    Novoid.createClient = function(url) {
      var client = _origCreateClient(url);
      return client;
    };
  }
  const _origUseQuery = Novoid.useQuery;
  if (_origUseQuery) {
    Novoid.useQuery = function(client, ref, args) {
      _queries.push({ ref: ref, args: args });
      return _origUseQuery(client, ref, args);
    };
  }
  const _origUseMutation = Novoid.useMutation;
  if (_origUseMutation) {
    Novoid.useMutation = function(client, ref) {
      _mutations.push({ ref: ref });
      return _origUseMutation(client, ref);
    };
  }
  const _origUseAction = Novoid.useAction;
  if (_origUseAction) {
    Novoid.useAction = function(client, ref) {
      _actions.push({ ref: ref });
      return _origUseAction(client, ref);
    };
  }

  // ─── Patch createRouter() (if plugin loaded) ──────────
  const _origCreateRouter = Novoid.createRouter;
  if (_origCreateRouter) {
    Novoid.createRouter = function(routes, container) {
      for (const r of routes) {
        _routes.push({ path: r.path, hasGuard: !!r.guard });
      }
      return _origCreateRouter(routes, container);
    };
  }

  // ─── Introspection API ─────────────────────────────────
  globalThis.__novoid_observed = {
    getSignals() {
      return _signals.map(s => ({
        id: s.id,
        value: s.getter.peek ? s.getter.peek() : s.getter(),
        initialValue: s.initialValue,
        name: s.name,
      }));
    },
    getStores() {
      return _stores.map(s => ({
        id: s.id,
        state: s.store.get.peek ? s.store.get.peek() : s.store.get(),
        actions: s.actionNames,
        initialState: s.initialState,
      }));
    },
    getComponents() { return _components; },
    getRoutes() { return _routes; },
    getForms() {
      return _forms.map(f => ({
        id: f.id,
        fields: f.fields,
        values: {},
        schema: Object.fromEntries(
          Object.entries(f.schema).map(([k, v]) => [k, {
            required: !!v.required,
            type: v.pattern ? 'pattern' : v.minLength ? 'text' : 'any',
          }])
        ),
      }));
    },
    getErrors() { return _errors; },
    getQueries() { return _queries; },
    getMutations() { return _mutations; },
    getActions() { return _actions; },
    getAll() {
      return JSON.stringify({
        signals: this.getSignals(),
        stores: this.getStores(),
        components: this.getComponents(),
        routes: this.getRoutes(),
        forms: this.getForms(),
        errors: this.getErrors(),
        queries: this.getQueries(),
        mutations: this.getMutations(),
        actions: this.getActions(),
      });
    },

    // ─── Action calling ──────────────────────────────────
    callAction(storeId, actionName, args) {
      const entry = _stores[storeId];
      if (!entry) return { ok: false, error: 'store not found: ' + storeId };
      const fn = entry.store.actions[actionName];
      if (typeof fn !== 'function') return { ok: false, error: 'action not found: ' + actionName };
      try {
        fn.apply(null, args || []);
        return { ok: true, state: entry.store.get.peek ? entry.store.get.peek() : entry.store.get() };
      } catch(e) {
        return { ok: false, error: e.message || String(e) };
      }
    },

    // Find store index by action name
    findAction(actionName) {
      for (let i = 0; i < _stores.length; i++) {
        if (_stores[i].actionNames.includes(actionName)) return i;
      }
      return -1;
    },
  };
})();
