import { useCallback, useEffect, useRef, useState } from 'react';
import api, { errorText } from '../api/client';

/**
 * Charge des données depuis l'API.
 * `params` est sérialisé pour déclencher un rechargement à chaque changement de filtre.
 * Passer `url = null` pour ne rien charger.
 */
export function useFetch(url, params) {
  const [state, setState] = useState({ data: null, loading: Boolean(url), error: null });
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(params || {});
  const request = useRef(0);

  useEffect(() => {
    if (!url) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const current = ++request.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .get(url, { params: JSON.parse(key) })
      .then((res) => {
        if (current === request.current) setState({ data: res.data, loading: false, error: null });
      })
      .catch((err) => {
        if (current === request.current) setState({ data: null, loading: false, error: errorText(err, 'Chargement impossible') });
      });
  }, [url, key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/** Valeur retardée (recherche au fil de la frappe). */
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
