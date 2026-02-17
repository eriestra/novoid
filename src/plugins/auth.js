/**
 * Novoid Plugin: Auth (Platform-wide authentication + Organizations)
 * useNovoidAuth, useOrg
 * Requires: core.js + convex.js loaded first (window.Novoid with useQuery)
 */
((Novoid) => {
  const { signal, computed, effect, batch } = Novoid;

  function useNovoidAuth(client) {
    const STORAGE_KEY = 'novoid_auth_token';
    const [user, setUser] = signal(null);
    const [isLoading, setIsLoading] = signal(true);
    const [error, setError] = signal(null);

    const storedToken = (() => {
      try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
    })();
    const [token, setToken] = signal(storedToken);

    const meQuery = Novoid.useQuery(client, 'auth:me', () => {
      const t = token();
      return t ? { token: t } : { token: undefined };
    });

    effect(() => {
      const loading = meQuery.loading();
      const err = meQuery.error();
      const data = meQuery.data();
      batch(() => {
        setIsLoading(loading);
        setError(err || null);
        setUser(data || null);
      });
    });

    const isAuthenticated = computed(() => !!user());

    async function register(email, password, name) {
      setError(null);
      try {
        const result = await client.mutation('auth:register', { email, password, name });
        try { localStorage.setItem(STORAGE_KEY, result.token); } catch {}
        setToken(result.token);
        return result;
      } catch (e) {
        setError(e);
        throw e;
      }
    }

    async function login(email, password) {
      setError(null);
      try {
        const result = await client.mutation('auth:login', { email, password });
        try { localStorage.setItem(STORAGE_KEY, result.token); } catch {}
        setToken(result.token);
        return result;
      } catch (e) {
        setError(e);
        throw e;
      }
    }

    async function logout() {
      const t = token();
      if (t) {
        try { await client.mutation('auth:logout', { token: t }); } catch {}
      }
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      batch(() => {
        setToken(null);
        setUser(null);
      });
    }

    function getToken() {
      return token();
    }

    return { user, isLoading, error, isAuthenticated, register, login, logout, getToken };
  }

  function useOrg(client, auth) {
    const STORAGE_KEY = 'novoid_current_org';
    const [currentOrgId, setCurrentOrgId] = signal(
      (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })()
    );

    const orgsQuery = Novoid.useQuery(client, 'orgs:listForUser', () => {
      const t = auth.getToken();
      return t ? { token: t } : 'skip';
    });

    const orgs = orgsQuery.data;
    const orgsLoading = orgsQuery.loading;

    effect(() => {
      const list = orgs();
      const current = currentOrgId();
      if (!list || list.length === 0) return;
      const valid = list.find((o) => o._id === current);
      if (!valid) {
        const first = list[0]._id;
        setCurrentOrgId(first);
        try { localStorage.setItem(STORAGE_KEY, first); } catch {}
      }
    });

    const currentOrg = computed(() => {
      const list = orgs();
      const id = currentOrgId();
      if (!list || !id) return null;
      return list.find((o) => o._id === id) || null;
    });

    const currentRole = computed(() => {
      const org = currentOrg();
      return org ? org.role : null;
    });

    function switchOrg(orgId) {
      setCurrentOrgId(orgId);
      try { localStorage.setItem(STORAGE_KEY, orgId); } catch {}
    }

    return { orgs, orgsLoading, currentOrg, currentOrgId, currentRole, switchOrg };
  }

  Novoid.useNovoidAuth = useNovoidAuth;
  Novoid.useOrg = useOrg;
})(window.Novoid);
