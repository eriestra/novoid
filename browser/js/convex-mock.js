// ═══════════════════════════════════════════════════════════
// Headless Convex Client — functional stub for novoid-browser
//
// Provides window.convex.ConvexClient that:
//  1. Accepts seeded query data and delivers it through useQuery
//  2. Records all mutations/actions invoked by the app
//  3. Supports pushing new query data after init (simulates live updates)
//  4. Exposes __convex_headless for observer introspection and control
// ═══════════════════════════════════════════════════════════

(function() {
  "use strict";

  if (typeof globalThis.convex !== 'undefined') return;

  // ── Seeded data store ─────────────────────────────────────
  // Populated before app runs via __convex_headless.seed(ref, data)
  var _seeds = {};          // ref → value
  var _subscriptions = [];  // { ref, args, callback, onError }
  var _mutations = [];      // { ref, args, result }
  var _actions = [];        // { ref, args, result }

  // ── ConvexClient ──────────────────────────────────────────
  function ConvexClient(url) {
    this._url = url;
  }

  ConvexClient.prototype.onUpdate = function(query, args, callback, onError) {
    var sub = { ref: query, args: args, callback: callback, onError: onError };
    _subscriptions.push(sub);

    // Deliver seeded data if available, otherwise deliver undefined
    // (matches real Convex behavior: first callback is undefined while loading,
    //  then the actual data arrives)
    var seeded = _seeds.hasOwnProperty(query) ? _seeds[query] : undefined;
    setTimeout(function() { callback(seeded); }, 0);

    // Return unsubscribe function
    return function() {
      var idx = _subscriptions.indexOf(sub);
      if (idx >= 0) _subscriptions.splice(idx, 1);
    };
  };

  ConvexClient.prototype.mutation = function(ref, args) {
    var entry = { ref: ref, args: args || {}, result: null };
    _mutations.push(entry);
    // Check if there's a seeded result for this mutation
    var result = _seeds.hasOwnProperty("mutation:" + ref) ? _seeds["mutation:" + ref] : null;
    entry.result = result;
    return Promise.resolve(result);
  };

  ConvexClient.prototype.action = function(ref, args) {
    var entry = { ref: ref, args: args || {}, result: null };
    _actions.push(entry);
    var result = _seeds.hasOwnProperty("action:" + ref) ? _seeds["action:" + ref] : null;
    entry.result = result;
    return Promise.resolve(result);
  };

  ConvexClient.prototype.setAuth = function(fn) {};

  ConvexClient.prototype.connectionState = function() {
    return { isConnected: true, hasInflightRequests: false };
  };

  // ── Headless control API ──────────────────────────────────
  globalThis.__convex_headless = {
    // Seed query data before or after app init
    seed: function(ref, data) {
      _seeds[ref] = data;
    },

    // Seed a mutation result
    seedMutation: function(ref, result) {
      _seeds["mutation:" + ref] = result;
    },

    // Seed an action result
    seedAction: function(ref, result) {
      _seeds["action:" + ref] = result;
    },

    // Push updated data to all active subscriptions matching a query ref
    // This triggers the real reactive pipeline: callback → setData → effects → DOM
    push: function(ref, data) {
      _seeds[ref] = data;
      for (var i = 0; i < _subscriptions.length; i++) {
        if (_subscriptions[i].ref === ref) {
          _subscriptions[i].callback(data);
        }
      }
    },

    // Push an error to subscriptions matching a query ref
    pushError: function(ref, errorMsg) {
      for (var i = 0; i < _subscriptions.length; i++) {
        if (_subscriptions[i].ref === ref && _subscriptions[i].onError) {
          _subscriptions[i].onError(new Error(errorMsg));
        }
      }
    },

    // Introspection
    getSubscriptions: function() {
      return _subscriptions.map(function(s) { return { ref: s.ref, args: s.args }; });
    },
    getMutations: function() { return _mutations; },
    getActions: function() { return _actions; },
    getSeeds: function() { return Object.keys(_seeds); },

    // Summary for observer integration
    getAll: function() {
      return JSON.stringify({
        subscriptions: this.getSubscriptions(),
        mutations: _mutations.map(function(m) { return { ref: m.ref, args: m.args }; }),
        actions: _actions.map(function(a) { return { ref: a.ref, args: a.args }; }),
        seeds: Object.keys(_seeds),
      });
    },
  };

  var mock = { ConvexClient: ConvexClient };
  globalThis.convex = mock;
  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.convex = mock;
  }
})();
