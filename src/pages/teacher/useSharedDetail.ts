import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { api } from '../../api/client';

type Detail<T> = { data: T | null; loading: boolean; error: unknown };

export function watchSharedVisibility(load: () => void, clear: () => void) {
  function hide() { flushSync(clear); }
  function visibility() { if (document.hidden) hide(); else load(); }
  function restore(event: PageTransitionEvent) { if (event.persisted && !document.hidden) load(); }
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', restore);
  document.addEventListener('visibilitychange', visibility);
  if (!document.hidden) load();
  return () => {
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', restore);
    document.removeEventListener('visibilitychange', visibility);
  };
}

/** Hide the previous authorization result before the browser freezes a page snapshot. */
export function watchSharedDetail<T>(read: () => Promise<T>, publish: (state: Detail<T>) => void) {
  let version = 0;
  function clear() {
    version++;
    publish({ data: null, loading: true, error: null });
  }
  function load() {
    const request = ++version;
    publish({ data: null, loading: true, error: null });
    void read().then(
      data => { if (version === request) publish({ data, loading: false, error: null }); },
      error => { if (version === request) publish({ data: null, loading: false, error }); },
    );
  }
  const stop = watchSharedVisibility(load, clear);
  return () => {
    version++;
    stop();
  };
}

export function useSharedDetail<T>(path: string | null, viewerId?: number) {
  const { key } = useLocation();
  const [attempt, setAttempt] = useState(0);
  const request = JSON.stringify([key, path, attempt, viewerId]);
  const [settled, setSettled] = useState<(Detail<T> & { request: string }) | null>(null);
  useEffect(() => {
    if (!path) return;
    return watchSharedDetail(() => api<T>('GET', path), state => setSettled({ ...state, request }));
  }, [path, request]);
  const result = settled?.request === request ? settled : { data: null, loading: !!path, error: null };
  return { ...result, reload: () => setAttempt(value => value + 1) };
}
