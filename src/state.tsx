import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppState } from './types';
import { emptyState, loadState, saveState } from './lib/store';

interface Ctx {
  state: AppState;
  ready: boolean;
  update: (fn: (s: AppState) => AppState) => void;
  /** Latest state, for async work that applies several changes in a row. */
  getState: () => AppState;
}

const StateContext = createContext<Ctx | null>(null);

export function StateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(emptyState);
  const [ready, setReady] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    loadState().then((s) => {
      setState(s);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void saveState(state), 300);
  }, [state, ready]);

  const update = useCallback((fn: (s: AppState) => AppState) => setState((s) => fn(s)), []);
  const getState = useCallback(() => latest.current, []);
  return <StateContext.Provider value={{ state, ready, update, getState }}>{children}</StateContext.Provider>;
}

export function useAppState(): Ctx {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error('useAppState outside provider');
  return ctx;
}
