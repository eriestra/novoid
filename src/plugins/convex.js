/**
 * Novoid Plugin: Convex Integration
 * createClient, useQuery, useMutation, useAction, useAuth, useConnectionState, useAI
 * Requires: core.js loaded first (window.Novoid)
 */
((Novoid) => {
  const { signal, effect, batch } = Novoid;

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

    state.destroy = () => clearInterval(interval);
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

  Novoid.createClient = createClient;
  Novoid.useQuery = useQuery;
  Novoid.useMutation = useMutation;
  Novoid.useAction = useAction;
  Novoid.useAuth = useAuth;
  Novoid.useConnectionState = useConnectionState;
  Novoid.useAI = useAI;
})(window.Novoid);
