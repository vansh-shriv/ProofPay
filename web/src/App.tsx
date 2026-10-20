import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Footer, Rail, Topbar, type PageKey } from './components/Chrome';
import { Home } from './components/Home';
import { JobPage } from './components/JobPage';
import { PolicyPage } from './components/PolicyPage';
import { DataProvider } from './data';
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

export function App() {
  const { path, query } = useRoute();
  const panel = useRef<HTMLDivElement>(null);
  const [showTop, setShowTop] = useState(false);

  const jobId = path.match(/^\/jobs\/([\w-]+)$/)?.[1];
  const page: PageKey = jobId ? 'job' : path === '/ledger' ? 'ledger' : path === '/policy' ? 'policy' : 'overview';

  // New page: back to the top (the panel scrolls on desktop, the document on mobile).
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
    window.scrollTo(0, 0);
  }, [path]);

  return (
    <ToastProvider>
      <DataProvider>
        <div className="shell">
          <div className="frame">
            <Rail page={page} />
            <div className="panel" ref={panel} onScroll={(e) => setShowTop(e.currentTarget.scrollTop > 420)}>
              <div className="panel-in">
                <Topbar page={page} />
                <div className="content">
                  {jobId ? <JobPage key={jobId} id={jobId} error={query.get('error') ?? undefined} />
                    : page === 'ledger' ? <Suspense fallback={<div className="card empty">Loading ledger…</div>}><Ledger /></Suspense>
                    : page === 'policy' ? <PolicyPage />
                    : <Home />}
                </div>
                <Footer />
                <button className={`totop${showTop ? ' show' : ''}`} aria-label="Back to top" tabIndex={showTop ? 0 : -1} onClick={() => panel.current?.scrollTo({ top: 0, behavior: 'smooth' })}>
                  <Icon name="up" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </DataProvider>
    </ToastProvider>
  );
}
