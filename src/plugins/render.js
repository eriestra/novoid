/**
 * Novoid Plugin: Render
 * Declarative UI renderer. State drives pixels.
 * Requires: core.js loaded first (window.Novoid)
 */
((N) => {
  const h = N.h, effect = N.effect, when = N.when, mount = N.mount, batch = N.batch, _disposeTree = N._disposeTree;

  // ── Expression Engine ───────────────────────────────
  // Resolves $-prefixed reactive expressions against context

  // CSP-safe expression evaluator — no new Function / eval
  function safeEval(expr, values) {
    expr = expr.trim();
    // Comparison operators
    var ops = ['===', '!==', '>=', '<=', '>', '<', '==', '!='];
    for (var i = 0; i < ops.length; i++) {
      var idx = expr.indexOf(ops[i]);
      if (idx !== -1) {
        var left = parseLiteral(expr.slice(0, idx).trim());
        var right = parseLiteral(expr.slice(idx + ops[i].length).trim());
        switch (ops[i]) {
          case '===': return left === right;
          case '!==': return left !== right;
          case '==':  return left == right;
          case '!=':  return left != right;
          case '>=':  return left >= right;
          case '<=':  return left <= right;
          case '>':   return left > right;
          case '<':   return left < right;
        }
      }
    }
    // Logical not
    if (expr[0] === '!') return !parseLiteral(expr.slice(1).trim());
    // Arithmetic: + - * /
    var m;
    if ((m = expr.match(/^(.+?)\s*(\+|\-|\*|\/|%)\s*(.+)$/))) {
      var a = parseLiteral(m[1].trim()), op = m[2], b = parseLiteral(m[3].trim());
      switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b !== 0 ? a / b : 0;
        case '%': return a % b;
      }
    }
    return parseLiteral(expr);
  }

  function parseLiteral(s) {
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null') return null;
    if (s === 'undefined') return undefined;
    if ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))
      return s.slice(1, -1);
    var n = Number(s);
    if (!isNaN(n) && s !== '') return n;
    return s;
  }

  function createResolver(store, ctx) {
    // ctx: { params, row, item, self, queries, auth }
    ctx = ctx || {};

    return function resolve(expr) {
      if (expr === undefined || expr === null) return expr;
      if (typeof expr === 'number' || typeof expr === 'boolean') return expr;
      if (typeof expr === 'function') return expr;

      if (typeof expr !== 'string') return expr;

      // Not an expression
      if (expr.indexOf('$') === -1) return expr;

      // Inline expression with multiple $refs: "$a + $b"
      if (expr[0] === '"' && expr[expr.length - 1] === '"') {
        expr = expr.slice(1, -1);
      }

      // Check if it's a pure $reference or an inline expression
      var isPure = /^\$[a-zA-Z_][a-zA-Z0-9_.]*$/.test(expr);

      if (isPure) {
        return resolvePath(expr.slice(1));
      }

      // Inline expression: replace all $refs then safe-evaluate
      var values = {};
      var resolved = expr.replace(/\$([a-zA-Z_][a-zA-Z0-9_.]*)/g, function(m, path) {
        var val = resolvePath(path);
        values[m] = val;
        return typeof val === 'string' ? '"' + val.replace(/"/g, '\\"') + '"' : String(val);
      });
      return safeEval(resolved, values);
    };

    function resolvePath(path) {
      var parts = path.split('.');

      // Context-specific: $row.x, $item.x, $self, $params.x
      if (parts[0] === 'row' && ctx.row) return dig(ctx.row, parts.slice(1));
      if (parts[0] === 'item' && ctx.item) return dig(ctx.item, parts.slice(1));
      if (parts[0] === 'self' && ctx.self !== undefined) return ctx.self;
      if (parts[0] === 'params') return dig(ctx.params || {}, parts.slice(1));
      if (parts[0] === 'auth') return dig(ctx.auth || {}, parts.slice(1));

      // Query: $q.ref or $q.ref.field
      if (parts[0] === 'q' && ctx.queries) {
        var qName = parts[1];
        var qData = ctx.queries[qName] ? ctx.queries[qName]() : null;
        if (parts.length > 2) return dig(qData, parts.slice(2));
        return qData;
      }

      // Store state
      var s = store.get();
      return dig(s, parts);
    }

    function dig(obj, parts) {
      for (var i = 0; i < parts.length; i++) {
        if (obj == null) return null;
        obj = obj[parts[i]];
      }
      return obj;
    }
  }

  // Make a reactive function from an expression
  function reactive(store, expr, ctx) {
    if (typeof expr === 'function') return expr;
    if (typeof expr !== 'string' || expr.indexOf('$') === -1) return function() { return expr; };
    var resolver = createResolver(store, ctx);
    return function() { return resolver(expr); };
  }

  // ── Formatters ──────────────────────────────────────

  var locale = 'es-MX';

  var formatters = {
    currency: function(v) {
      if (v == null) return '-';
      return '$' + Number(v).toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    },
    kwh: function(v) {
      if (v == null) return '-';
      return Number(v).toLocaleString(locale) + ' kWh';
    },
    rate: function(v) {
      if (v == null) return '-';
      return '$' + Number(v).toFixed(2) + '/kWh';
    },
    percent: function(v) {
      if (v == null) return '-';
      return Number(v) + '%';
    },
    number: function(v) {
      if (v == null) return '-';
      return Number(v).toLocaleString(locale);
    },
    date: function(v) {
      if (v == null) return '-';
      return new Date(v).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    },
    datetime: function(v) {
      if (v == null) return '-';
      return new Date(v).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    },
    timeAgo: function(v) {
      if (v == null) return '-';
      var diff = Math.floor((Date.now() - new Date(v).getTime()) / 1000);
      var es = locale.indexOf('es') === 0;
      if (es) {
        if (diff < 60) return 'hace ' + diff + 's';
        if (diff < 3600) return 'hace ' + Math.floor(diff / 60) + ' min';
        if (diff < 86400) return 'hace ' + Math.floor(diff / 3600) + 'h';
        return 'hace ' + Math.floor(diff / 86400) + 'd';
      }
      if (diff < 60) return diff + 's ago';
      if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      return Math.floor(diff / 86400) + 'd ago';
    },
    bytes: function(v) {
      if (v == null) return '-';
      var n = Number(v);
      if (n < 1024) return n + ' B';
      if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
      if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
      return (n / 1073741824).toFixed(1) + ' GB';
    },
    duration: function(v) {
      if (v == null) return '-';
      var sec = Math.abs(Number(v));
      if (sec < 60) return Math.round(sec) + 's';
      if (sec < 3600) return Math.floor(sec / 60) + 'm ' + Math.round(sec % 60) + 's';
      var h = Math.floor(sec / 3600);
      var m = Math.floor((sec % 3600) / 60);
      return h + 'h ' + m + 'm';
    }
  };

  function fmt(value, format) {
    if (!format) return value == null ? '' : String(value);
    if (formatters[format]) return formatters[format](value);
    if (typeof format === 'object' && format.template) {
      return format.template.replace('{}', value == null ? '' : String(value));
    }
    return String(value);
  }

  // ── Color Mapping ───────────────────────────────────

  var colors = {
    teal:   { bg: 'rgba(20,184,166,0.10)', fg: '#14b8a6' },
    green:  { bg: 'rgba(34,197,94,0.10)',  fg: '#22c55e' },
    blue:   { bg: 'rgba(59,130,246,0.10)', fg: '#3b82f6' },
    purple: { bg: 'rgba(168,85,247,0.10)', fg: '#a855f7' },
    red:    { bg: 'rgba(239,68,68,0.10)',  fg: '#ef4444' },
    orange: { bg: 'rgba(249,115,22,0.10)', fg: '#f97316' },
    yellow: { bg: 'rgba(234,179,8,0.10)',  fg: '#eab308' },
    gray:   { bg: 'rgba(107,114,128,0.10)', fg: '#6b7280' }
  };

  function colorStyle(name) {
    var c = colors[name] || colors.gray;
    return { background: c.bg, color: c.fg };
  }

  // Hex color support: if color starts with '#', derive bg/fg from it
  function resolveColor(name) {
    if (!name) return colors.gray;
    if (name.charAt(0) === '#') {
      return { bg: name + '1a', fg: name };
    }
    return colors[name] || colors.gray;
  }

  // Merge custom class/style onto a DOM element
  function mergeStyle(el, spec) {
    if (!spec || !el) return el;
    if (spec.class) {
      var existing = el.getAttribute('class') || '';
      el.setAttribute('class', (existing + ' ' + spec.class).trim());
    }
    if (spec.style) {
      var existing = el.getAttribute('style') || '';
      el.setAttribute('style', (existing ? existing + ';' : '') + spec.style);
    }
    return el;
  }

  // ── Action Wiring ───────────────────────────────────

  function wireAction(store, actionSpec, ctx) {
    if (!actionSpec) return function() {};
    // Simple string: store action name
    if (typeof actionSpec === 'string') {
      return function() { store.actions[actionSpec](); };
    }
    // Object with action key
    if (actionSpec.action && store.actions[actionSpec.action]) {
      return function(extraArgs) {
        var resolver = createResolver(store, ctx);
        var args = {};
        if (actionSpec.args) {
          for (var k in actionSpec.args) {
            args[k] = resolver(actionSpec.args[k]);
          }
        }
        if (extraArgs) {
          for (var k in extraArgs) args[k] = extraArgs[k];
        }
        store.actions[actionSpec.action](args);
      };
    }
    // Navigate
    if (actionSpec.navigate) {
      return function() {
        var resolver = createResolver(store, ctx);
        var params = {};
        if (actionSpec.params) {
          for (var k in actionSpec.params) {
            params[k] = resolver(actionSpec.params[k]);
          }
        }
        if (store.actions.__navigate) {
          store.actions.__navigate({ view: actionSpec.navigate, params: params });
        }
      };
    }
    return function() {};
  }

  // ── Section Renderers ───────────────────────────────

  function renderStat(spec, store, ctx) {
    var size = spec.size || 'md';
    var fontSize = { sm: '2rem', md: '3rem', lg: '4rem' }[size] || '3rem';
    var c = resolveColor(spec.color);

    var el = h('div', {
      class: 'nv-card nv-p-8',
      style: 'text-align:center'
    },
      h('div', {
        style: function() {
          return 'font-size:' + fontSize + ';font-weight:700;color:' + c.fg + ';font-family:Outfit,sans-serif';
        }
      }, function() {
        var val = reactive(store, spec.value, ctx)();
        return fmt(val, spec.format);
      }),
      spec.label ? h('div', {
        style: 'margin-top:0.5rem;color:var(--nv-text-muted);font-size:1rem'
      }, spec.label) : null
    );
    return mergeStyle(el, spec);
  }

  function renderMetrics(spec, store, ctx) {
    var cols = spec.columns || Math.min(spec.items.length, 4);
    var el = h('div', {
      class: 'nv-grid nv-cols-2 nv-md-cols-' + cols,
      style: 'gap:var(--nv-space-4)'
    },
      spec.items.map(function(item) {
        var c = resolveColor(item.color);
        return h('div', { class: 'nv-card nv-p-4' },
          h('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start' },
            h('div', {},
              h('div', { style: 'font-size:0.85rem;color:var(--nv-text-muted)' }, item.label),
              h('div', {
                style: 'font-size:1.5rem;font-weight:700;margin-top:0.25rem;font-family:Outfit,sans-serif'
              }, function() {
                var val = reactive(store, item.value, ctx)();
                return fmt(val, item.format);
              }),
              item.trend ? h('div', {
                style: 'font-size:0.8rem;font-weight:600;color:#22c55e;margin-top:0.25rem'
              }, function() {
                var tVal = reactive(store, item.trend.value || item.trend, ctx)();
                var tFmt = (item.trend && item.trend.format) || 'percent';
                return fmt(tVal, tFmt);
              }) : null
            ),
            h('div', {
              style: function() {
                return 'width:40px;height:40px;border-radius:var(--nv-radius-lg);display:flex;align-items:center;justify-content:center;font-size:1.1rem;background:' + c.bg + ';color:' + c.fg;
              }
            }, item.icon || item.label.charAt(0))
          )
        );
      })
    );
    return mergeStyle(el, spec);
  }

  function renderButton(spec, store, ctx) {
    var style = spec.style || 'primary';
    var btnClass = 'nv-btn nv-btn-' + style;
    if (spec.size) btnClass += ' nv-btn-' + spec.size;
    if (spec.block) btnClass += ' nv-btn-block';

    var handler = wireAction(store, spec, ctx);

    var el = h('button', {
      class: btnClass,
      onClick: function() { handler(); }
    }, spec.label || 'Action');
    return mergeStyle(el, spec);
  }

  function renderRow(spec, store, ctx) {
    var cols = spec.columns || 2;
    var el = h('div', {
      class: 'nv-grid nv-cols-' + cols,
      style: 'gap:var(--nv-space-4)'
    },
      spec.items.map(function(item) {
        return renderSection(item, store, ctx);
      })
    );
    return mergeStyle(el, spec);
  }

  function renderTable(spec, store, ctx) {
    var children = [];
    var _tableId = '_nv_t' + (Math.random() * 1e6 | 0);
    var _editable = !!spec.editable;

    // Pagination local state
    var _pageSig = spec.pageSize ? N.signal(0) : null;
    var _pageGet = _pageSig ? _pageSig[0] : null;
    var _pageSet = _pageSig ? _pageSig[1] : null;
    var _prevLen = { v: 0 };

    // Apply sort.default on mount
    if (spec.sort && spec.sort.default && spec.sort.action) {
      var _sortKey = spec.sort.bind || ('$' + (spec.sort.key || 'sort').replace(/^\$/, ''));
      var _sortCur = reactive(store, _sortKey, ctx)();
      if (!_sortCur || !_sortCur.key) {
        wireAction(store, { action: spec.sort.action, args: {} }, ctx)(spec.sort.default);
      }
    }

    // Editable table local state (signals persist across effect rebuilds)
    var _activeCellSig = _editable ? N.signal(null) : null;
    var _activeCellGet = _activeCellSig ? _activeCellSig[0] : null;
    var _activeCellSet = _activeCellSig ? _activeCellSig[1] : null;
    var _editingSig = _editable ? N.signal(null) : null;
    var _editingGet = _editingSig ? _editingSig[0] : null;
    var _editingSet = _editingSig ? _editingSig[1] : null;
    var _editVal = { v: '' };
    var _editingColSig = _editable ? N.signal(null) : null; // colId being renamed
    var _editingColGet = _editingColSig ? _editingColSig[0] : null;
    var _editingColSet = _editingColSig ? _editingColSig[1] : null;
    var _editColVal = { v: '' };
    var _colMenuSig = _editable ? N.signal(null) : null;
    var _colMenuGet = _colMenuSig ? _colMenuSig[0] : null;
    var _colMenuSet = _colMenuSig ? _colMenuSig[1] : null;

    // Header with title and optional filter
    var headerItems = [];
    if (spec.title) {
      headerItems.push(h('h3', { style: 'font-size:1.1rem;font-weight:600' }, spec.title));
    }
    if (spec.filter) {
      var filterBtns = spec.filter.options.map(function(opt) {
        return h('button', {
          class: function() {
            var current = reactive(store, '$' + spec.filter.key.replace(/^\$/, ''), ctx)();
            return 'nv-btn nv-btn-sm ' + (current === opt.value ? 'nv-btn-primary' : 'nv-btn-ghost');
          },
          onClick: wireAction(store, { action: spec.filter.action, args: { value: opt.value } }, ctx)
        }, opt.label);
      });
      headerItems.push(h('div', { style: 'display:flex;gap:0.5rem;flex-wrap:wrap' }, filterBtns));
    }
    if (headerItems.length) {
      children.push(h('div', {
        style: 'display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;padding:1rem 1.25rem;border-bottom:1px solid var(--nv-border)'
      }, headerItems));
    }

    // hideBelow style injection (only for static columns)
    if (!_editable) {
      var _hideStyles = [];
      spec.columns.forEach(function(col, i) {
        if (col.hideBelow) {
          var bp = col.hideBelow === 'md' ? 768 : 1024;
          var cls = _tableId + '_c' + i;
          _hideStyles.push('@media(max-width:' + bp + 'px){.' + cls + '{display:none}}');
          col._hideClass = cls;
        }
      });
      if (_hideStyles.length) {
        var styleEl = document.createElement('style');
        styleEl.textContent = _hideStyles.join('');
        children.push(styleEl);
      }
    }

    // Table content
    var tableEl = h('div', { style: 'overflow-x:auto' + (_editable ? ';overflow-y:auto;max-height:' + (spec.maxHeight || '80vh') + ';outline:none' : '') });
    if (_editable) tableEl.setAttribute('tabindex', '0');
    children.push(tableEl);

    // Add row footer (editable)
    var addRowEl = null;
    if (_editable && spec.row && spec.row.add) {
      addRowEl = h('div', {
        style: 'padding:0.5rem 1rem;cursor:pointer;color:var(--nv-text-muted);font-size:0.85rem;border-top:1px solid var(--nv-border);transition:background 0.15s',
        onMouseEnter: function(e) { e.currentTarget.style.background = 'var(--nv-bg-subtle)'; },
        onMouseLeave: function(e) { e.currentTarget.style.background = ''; },
        onClick: function() { wireAction(store, spec.row.add, ctx)(); }
      }, '+ New row');
      children.push(addRowEl);
    }

    // Pagination footer
    var pagerEl = null;
    if (_pageGet) {
      pagerEl = h('div', { style: 'display:flex;justify-content:center;align-items:center;gap:0.75rem;padding:0.75rem 1rem;font-size:0.8rem;color:var(--nv-text-muted)' });
      children.push(pagerEl);
    }

    // Keyboard handler for editable tables
    if (_editable) {
      tableEl.addEventListener('keydown', function(e) {
        var ac = _activeCellGet();
        var ed = _editingGet();

        if (ed) {
          if (e.key === 'Escape') {
            e.preventDefault();
            _editingSet(null);
            tableEl.focus();
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            // Commit handled by input blur — just blur
            var inp = tableEl.querySelector('input[data-nv-editor],select[data-nv-editor]');
            if (inp) inp.blur();
            return;
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            var inp = tableEl.querySelector('input[data-nv-editor],select[data-nv-editor]');
            if (inp) inp.blur();
            // Move active cell
            var cols = _lastCols || [];
            var rows = _lastRows || [];
            if (ac) {
              var ni = ac.colIdx + (e.shiftKey ? -1 : 1);
              if (ni >= 0 && ni < cols.length) {
                _activeCellSet({ rowId: ac.rowId, colIdx: ni });
              }
            }
            return;
          }
          return; // Don't intercept other keys while editing
        }

        if (!ac) return;

        var cols = _lastCols || [];
        var rows = _lastRows || [];
        var rowIds = rows.map(function(r) { return r.id; });
        var ri = rowIds.indexOf(ac.rowId);

        if (e.key === 'ArrowUp') { e.preventDefault(); if (ri > 0) _activeCellSet({ rowId: rowIds[ri - 1], colIdx: ac.colIdx }); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); if (ri < rowIds.length - 1) _activeCellSet({ rowId: rowIds[ri + 1], colIdx: ac.colIdx }); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); if (ac.colIdx > 0) _activeCellSet({ rowId: ac.rowId, colIdx: ac.colIdx - 1 }); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); if (ac.colIdx < cols.length - 1) _activeCellSet({ rowId: ac.rowId, colIdx: ac.colIdx + 1 }); }
        else if (e.key === 'Enter') {
          e.preventDefault();
          var col = cols[ac.colIdx];
          if (col && col.type !== 'checkbox') {
            var row = rows[ri];
            _editVal.v = (row ? String(row[col.id] == null ? '' : row[col.id]) : '');
            _editingSet({ rowId: ac.rowId, colIdx: ac.colIdx, initChar: null });
          }
        }
        else if (e.key === 'Escape') { e.preventDefault(); _activeCellSet(null); }
        else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          var col = cols[ac.colIdx];
          if (col && spec.cell && spec.cell.action) {
            wireAction(store, { action: spec.cell.action, args: {} }, ctx)({ rowId: ac.rowId, colId: col.id, value: col.type === 'checkbox' ? false : '' });
          }
        }
        else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          var col = cols[ac.colIdx];
          if (col && col.type !== 'checkbox') {
            _editVal.v = (e.key);
            _editingSet({ rowId: ac.rowId, colIdx: ac.colIdx, initChar: e.key });
          }
        }
      });
    }

    // Stash last resolved cols/rows for keyboard handler
    var _lastCols = null;
    var _lastRows = null;

    // Use effect to rebuild table body reactively
    var _tableDispose = effect(function() {
      var rawRows = reactive(store, spec.source, ctx)();

      // Resolve columns reactively for editable tables
      var cols;
      if (_editable && spec.columns && typeof spec.columns === 'string' && spec.columns.indexOf('$') !== -1) {
        cols = reactive(store, spec.columns, ctx)();
        if (!Array.isArray(cols)) cols = [];
      } else if (Array.isArray(spec.columns)) {
        cols = spec.columns;
      } else {
        cols = [];
      }

      // Read editing signals inside effect to trigger rebuild on change
      var activeCell = _activeCellGet ? _activeCellGet() : null;
      var editing = _editingGet ? _editingGet() : null;
      var editingCol = _editingColGet ? _editingColGet() : null;
      var colMenu = _colMenuGet ? _colMenuGet() : null;
      // Stash for keyboard handler
      _lastCols = cols;

      // Toggle overflow so nv-dropdown-menu escapes the scroll container
      if (_editable) {
        if (colMenu) {
          tableEl.style.overflowX = 'visible';
          tableEl.style.overflowY = 'visible';
          if (tableEl.parentNode) tableEl.parentNode.style.overflow = 'visible';
        } else {
          tableEl.style.overflowX = 'auto';
          tableEl.style.overflowY = 'auto';
          if (tableEl.parentNode) tableEl.parentNode.style.overflow = 'hidden';
        }
      }

      // Dispose child trees before clearing
      while (tableEl.firstChild) { _disposeTree(tableEl.firstChild); tableEl.removeChild(tableEl.firstChild); }

      // Loading states
      if (rawRows == null && spec.loading) {
        var loadCount = spec.pageSize || 5;
        if (spec.loading === 'spinner') {
          tableEl.appendChild(h('div', { style: 'display:flex;justify-content:center;align-items:center;padding:3rem' },
            h('div', { style: 'width:24px;height:24px;border:2px solid var(--nv-border);border-top-color:var(--nv-primary);border-radius:50%;animation:nv-spin 0.6s linear infinite' })
          ));
        } else {
          var skelRows = [];
          for (var si = 0; si < loadCount; si++) {
            var skelCells = cols.map(function() {
              return h('td', { style: 'padding:0.6rem 1rem' },
                h('div', { style: 'height:0.85rem;border-radius:4px;background:var(--nv-bg-subtle);animation:nv-pulse 1.5s ease-in-out infinite' })
              );
            });
            skelRows.push(h('tr', { style: 'border-bottom:1px solid var(--nv-border)' }, skelCells));
          }
          tableEl.appendChild(h('table', { style: 'width:100%;border-collapse:collapse' }, h('tbody', {}, skelRows)));
        }
        return;
      }

      var rows = Array.isArray(rawRows) ? rawRows : [];
      _lastRows = rows;

      // Reset page on data length change
      if (_pageGet && rows.length !== _prevLen.v) {
        _prevLen.v = rows.length;
        _pageSet(0);
      }

      if (rows.length === 0 && spec.empty) {
        tableEl.appendChild(
          h('div', { style: 'padding:2rem;text-align:center;color:var(--nv-text-muted)' }, spec.empty)
        );
        if (pagerEl) while (pagerEl.firstChild) pagerEl.removeChild(pagerEl.firstChild);
        return;
      }

      // Pagination slice
      var totalPages = 1;
      var displayRows = rows;
      if (_pageGet && spec.pageSize) {
        totalPages = Math.max(1, Math.ceil(rows.length / spec.pageSize));
        var p = _pageGet();
        if (p >= totalPages) { p = totalPages - 1; _pageSet(p); }
        displayRows = rows.slice(p * spec.pageSize, (p + 1) * spec.pageSize);
      }

      // Header row
      var headerCells = [];

      // Row number header (editable)
      if (_editable) {
        headerCells.push(h('th', {
          style: 'padding:0.6rem 0.5rem;text-align:center;font-size:0.7rem;color:var(--nv-text-muted);font-weight:600;width:40px;position:sticky;left:0;z-index:1;background:var(--nv-bg);border-right:1px solid var(--nv-border)'
        }, '#'));
      }

      headerCells = headerCells.concat(cols.map(function(col, ci) {
        var colKey = _editable ? col.id : col.key;
        var colLabel = _editable ? col.name : col.label;
        var thStyle = 'padding:0.6rem 1rem;text-align:left;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--nv-text-muted);font-weight:600;';
        if (_editable && col.width) thStyle += 'width:' + col.width + 'px;min-width:' + col.width + 'px;';
        if (_editable) thStyle += 'position:relative;';
        var thClass = col._hideClass || '';
        var thContent = [];

        // Column header: inline rename editor or label + remove button
        if (_editable && editingCol === col.id && spec.column && spec.column.update) {
          var _colEscaped = { v: false };
          var colInp = h('input', {
            type: 'text',
            'data-nv-col-editor': '1',
            class: 'nv-input nv-input-sm',
            style: 'width:100%;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;font-weight:600',
            value: _editColVal.v,
            onBlur: (function(cId) {
              return function(e) {
                if (_colEscaped.v) return;
                var v = e.target.value.trim();
                if (v && v !== colLabel) {
                  wireAction(store, { action: spec.column.update, args: {} }, ctx)({ colId: cId, name: v });
                }
                _editingColSet(null);
              };
            })(col.id),
            onKeyDown: function(e) {
              if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
              if (e.key === 'Escape') { e.preventDefault(); _colEscaped.v = true; _editingColSet(null); tableEl.focus(); }
              e.stopPropagation();
            }
          });
          thContent.push(colInp);
          setTimeout(function() { colInp.focus(); colInp.select(); }, 0);
        } else {
          var labelSpan = h('span', {}, colLabel);
          thContent.push(labelSpan);

          // Column remove button (when no menu)
          if (_editable && spec.column && spec.column.remove && !(spec.column && spec.column.menu)) {
            var removeColBtn = h('span', {
              style: 'margin-left:4px;cursor:pointer;font-size:0.65rem;opacity:0.4;transition:opacity 0.15s,color 0.15s',
              onMouseEnter: function(e) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ef4444'; },
              onMouseLeave: function(e) { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = ''; },
              onClick: (function(cId) {
                return function(e) {
                  e.stopPropagation();
                  wireAction(store, { action: spec.column.remove, args: {} }, ctx)({ colId: cId });
                };
              })(col.id)
            }, '\u00d7');
            thContent.push(removeColBtn);
          }

          // Column context menu (nv-dropdown pattern)
          if (_editable && spec.column && spec.column.menu) {
            var _menuOpen = _colMenuGet() === col.id;
            var _menuTrigger = h('span', {
              style: 'cursor:pointer;font-size:0.6rem;width:1.25rem;height:1.25rem;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--nv-radius-sm);opacity:0.35;transition:opacity 0.15s,background 0.15s,color 0.15s',
              'data-nv-col-menu-btn': '1',
              onClick: (function(cId) {
                return function(e) {
                  e.stopPropagation();
                  _colMenuSet(_colMenuGet() === cId ? null : cId);
                };
              })(col.id),
              onMouseEnter: function(e) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--nv-bg-muted)'; },
              onMouseLeave: function(e) { if (!_menuOpen) e.currentTarget.style.opacity = '0.35'; e.currentTarget.style.background = ''; }
            }, '\u25be');
            if (_menuOpen) _menuTrigger.style.opacity = '1';

            var ddChildren = [_menuTrigger];

            // Only build menu DOM when open
            if (_menuOpen) {
              var menuItemEls = [];
              var _colType = col.type || 'text';
              var _menuItem = function(label, icon, onClick, opts) {
                opts = opts || {};
                var children = [];
                if (icon) children.push(h('span', { style: 'width:1.25rem;display:inline-block;text-align:center;flex-shrink:0' }, icon));
                children.push(h('span', {}, label));
                return h('div', {
                  class: 'nv-dropdown-item',
                  style: 'display:flex;align-items:center;gap:0.375rem;white-space:nowrap' + (opts.danger ? ';color:var(--nv-danger)' : '') + (opts.muted ? ';color:var(--nv-text-muted);font-size:0.75rem;pointer-events:none' : '') + (opts.indent ? ';padding-left:2rem' : '') + (opts.active ? ';background:var(--nv-bg-muted)' : ''),
                  onClick: opts.muted ? null : onClick
                }, children);
              };

              // Sort items
              if (spec.sort) {
                menuItemEls.push(_menuItem('Sort ascending', '\u2191', (function(ck) { return function() {
                  wireAction(store, { action: spec.sort.action, args: {} }, ctx)({ key: ck, dir: 'asc' });
                  _colMenuSet(null);
                }; })(colKey)));
                menuItemEls.push(_menuItem('Sort descending', '\u2193', (function(ck) { return function() {
                  wireAction(store, { action: spec.sort.action, args: {} }, ctx)({ key: ck, dir: 'desc' });
                  _colMenuSet(null);
                }; })(colKey)));
                menuItemEls.push(h('div', { class: 'nv-dropdown-divider' }));
              }

              // Rename
              if (spec.column.update) {
                menuItemEls.push(_menuItem('Rename column', '\u270e', (function(cId, cName) { return function() {
                  _colMenuSet(null);
                  _editColVal.v = cName || '';
                  _editingColSet(cId);
                }; })(col.id, colLabel)));
              }

              // Change type
              if (spec.column.update) {
                menuItemEls.push(h('div', { class: 'nv-dropdown-divider' }));
                menuItemEls.push(_menuItem('Type', '', null, { muted: true }));
                var _typeMap = { text: 'Aa', number: '#', date: '\ud83d\udcc5', select: '\u25bd', checkbox: '\u2611' };
                var typeOptions = ['text', 'number', 'date', 'select', 'checkbox'];
                typeOptions.forEach(function(tp) {
                  menuItemEls.push(_menuItem(tp.charAt(0).toUpperCase() + tp.slice(1), _typeMap[tp] || '', (function(cId, t) { return function() {
                    wireAction(store, { action: spec.column.update, args: {} }, ctx)({ colId: cId, type: t });
                    _colMenuSet(null);
                  }; })(col.id, tp), { indent: true, active: _colType === tp }));
                });
              }

              // Select options management
              if (spec.column.update && _colType === 'select') {
                var _colOpts = col.options || [];
                menuItemEls.push(h('div', { class: 'nv-dropdown-divider' }));
                menuItemEls.push(_menuItem('Options', '', null, { muted: true }));
                var _defaultColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
                _colOpts.forEach(function(opt, oi) {
                  var optRow = h('div', {
                    class: 'nv-dropdown-item',
                    style: 'display:flex;align-items:center;gap:0.375rem;padding-left:2rem'
                  }, [
                    h('input', {
                      type: 'color',
                      value: opt.color || _defaultColors[oi % _defaultColors.length],
                      style: 'width:1.25rem;height:1.25rem;border:none;padding:0;background:none;cursor:pointer;flex-shrink:0',
                      onChange: (function(cId, opts, idx) { return function(e) {
                        var updated = opts.map(function(o, i) {
                          if (i !== idx) return o;
                          var copy = {}; for (var k in o) copy[k] = o[k]; copy.color = e.target.value; return copy;
                        });
                        wireAction(store, { action: spec.column.update, args: {} }, ctx)({ colId: cId, options: updated });
                      }; })(col.id, _colOpts, oi)
                    }),
                    h('span', { style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis' }, opt.value),
                    h('span', {
                      style: 'cursor:pointer;opacity:0.4;font-size:0.75rem;flex-shrink:0',
                      onClick: (function(cId, opts, idx) { return function() {
                        var updated = opts.filter(function(_, i) { return i !== idx; });
                        wireAction(store, { action: spec.column.update, args: {} }, ctx)({ colId: cId, options: updated });
                      }; })(col.id, _colOpts, oi),
                      onMouseEnter: function(e) { e.currentTarget.style.opacity = '1'; },
                      onMouseLeave: function(e) { e.currentTarget.style.opacity = '0.4'; }
                    }, '\u00d7')
                  ]);
                  menuItemEls.push(optRow);
                });
                // Add option input
                var _addOptInput = h('input', {
                  type: 'text',
                  class: 'nv-input nv-input-sm',
                  placeholder: 'Add option\u2026',
                  style: 'flex:1;min-width:0;font-size:0.75rem',
                  onKeyDown: (function(cId, opts) { return function(e) {
                    if (e.key === 'Enter' && e.target.value.trim()) {
                      e.preventDefault();
                      e.stopPropagation();
                      var newVal = e.target.value.trim();
                      var updated = opts.concat([{ value: newVal, color: _defaultColors[opts.length % _defaultColors.length] }]);
                      wireAction(store, { action: spec.column.update, args: {} }, ctx)({ colId: cId, options: updated });
                      e.target.value = '';
                    }
                  }; })(col.id, _colOpts)
                });
                menuItemEls.push(h('div', {
                  class: 'nv-dropdown-item',
                  style: 'display:flex;align-items:center;gap:0.375rem;padding-left:2rem'
                }, [_addOptInput]));
              }

              // Remove
              if (spec.column.remove) {
                menuItemEls.push(h('div', { class: 'nv-dropdown-divider' }));
                menuItemEls.push(_menuItem('Remove column', '\u2212', (function(cId) { return function() {
                  wireAction(store, { action: spec.column.remove, args: {} }, ctx)({ colId: cId });
                  _colMenuSet(null);
                }; })(col.id), { danger: true }));
              }

              ddChildren.push(h('div', {
                class: 'nv-dropdown-menu',
                style: 'text-transform:none;letter-spacing:normal;font-weight:normal;font-size:0.8125rem;min-width:11rem'
              }, menuItemEls));

              // Close on outside click / Escape
              var _ddWrapRef = { el: null };
              var _closeCol = function() { _colMenuSet(null); };
              var _onDocDown = function(ev) {
                if (_ddWrapRef.el && !_ddWrapRef.el.contains(ev.target)) {
                  document.removeEventListener('mousedown', _onDocDown);
                  document.removeEventListener('keydown', _onDocEsc);
                  _closeCol();
                }
              };
              var _onDocEsc = function(ev) {
                if (ev.key === 'Escape') {
                  document.removeEventListener('mousedown', _onDocDown);
                  document.removeEventListener('keydown', _onDocEsc);
                  _closeCol();
                }
              };
              setTimeout(function() {
                document.addEventListener('mousedown', _onDocDown);
                document.addEventListener('keydown', _onDocEsc);
              }, 0);
            }

            var ddWrap = h('div', {
              class: 'nv-dropdown' + (_menuOpen ? ' nv-active' : ''),
              style: 'display:inline-block;vertical-align:middle;margin-left:0.25rem'
            }, ddChildren);
            if (_menuOpen && _ddWrapRef) _ddWrapRef.el = ddWrap;
            thContent.push(ddWrap);
          }
        }

        if (spec.sort) {
          thStyle += 'cursor:pointer;user-select:none;';
          var sortGetter = reactive(store, spec.sort.bind || ('$' + (spec.sort.key || 'sort').replace(/^\$/, '')), ctx);
          var sortVal = sortGetter();
          if (sortVal && sortVal.key === colKey) {
            thContent.push(h('span', { style: 'margin-left:4px' }, sortVal.dir === 'asc' ? '\u2191' : '\u2193'));
          }
        }

        // Column resize handle
        if (_editable && spec.column && spec.column.resize) {
          var resizeHandle = h('div', {
            style: 'position:absolute;right:0;top:0;bottom:0;width:4px;cursor:col-resize;z-index:2;transition:background 0.15s',
            onMouseEnter: function(e) { e.currentTarget.style.background = 'var(--nv-primary)'; },
            onMouseLeave: function(e) { e.currentTarget.style.background = ''; },
            onMouseDown: (function(colId, startWidth) {
              return function(e) {
                e.preventDefault();
                e.stopPropagation();
                var startX = e.clientX;
                var w = startWidth || 120;
                var th = e.currentTarget.parentElement;
                var colIndex = Array.prototype.indexOf.call(th.parentElement.children, th);
                var tbl = th.closest('table');
                var onMove = function(me) {
                  w = Math.max(60, startWidth + (me.clientX - startX));
                  // Live visual feedback
                  if (th) { th.style.width = w + 'px'; th.style.minWidth = w + 'px'; }
                  if (tbl) {
                    var bodyRows = tbl.querySelectorAll('tbody tr');
                    for (var bi = 0; bi < bodyRows.length; bi++) {
                      var cell = bodyRows[bi].children[colIndex];
                      if (cell) { cell.style.width = w + 'px'; cell.style.minWidth = w + 'px'; }
                    }
                  }
                };
                var onUp = function() {
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                  document.body.style.cursor = '';
                  wireAction(store, { action: spec.column.resize, args: {} }, ctx)({ colId: colId, width: w });
                };
                document.body.style.cursor = 'col-resize';
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              };
            })(col.id, col.width || 120)
          });
          thContent.push(resizeHandle);
        }

        var thEl = h('th', {
          style: thStyle,
          class: thClass || undefined,
          onClick: spec.sort ? (function(ck) {
            return function(e) {
              if (e.target.getAttribute('data-nv-col-editor')) return;
              var sortGetter = reactive(store, spec.sort.bind || ('$' + (spec.sort.key || 'sort').replace(/^\$/, '')), ctx);
              var cur = sortGetter();
              var newDir;
              if (!cur || cur.key !== ck) newDir = 'asc';
              else if (cur.dir === 'asc') newDir = 'desc';
              else newDir = null;
              wireAction(store, { action: spec.sort.action, args: {} }, ctx)(newDir ? { key: ck, dir: newDir } : { key: null, dir: null });
            };
          })(colKey) : null,
          onDblClick: (_editable && spec.column && spec.column.update) ? (function(cId, cName) {
            return function(e) {
              e.stopPropagation();
              _editColVal.v = cName || '';
              _editingColSet(cId);
            };
          })(col.id, colLabel) : null
        }, thContent);

        return thEl;
      }));

      // Column add header (editable)
      if (_editable && spec.column && spec.column.add) {
        headerCells.push(h('th', {
          style: 'padding:0.6rem 0.5rem;text-align:center;font-size:1rem;color:var(--nv-text-muted);cursor:pointer;width:40px;transition:color 0.15s',
          onMouseEnter: function(e) { e.currentTarget.style.color = 'var(--nv-primary)'; },
          onMouseLeave: function(e) { e.currentTarget.style.color = ''; },
          onClick: function() { wireAction(store, { action: spec.column.add, args: {} }, ctx)({ name: 'Column', type: 'text' }); }
        }, '+'));
      }

      // Remove row header placeholder
      if (_editable && spec.row && spec.row.remove) {
        headerCells.push(h('th', { style: 'width:32px' }));
      }

      var thead = h('thead', { style: _editable ? 'position:sticky;top:0;z-index:2;background:var(--nv-bg)' : '' }, h('tr', {}, headerCells));

      // Body rows
      var bodyRows = displayRows.map(function(row, rowIdx) {
        var rowCtx = {};
        for (var k in ctx) rowCtx[k] = ctx[k];
        rowCtx.row = row;

        var cells = [];

        // Row number cell (editable)
        if (_editable) {
          cells.push(h('td', {
            style: 'padding:0.4rem 0.5rem;text-align:center;font-size:0.75rem;color:var(--nv-text-muted);position:sticky;left:0;z-index:1;background:var(--nv-bg);border-right:1px solid var(--nv-border)'
          }, String(rowIdx + 1)));
        }

        cells = cells.concat(cols.map(function(col, ci) {
          var colKey = _editable ? col.id : col.key;
          var val = row[colKey];
          var cellStyle = 'padding:0.6rem 1rem;font-size:0.85rem;';
          if (_editable && col.width) cellStyle += 'width:' + col.width + 'px;min-width:' + col.width + 'px;';

          // Active cell focus ring
          if (_editable && activeCell && activeCell.rowId === row.id && activeCell.colIdx === ci) {
            cellStyle += 'outline:2px solid var(--nv-primary);outline-offset:-2px;';
          }

          if (col.color) cellStyle += 'color:' + (colors[col.color] || colors.gray).fg + ';';
          if (col.bold) cellStyle += 'font-weight:600;';

          var content = [];

          // Editable: check if this cell is being edited
          if (_editable && editing && editing.rowId === row.id && editing.colIdx === ci) {
            // Editor mode
            if (col.type === 'select') {
              var opts = (col.options || []).map(function(opt) {
                return h('option', { value: opt.value, selected: opt.value === val }, opt.value);
              });
              var sel = h('select', {
                'data-nv-editor': '1',
                class: 'nv-input nv-input-sm',
                style: 'width:100%;font-size:0.85rem',
                value: val || '',
                onBlur: (function(rId, cId) {
                  return function(e) {
                    if (spec.cell && spec.cell.action) {
                      wireAction(store, { action: spec.cell.action, args: {} }, ctx)({ rowId: rId, colId: cId, value: e.target.value });
                    }
                    _editingSet(null);
                    tableEl.focus();
                  };
                })(row.id, col.id),
                onChange: (function(rId, cId) {
                  return function(e) {
                    if (spec.cell && spec.cell.action) {
                      wireAction(store, { action: spec.cell.action, args: {} }, ctx)({ rowId: rId, colId: cId, value: e.target.value });
                    }
                    _editingSet(null);
                    tableEl.focus();
                  };
                })(row.id, col.id)
              }, opts);
              content.push(sel);
              setTimeout(function() { sel.focus(); }, 0);
            } else {
              var inputType = col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text';
              var inp = h('input', {
                type: inputType,
                'data-nv-editor': '1',
                class: 'nv-input nv-input-sm',
                style: 'width:100%;font-size:0.85rem',
                value: _editVal.v,
                onBlur: (function(rId, cId, cType) {
                  return function(e) {
                    var v = e.target.value;
                    if (cType === 'number') v = v === '' ? '' : Number(v);
                    if (spec.cell && spec.cell.action) {
                      wireAction(store, { action: spec.cell.action, args: {} }, ctx)({ rowId: rId, colId: cId, value: v });
                    }
                    _editingSet(null);
                    tableEl.focus();
                  };
                })(row.id, col.id, col.type)
              });
              content.push(inp);
              setTimeout(function() { inp.focus(); if (editing.initChar) inp.setSelectionRange(inp.value.length, inp.value.length); }, 0);
            }
          } else if (_editable && col.type === 'checkbox') {
            // Checkbox — immediate toggle
            var cb = h('input', {
              type: 'checkbox',
              style: 'cursor:pointer;accent-color:var(--nv-primary)',
              checked: !!val,
              onChange: (function(rId, cId, curVal) {
                return function() {
                  if (spec.cell && spec.cell.action) {
                    wireAction(store, { action: spec.cell.action, args: {} }, ctx)({ rowId: rId, colId: cId, value: !curVal });
                  }
                };
              })(row.id, col.id, val)
            });
            content.push(cb);
          } else if (_editable && col.type === 'select') {
            // Select display — colored badge
            if (val) {
              var optDef = (col.options || []).filter(function(o) { return o.value === val; })[0];
              var bc = optDef && optDef.color ? (colors[optDef.color] || colors.gray) : colors.gray;
              content.push(h('span', {
                style: 'display:inline-flex;align-items:center;padding:2px 10px;border-radius:9999px;font-size:0.75rem;font-weight:500;background:' + bc.bg + ';color:' + bc.fg
              }, val));
            }
          } else {
            // Standard display
            var display = fmt(val, col.format);
            if (!_editable && col.icon) {
              content.push(h('span', { style: 'margin-right:4px' }, col.icon === 'arrowDown' ? '\u2193' : col.icon === 'arrowUp' ? '\u2191' : ''));
            }
            if (!_editable && col.badge) {
              var badgeColors = { draft: colors.gray, final: colors.blue, paid: colors.green, active: colors.green, inactive: colors.red };
              var bc = badgeColors[val] || colors.gray;
              content.push(h('span', {
                style: 'display:inline-flex;align-items:center;padding:2px 10px;border-radius:9999px;font-size:0.75rem;font-weight:500;background:' + bc.bg + ';color:' + bc.fg
              }, val));
            } else if (!_editable && col.subtitle) {
              content.push(h('div', {},
                h('span', { style: 'font-weight:500' }, display),
                h('br'),
                h('span', { style: 'font-size:0.8rem;color:var(--nv-text-muted)' }, row[col.subtitle] || '')
              ));
            } else {
              content.push(h('span', {}, display));
            }
          }

          var tdEl = h('td', {
            style: cellStyle,
            class: col._hideClass || undefined,
            onClick: _editable ? (function(rId, ci2) {
              return function(e) {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
                _activeCellSet({ rowId: rId, colIdx: ci2 });
              };
            })(row.id, ci) : null,
            onDblClick: _editable ? (function(rId, ci2, colDef, curVal) {
              return function(e) {
                if (colDef.type === 'checkbox') return;
                _activeCellSet({ rowId: rId, colIdx: ci2 });
                _editVal.v = (curVal == null ? '' : String(curVal));
                _editingSet({ rowId: rId, colIdx: ci2, initChar: null });
              };
            })(row.id, ci, col, val) : null
          }, content);
          return tdEl;
        }));

        // Remove row button (editable)
        if (_editable && spec.row && spec.row.remove) {
          cells.push(h('td', { style: 'padding:0.4rem 0.25rem;text-align:center' },
            h('button', {
              style: 'border:none;background:none;cursor:pointer;color:var(--nv-text-muted);font-size:0.85rem;padding:2px 6px;border-radius:4px;transition:background 0.15s,color 0.15s',
              onMouseEnter: function(e) { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#ef4444'; },
              onMouseLeave: function(e) { e.currentTarget.style.background = ''; e.currentTarget.style.color = ''; },
              onClick: (function(rId) {
                return function() { wireAction(store, { action: spec.row.remove, args: {} }, ctx)({ rowId: rId }); };
              })(row.id)
            }, '\u00d7')
          ));
        }

        // Column add placeholder cell
        if (_editable && spec.column && spec.column.add) {
          cells.push(h('td', {}));
        }

        var trStyle = 'border-bottom:1px solid var(--nv-border);transition:background 0.15s;';
        var tr = h('tr', {
          style: trStyle + (!_editable && spec.onRowClick ? 'cursor:pointer;' : ''),
          onMouseEnter: function(e) { e.currentTarget.style.background = 'var(--nv-bg-subtle)'; },
          onMouseLeave: function(e) { e.currentTarget.style.background = ''; },
          onClick: !_editable && spec.onRowClick ? function() {
            wireAction(store, spec.onRowClick, rowCtx)();
          } : null
        }, cells);
        return tr;
      });

      var tbody = h('tbody', {}, bodyRows);
      var table = h('table', { style: 'width:100%;border-collapse:collapse' }, thead, tbody);
      tableEl.appendChild(table);

      // Update pagination footer
      if (pagerEl) {
        while (pagerEl.firstChild) pagerEl.removeChild(pagerEl.firstChild);
        if (totalPages > 1) {
          var curPage = _pageGet();
          pagerEl.appendChild(h('button', {
            class: 'nv-btn nv-btn-sm nv-btn-ghost',
            disabled: curPage === 0,
            onClick: function() { _pageSet(Math.max(0, _pageGet() - 1)); }
          }, '\u2190 Prev'));
          pagerEl.appendChild(h('span', {}, 'Page ' + (curPage + 1) + ' of ' + totalPages));
          pagerEl.appendChild(h('button', {
            class: 'nv-btn nv-btn-sm nv-btn-ghost',
            disabled: curPage >= totalPages - 1,
            onClick: function() { _pageSet(Math.min(totalPages - 1, _pageGet() + 1)); }
          }, 'Next \u2192'));
        }
      }
    });

    var _tableEl = mergeStyle(h('div', { class: 'nv-card', style: 'overflow:hidden' }, children), spec);
    return _tableEl;
  }

  function renderCards(spec, store, ctx) {
    var children = [];

    // Header
    var headerItems = [];
    if (spec.title) {
      headerItems.push(h('h3', { style: 'font-size:1.1rem;font-weight:600' }, spec.title));
    }
    if (spec.actions) {
      var btns = spec.actions.map(function(a) { return renderButton(a, store, ctx); });
      headerItems.push(h('div', { style: 'display:flex;gap:0.5rem' }, btns));
    }
    if (headerItems.length) {
      children.push(h('div', {
        style: 'display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;padding:1rem 1.25rem;border-bottom:1px solid var(--nv-border)'
      }, headerItems));
    }

    // Cards body
    var body = h('div', { style: 'padding:1rem 1.25rem;display:flex;flex-direction:column;gap:0.75rem' });
    children.push(body);

    var _cardsDispose = effect(function() {
      var items = reactive(store, spec.source, ctx)();
      if (!Array.isArray(items)) items = [];

      while (body.firstChild) { _disposeTree(body.firstChild); body.removeChild(body.firstChild); }

      if (items.length === 0 && spec.empty) {
        body.appendChild(h('div', { style: 'padding:1rem;text-align:center;color:var(--nv-text-muted)' }, spec.empty));
        return;
      }

      items.forEach(function(item) {
        var itemCtx = {};
        for (var k in ctx) itemCtx[k] = ctx[k];
        itemCtx.item = item;
        var itemResolver = createResolver(store, itemCtx);
        var tpl = spec.template;

        var isSelected = false;
        if (spec.select) {
          var boundVal = reactive(store, spec.select.bind, ctx)();
          var itemId = item[spec.select.arg || 'id'];
          isSelected = boundVal === itemId;
        }

        var cardStyle = 'padding:1rem;border-radius:var(--nv-radius-lg);background:var(--nv-bg-subtle);transition:all 0.2s;';
        if (spec.select) cardStyle += 'cursor:pointer;';
        if (isSelected) cardStyle += 'border:2px solid var(--nv-primary-500);';
        else cardStyle += 'border:2px solid transparent;';

        var cardChildren = [];

        // Title row with optional badge
        if (tpl.title || tpl.badge) {
          var titleRow = [];
          var titleContent = [];
          if (tpl.title) titleContent.push(h('span', { style: 'font-weight:500' }, itemResolver(tpl.title)));
          if (tpl.subtitle) {
            titleContent.push(h('br'));
            titleContent.push(h('span', { style: 'font-size:0.85rem;color:var(--nv-text-muted)' }, itemResolver(tpl.subtitle)));
          }
          titleRow.push(h('div', {}, titleContent));

          if (tpl.badge) {
            var badgeVal = itemResolver(tpl.badge.value);
            var badgeLabel = tpl.badge.map ? (tpl.badge.map[badgeVal] || badgeVal) : badgeVal;
            var badgeFmt = tpl.badge.format;
            if (badgeFmt) badgeLabel = fmt(badgeVal, badgeFmt);
            var bc = colors[tpl.badge.color || 'gray'] || colors.gray;
            titleRow.push(h('span', {
              style: 'display:inline-flex;align-items:center;padding:2px 10px;border-radius:9999px;font-size:0.8rem;font-weight:600;background:' + bc.bg + ';color:' + bc.fg
            }, badgeLabel));
          }

          cardChildren.push(h('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start' }, titleRow));
        }

        // Grid
        if (tpl.grid) {
          var gridCells = tpl.grid.map(function(g) {
            var val = itemResolver(g.value);
            var display = fmt(val, g.format);
            var cellColor = g.color ? (colors[g.color] || colors.gray).fg : 'inherit';
            return h('div', {},
              h('div', { style: 'font-size:0.7rem;color:var(--nv-text-muted)' }, g.label),
              h('div', { style: 'font-weight:500;font-size:0.9rem;color:' + cellColor }, display)
            );
          });
          cardChildren.push(h('div', {
            style: 'display:grid;grid-template-columns:repeat(' + tpl.grid.length + ',1fr);gap:0.75rem;margin-top:0.75rem'
          }, gridCells));
        }

        // Footer
        if (tpl.footer) {
          cardChildren.push(h('div', {
            style: 'margin-top:0.75rem;font-size:0.85rem;color:var(--nv-text-muted)'
          }, itemResolver(tpl.footer)));
        }

        // Menu (action buttons)
        if (tpl.menu && Array.isArray(tpl.menu)) {
          var menuBtns = tpl.menu.map(function(m) {
            var mArgs = {};
            if (m.args) {
              for (var mk in m.args) mArgs[mk] = itemResolver(m.args[mk]);
            }
            var mStyle = m.style || 'ghost';
            return h('button', {
              class: 'nv-btn nv-btn-sm nv-btn-' + mStyle,
              onClick: function() { if (store.actions[m.action]) store.actions[m.action](mArgs); }
            }, m.label);
          });
          cardChildren.push(h('div', {
            style: 'display:flex;gap:0.25rem;margin-top:0.5rem;flex-wrap:wrap'
          }, menuBtns));
        }

        var card = h('div', {
          style: cardStyle,
          onMouseEnter: function(e) { e.currentTarget.style.background = 'var(--nv-bg-muted)'; },
          onMouseLeave: function(e) { e.currentTarget.style.background = 'var(--nv-bg-subtle)'; },
          onClick: spec.select ? function() {
            wireAction(store, { action: spec.select.action, args: { [spec.select.arg || 'id']: item[spec.select.arg || 'id'] } }, ctx)();
          } : null
        }, cardChildren);

        body.appendChild(card);
      });
    });

    var _cardsEl = mergeStyle(h('div', { class: 'nv-card', style: 'overflow:hidden' }, children), spec);
    return _cardsEl;
  }

  function renderHeader(spec, store, ctx) {
    var items = [];

    if (spec.back && store.actions.__navigate) {
      items.push(h('button', {
        class: 'nv-btn nv-btn-ghost nv-btn-sm',
        onClick: function() { store.actions.__navigate({ view: spec.back }); },
        style: 'margin-right:0.5rem'
      }, '\u2190 Back'));
    }

    var titleBlock = [];
    if (spec.title) {
      titleBlock.push(h('h2', {
        style: 'font-size:1.4rem;font-weight:700;font-family:Outfit,sans-serif'
      }, function() { return reactive(store, spec.title, ctx)(); }));
    }
    if (spec.subtitle) {
      titleBlock.push(h('span', {
        style: 'font-size:0.9rem;color:var(--nv-text-muted);margin-left:0.5rem'
      }, function() { return reactive(store, spec.subtitle, ctx)(); }));
    }
    items.push(h('div', { style: 'display:flex;align-items:center;gap:0.5rem;flex:1' }, titleBlock));

    if (spec.badge) {
      var bc = colors[spec.badge.color || 'blue'] || colors.blue;
      items.push(h('span', {
        style: 'display:inline-flex;align-items:center;padding:2px 10px;border-radius:9999px;font-size:0.8rem;font-weight:500;background:' + bc.bg + ';color:' + bc.fg
      }, function() { return reactive(store, spec.badge.value, ctx)(); }));
    }

    if (spec.actions) {
      var btns = spec.actions.map(function(a) { return renderButton(a, store, ctx); });
      items.push(h('div', { style: 'display:flex;gap:0.5rem' }, btns));
    }

    var el = h('div', {
      style: 'display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap'
    }, items);
    return mergeStyle(el, spec);
  }

  function renderForm(spec, store, ctx) {
    var formState = {};
    var fields = spec.fields || [];

    // Initialize form state from defaults
    fields.forEach(function(f) {
      formState[f.key] = f.default !== undefined ? f.default : (f.type === 'number' || f.type === 'slider' ? 0 : '');
    });

    var children = [];
    if (spec.title) {
      children.push(h('h3', { style: 'font-size:1.1rem;font-weight:600;margin-bottom:1rem' }, spec.title));
    }

    fields.forEach(function(field) {
      var label = h('label', { class: 'nv-label' }, field.label);
      var input;

      if (field.type === 'textarea') {
        input = h('textarea', {
          class: 'nv-textarea',
          name: field.key,
          placeholder: field.placeholder || '',
          required: field.required || false,
          onInput: function(e) {
            formState[field.key] = e.target.value;
            if (field.action) wireAction(store, { action: field.action, args: field.args || { value: e.target.value } }, ctx)();
          }
        });
      } else if (field.type === 'select') {
        var opts = (typeof field.options === 'string' ? reactive(store, field.options, ctx)() : field.options) || [];
        input = h('select', {
          class: 'nv-select',
          name: field.key,
          onChange: function(e) {
            formState[field.key] = e.target.value;
            if (field.action) wireAction(store, { action: field.action, args: field.args || { value: e.target.value } }, ctx)();
          }
        }, opts.map(function(o) {
          var val = typeof o === 'string' ? o : o.value;
          var lbl = typeof o === 'string' ? o : o.label;
          return h('option', { value: val }, lbl);
        }));
      } else if (field.type === 'toggle') {
        input = h('label', { class: 'nv-toggle', style: 'display:flex;align-items:center;gap:0.5rem;cursor:pointer' },
          h('input', {
            type: 'checkbox',
            name: field.key,
            onChange: function(e) {
              formState[field.key] = e.target.checked;
              if (field.action) wireAction(store, { action: field.action, args: field.args || { value: e.target.checked } }, ctx)();
            }
          }),
          h('span', {}, '')
        );
      } else if (field.type === 'slider') {
        var sliderId = 'slider-' + field.key;
        var display = h('span', {
          style: 'font-weight:600;min-width:3rem;text-align:center',
          id: sliderId + '-val'
        }, String(field.default || field.min || 0));

        input = h('div', { style: 'display:flex;align-items:center;gap:1rem' },
          h('input', {
            type: 'range',
            name: field.key,
            id: sliderId,
            min: String(field.min || 0),
            max: String(field.max || 100),
            step: String(field.step || 1),
            value: String(field.default || field.min || 0),
            style: 'flex:1',
            onInput: function(e) {
              var val = parseFloat(e.target.value);
              formState[field.key] = val;
              var valEl = document.getElementById(sliderId + '-val');
              if (valEl) valEl.textContent = String(val);
              if (field.action) {
                var args = {};
                if (field.args) {
                  for (var k in field.args) {
                    args[k] = field.args[k] === '$self' ? val : field.args[k];
                  }
                } else {
                  args.value = val;
                }
                wireAction(store, { action: field.action, args: args }, ctx)();
              }
            }
          }),
          display
        );
      } else if (field.type === 'radio') {
        var opts = field.options || [];
        input = h('div', { style: 'display:flex;gap:1rem;flex-wrap:wrap' },
          opts.map(function(o) {
            var val = typeof o === 'string' ? o : o.value;
            var lbl = typeof o === 'string' ? o : o.label;
            return h('label', { style: 'display:flex;align-items:center;gap:0.4rem;cursor:pointer' },
              h('input', {
                type: 'radio',
                name: field.key,
                value: val,
                class: 'nv-radio',
                onChange: function(e) {
                  formState[field.key] = e.target.value;
                  if (field.action) wireAction(store, { action: field.action, args: field.args || { value: e.target.value } }, ctx)();
                }
              }),
              h('span', {}, lbl)
            );
          })
        );
      } else {
        input = h('input', {
          class: 'nv-input',
          type: field.type || 'text',
          name: field.key,
          placeholder: field.placeholder || '',
          required: field.required || false,
          min: field.min !== undefined ? String(field.min) : undefined,
          max: field.max !== undefined ? String(field.max) : undefined,
          step: field.step !== undefined ? String(field.step) : undefined,
          onInput: function(e) {
            formState[field.key] = field.type === 'number' ? parseFloat(e.target.value) : e.target.value;
            if (field.action) wireAction(store, { action: field.action, args: field.args || { value: formState[field.key] } }, ctx)();
          }
        });
      }

      children.push(h('div', { class: 'nv-field', style: 'margin-bottom:1rem' }, label, input));
    });

    // Submit / cancel buttons
    if (spec.submit || spec.cancel) {
      var btns = [];
      if (spec.submit) {
        btns.push(h('button', {
          class: 'nv-btn nv-btn-primary',
          onClick: function() {
            if (spec.mutation) {
              // TODO: wire to Convex mutation
              console.log('mutation:', spec.mutation, formState);
            } else if (spec.action) {
              wireAction(store, { action: spec.action, args: formState }, ctx)();
            }
          }
        }, spec.submit));
      }
      if (spec.cancel) {
        btns.push(renderButton(
          typeof spec.cancel === 'string' ? { label: spec.cancel, style: 'ghost' } : Object.assign({ style: 'ghost' }, spec.cancel),
          store, ctx
        ));
      }
      children.push(h('div', { style: 'display:flex;gap:0.75rem;margin-top:0.5rem' }, btns));
    }

    return mergeStyle(h('div', { class: 'nv-card nv-p-6' }, children), spec);
  }

  function renderDivider(spec) {
    if (typeof spec === 'string' || !spec) {
      return h('hr', { style: 'border:none;border-top:1px solid var(--nv-border);margin:0.5rem 0' });
    }
    return h('div', { style: 'display:flex;align-items:center;gap:1rem;color:var(--nv-text-muted);font-size:0.85rem' },
      h('hr', { style: 'flex:1;border:none;border-top:1px solid var(--nv-border)' }),
      h('span', {}, spec.label),
      h('hr', { style: 'flex:1;border:none;border-top:1px solid var(--nv-border)' })
    );
  }

  function renderEmpty(spec) {
    var el = h('div', {
      class: 'nv-card nv-p-8',
      style: 'text-align:center'
    },
      spec.icon ? h('div', { style: 'font-size:2.5rem;margin-bottom:1rem;opacity:0.5' }, spec.icon === 'inbox' ? '\u{1F4E5}' : '\u{1F4C2}') : null,
      spec.title ? h('h3', { style: 'font-size:1.1rem;font-weight:600;margin-bottom:0.5rem' }, spec.title) : null,
      spec.description ? h('p', { style: 'color:var(--nv-text-muted)' }, spec.description) : null,
      spec.action ? h('div', { style: 'margin-top:1rem' }, renderButton(spec.action, null, {})) : null
    );
    return mergeStyle(el, spec);
  }

  // ── Section Dispatcher ──────────────────────────────

  function renderSection(spec, store, ctx) {
    if (!spec) return null;

    // Handle conditional: { when: expr, section: [...] }
    if (spec.when !== undefined) {
      var container = h('div', {});
      var _whenDispose = effect(function() {
        var show = reactive(store, spec.when, ctx)();
        while (container.firstChild) { _disposeTree(container.firstChild); container.removeChild(container.firstChild); }
        if (show && spec.section) {
          spec.section.forEach(function(s) {
            var el = renderSection(s, store, ctx);
            if (el) container.appendChild(el);
          });
        }
      });
      return container;
    }

    // Handle show: reactive visibility
    if (spec.show !== undefined) {
      var inner = Object.assign({}, spec);
      delete inner.show;
      var el = renderSection(inner, store, ctx);
      if (el) {
        effect(function() {
          var visible = reactive(store, spec.show, ctx)();
          el.style.display = visible ? '' : 'none';
        });
      }
      return el;
    }

    // Dispatch by type
    if (spec.stat) return renderStat(spec.stat, store, ctx);
    if (spec.metrics) return renderMetrics(spec.metrics, store, ctx);
    if (spec.table) return renderTable(spec.table, store, ctx);
    if (spec.cards) return renderCards(spec.cards, store, ctx);
    if (spec.form) return renderForm(spec.form, store, ctx);
    if (spec.header) return renderHeader(spec.header, store, ctx);
    if (spec.row) return renderRow(spec.row, store, ctx);
    if (spec.button) return renderButton(spec.button, store, ctx);
    if (spec.empty) return renderEmpty(spec.empty);
    if (spec.divider !== undefined) return renderDivider(spec.divider);

    // Shorthand: { stat: { ... } } or just a section object with type key
    var keys = Object.keys(spec);
    if (keys.length === 1 && typeof spec[keys[0]] === 'object') {
      var type = keys[0];
      var dispatchers = { stat: renderStat, metrics: renderMetrics, table: renderTable, cards: renderCards, form: renderForm, header: renderHeader, row: renderRow, button: renderButton, empty: renderEmpty };
      if (dispatchers[type]) return dispatchers[type](spec[type], store, ctx);
    }

    return null;
  }

  // ── Main Render Entry ───────────────────────────────

  function render(selector, store, spec) {
    var app = spec.app || {};
    var sections = spec.render ? spec.render.sections || spec.render : spec.sections || [];

    // Intercept store.set to always merge partial state
    // (ensures effects never see incomplete state, even with cached core.js)
    var _origSet = store.set;
    store.set = function(val) {
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        var cur = store.get();
        var merged = {};
        for (var k in cur) merged[k] = cur[k];
        for (var k in val) merged[k] = val[k];
        _origSet(merged);
      } else {
        _origSet(val);
      }
    };

    // Set locale
    if (app.locale) locale = app.locale;

    // Set theme
    if (app.theme) {
      document.documentElement.setAttribute('data-theme', app.theme);
    }

    // Build context
    var ctx = {
      params: {},
      queries: {},
      auth: {}
    };

    // If views are defined, set up navigation
    if (spec.views) {
      var viewState = { __view: spec.navigation && spec.navigation.default || Object.keys(spec.views)[0], __viewParams: {} };

      // Patch store to include view state
      var realGet = store.get;
      store.get = function() {
        var s = realGet();
        s.__view = viewState.__view;
        s.__viewParams = viewState.__viewParams;
        return s;
      };

      store.actions.__navigate = function(args) {
        viewState.__view = args.view;
        viewState.__viewParams = args.params || {};
        ctx.params = viewState.__viewParams;
        // Trigger re-render via a dummy store update
        store.set(store.get());
      };
    }

    mount(selector, function() {
      var container = h('div', {
        class: 'nv-container nv-py-6',
        style: 'max-width:1100px'
      });

      // App header
      if (app.name) {
        var headerItems = [h('h1', {
          style: 'font-size:1.5rem;font-weight:700;font-family:Outfit,sans-serif'
        }, app.name)];
        if (app.brand) {
          headerItems.push(h('span', { class: 'nv-badge nv-badge-primary' }, app.brand));
        }
        headerItems.push(h('span', { class: 'nv-badge nv-badge-neutral' }, 'no\u2205'));
        container.appendChild(h('div', {
          style: 'display:flex;align-items:center;gap:0.75rem;margin-bottom:1.5rem'
        }, headerItems));
      }

      if (spec.views) {
        // Navigation
        if (spec.navigation && spec.navigation.type) {
          var navContainer = h('div', {
            style: 'display:flex;gap:0.5rem;margin-bottom:1.5rem;border-bottom:1px solid var(--nv-border);padding-bottom:0.75rem'
          });

          var navItems = (spec.navigation.items || []).filter(function(ni) { return !ni.hidden; });
          navItems.forEach(function(ni) {
            var viewName = ni.view;
            var viewSpec = spec.views[viewName];
            navContainer.appendChild(h('button', {
              class: function() {
                return 'nv-btn nv-btn-sm ' + (store.get().__view === viewName ? 'nv-btn-primary' : 'nv-btn-ghost');
              },
              onClick: function() { store.actions.__navigate({ view: viewName }); }
            }, (viewSpec && viewSpec.title) || viewName));
          });

          container.appendChild(navContainer);
        }

        // View container
        var viewContainer = h('div', { style: 'display:flex;flex-direction:column;gap:1.5rem' });

        effect(function() {
          var currentView = store.get().__view;
          var viewSpec = spec.views[currentView];

          while (viewContainer.firstChild) { _disposeTree(viewContainer.firstChild); viewContainer.removeChild(viewContainer.firstChild); }

          if (viewSpec && viewSpec.sections) {
            var viewCtx = Object.assign({}, ctx);
            viewCtx.params = store.get().__viewParams || {};
            viewSpec.sections.forEach(function(s) {
              var el = renderSection(s, store, viewCtx);
              if (el) viewContainer.appendChild(el);
            });
          }
        });

        container.appendChild(viewContainer);
      } else {
        // Single-view: render sections directly
        var sectionContainer = h('div', { style: 'display:flex;flex-direction:column;gap:1.5rem' });
        sections.forEach(function(s) {
          var el = renderSection(s, store, ctx);
          if (el) sectionContainer.appendChild(el);
        });
        container.appendChild(sectionContainer);
      }

      return container;
    });
  }

  // ── Export ───────────────────────────────────────────
  N.render = render;
  N.render.formatters = formatters;
  N.render.colors = colors;

})(window.Novoid);
