import { lazy, Suspense, useEffect, useState } from 'react';
import { Footer, Sidebar, Topbar, type PageKey } from './components/Chrome';
import { Home } from './components/Home';
import { JobPage } from './components/JobPage';
import { PolicyPage } from './components/PolicyPage';
import { DataProvider, useApp } from './data';
import { ThemeProvider } from './theme';
import { Icon, ToastProvider } from './ui';

// AG Grid is large: load it only when the Ledger is opened.
const Ledger = lazy(() => import('./components/Ledger').then((m) => ({ default: m.Ledger })));

function useRoute() {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(location.hash || '#/');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const [path, query = ''] = hash.slice(1).split('?');
  return { path: path || '/', query: new URLSearchParams(query) };
}

function Shell() {
  const { path, query } = useRoute();
  const { health } = useApp();
  const [showTop, setShowTop] = useState(false);
  // The sidebar can slide away; the choice is remembered.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('proofpay-sidebar') === 'collapsed'; } catch { return false; }
  });
  const toggleSide = () => setCollapsed((c) => {
    const next = !c;
    try { localStorage.setItem('proofpay-sidebar', next ? 'collapsed' : 'open'); } catch { /* not persisted in private mode */ }
    return next;
  });

  const jobId = path.match(/^\/jobs\/([\w-]+)$/)?.[1];
  const page: PageKey = jobId ? 'job' : path === '/ledger' ? 'ledger' : path === '/policy' ? 'policy' : 'overview';
  const mode = health?.payments === 'paypal' ? 'PayPal sandbox (test money only)' : 'Built-in PayPal simulator';

  useEffect(() => { window.scrollTo(0, 0); }, [path]);
  useEffect(() => {
    const on = () => setShowTop(window.scrollY > 480);
    on();
    addEventListener('scroll', on, { passive: true });
    return () => removeEventListener('scroll', on);
  }, []);

  return (
    <div className={`app${collapsed ? ' collapsed' : ''}`}>
      <Sidebar page={page} mode={health ? mode : undefined} collapsed={collapsed} onToggle={toggleSide} />
      <div className="main">
        <Topbar page={page} collapsed={collapsed} onToggle={toggleSide} />
        <main className={`body${page === 'overview' ? ' rail' : ''}`}>
          {jobId ? <JobPage key={jobId} id={jobId} error={query.get('error') ?? undefined} />
            : page === 'ledger' ? <Suspense fallback={<div className="card empty">Loading ledger…</div>}><Ledger /></Suspense>
            : page === 'policy' ? <PolicyPage />
            : <Home />}
        </main>
        <Footer mode={mode} />
      </div>
      <button className={`totop${showTop ? ' show' : ''}`} aria-label="Back to top" tabIndex={showTop ? 0 : -1} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        <Icon name="up" />
      </button>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <DataProvider>
          <Shell />
        </DataProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
