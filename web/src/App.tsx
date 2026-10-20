import { lazy, Suspense, useEffect, useState } from 'react';
import { api, type Health } from './api';
import { Home } from './components/Home';
import { JobPage } from './components/JobPage';
import { PolicyPage } from './components/PolicyPage';
import { Badge, Logo, ToastProvider } from './ui';

// AG Grid is large: load it only when the Ledger is opened.
const Ledger = lazy(() => import('./components/Ledger').then((m) => ({ default: m.Ledger })));

function useRoute() {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const on = () => { setHash(location.hash || '#/'); window.scrollTo(0, 0); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const [path, query = ''] = hash.slice(1).split('?');
  return { path: path || '/', query: new URLSearchParams(query) };
}

export function App() {
  const { path, query } = useRoute();
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => { api.health().then(setHealth).catch(() => setHealth(null)); }, []);

  const jobId = path.match(/^\/jobs\/([\w-]+)$/)?.[1];
  const page = jobId ? 'jobs' : path.replace('/', '') || 'jobs';
  const nav = (to: string, label: string, key: string) => <a href={`#${to}`} aria-current={page === key ? 'page' : undefined}>{label}</a>;

  return (
    <ToastProvider>
      <header className="topbar">
        <div className="topbar-in">
          <a className="brand" href="#/"><Logo /><span>ProofPay</span></a>
          <nav className="nav" aria-label="Main">
            {nav('/', 'Jobs', 'jobs')}
            {nav('/ledger', 'Ledger', 'ledger')}
            {nav('/policy', 'Policy', 'policy')}
          </nav>
          <div className="spacer" />
          {health && (
            <div className="modes">
              <Badge tone={health.payments === 'paypal' ? 'good' : 'warn'}>{health.payments === 'paypal' ? 'PayPal Sandbox' : 'PayPal Simulator'}</Badge>
              <Badge tone="info">AI: {health.llm.replace('gemini:', '').split(',')[0]}</Badge>
            </div>
          )}
        </div>
      </header>
      {jobId ? <JobPage key={jobId} id={jobId} error={query.get('error') ?? undefined} />
        : path === '/ledger' ? <Suspense fallback={<main className="page"><div className="card empty">Loading ledger…</div></main>}><Ledger /></Suspense>
        : path === '/policy' ? <PolicyPage />
        : <Home />}
    </ToastProvider>
  );
}
