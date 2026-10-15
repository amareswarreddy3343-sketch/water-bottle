import { useCallback, useEffect, useState } from 'react';
import api from '../api';
import { getErrorMessage } from '../utils/errors';

const EMPTY = { entries: null, next: null, error: '', loadingMore: false };

/** Loads the admin's change history page by page (newest first) */
export function useHistory(filters) {
  const key = JSON.stringify(filters);
  const [state, setState] = useState({ key: null, ...EMPTY });

  useEffect(() => {
    let active = true;
    api
      .history({ ...JSON.parse(key), limit: 60 })
      .then((r) => active && setState({ key, entries: r.entries, next: r.next_before, error: '', loadingMore: false }))
      .catch((err) => active && setState({ key, ...EMPTY, entries: [], error: getErrorMessage(err, 'Could not load the history.') }));
    return () => {
      active = false;
    };
  }, [key]);

  const current = state.key === key ? state : { key, ...EMPTY };

  const more = useCallback(async () => {
    if (!current.next) return;
    setState((s) => ({ ...s, loadingMore: true }));
    try {
      const r = await api.history({ ...JSON.parse(key), limit: 60, before: current.next });
      setState((s) => ({ ...s, entries: [...(s.entries || []), ...r.entries], next: r.next_before, loadingMore: false }));
    } catch (err) {
      setState((s) => ({ ...s, loadingMore: false, error: getErrorMessage(err, 'Could not load more.') }));
    }
  }, [key, current.next]);

  return { ...current, more };
}
