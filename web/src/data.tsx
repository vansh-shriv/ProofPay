import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Health, type Job } from './api';

interface AppData {
  jobs: Job[] | null;
  health: Health | null;
  reload: () => Promise<void>;
  /** Shared search box in the top bar (filters the job list and the ledger). */
  query: string;
  setQuery: (q: string) => void;
}
const Ctx = createContext<AppData>({ jobs: null, health: null, reload: async () => {}, query: '', setQuery: () => {} });
export const useApp = () => useContext(Ctx);

/** One shared, polled copy of the jobs so the sidebar badge, bell, stats and lists never disagree. */
export function DataProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [query, setQuery] = useState('');

  const reload = useCallback(async () => {
    try {
      setJobs(await api.jobs());
    } catch {
      /* keep last known list; the next poll will retry */
    }
  }, []);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
    reload();
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [reload]);

  const value = useMemo(() => ({ jobs, health, reload, query, setQuery }), [jobs, health, reload, query]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
