/**
 * Novoid Plugin: Router
 * Client-side hash-based routing
 * Requires: core.js loaded first (window.Novoid)
 */
((Novoid) => {
  const { signal, effect } = Novoid;

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

      // Untrack: component rendering must NOT be tracked by the route effect,
      // otherwise any signal read during component creation (e.g. bind, computed)
      // would cause the entire route to re-render on every keystroke.
      const prevEffect = Novoid._activeEffect;
      Novoid._activeEffect = null;
      try {
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
      } finally {
        Novoid._activeEffect = prevEffect;
      }
    }

    window.addEventListener('hashchange', () => {
      setRoute(window.location.hash.slice(1) || '/');
    });

    effect(renderRoute);

    return { navigate, currentRoute };
  }

  function link(text, path, className = '') {
    const a = document.createElement('a');
    a.href = `#${path}`;
    a.textContent = text;
    a.className = className;
    return a;
  }

  Novoid.createRouter = createRouter;
  Novoid.link = link;
})(window.Novoid);
