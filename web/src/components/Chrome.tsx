import { useApp } from '../data';
import { needsAttention } from '../format';
import { Icon, Logo } from '../ui';

export type PageKey = 'overview' | 'ledger' | 'policy' | 'job';

// ---------------- left rail ----------------
export function Rail({ page }: { page: PageKey }) {
  const link = (href: string, icon: 'overview' | 'ledger' | 'policy', label: string, key: PageKey) => (
    <a className="rail-link" href={href} aria-current={page === key || (key === 'overview' && page === 'job') ? 'page' : undefined}>
      <Icon name={icon} />
      <span>{label}</span>
    </a>
  );
  return (
    <aside className="rail">
      <a href="#/" className="rail-logo" aria-label="ProofPay home"><Logo /></a>
      <nav aria-label="Main">
        {link('#/', 'overview', 'Overview', 'overview')}
        {link('#/ledger', 'ledger', 'Ledger', 'ledger')}
        {link('#/policy', 'policy', 'Policy', 'policy')}
      </nav>
      <div className="rail-sp" />
      <div className="rail-foot">v1.0<br />2026</div>
    </aside>
  );
}

// ---------------- top bar ----------------
const TITLES: Record<Exclude<PageKey, 'job'>, string> = { overview: 'Overview', ledger: 'Ledger', policy: 'Policy' };

export function Topbar({ page }: { page: PageKey }) {
  const { jobs, query, setQuery } = useApp();
  const attention = (jobs ?? []).filter(needsAttention).length;
  const searchable = page === 'overview' || page === 'ledger';

  function goAttention() {
    location.hash = '#/';
    setTimeout(() => document.getElementById('attention')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  return (
    <header className="topbar">
      {page === 'job' ? (
        <div className="crumbs" style={{ flex: 1 }}>
          <a href="#/">Overview</a><span aria-hidden="true">/</span><span style={{ color: 'var(--ink)' }}>Contract</span>
        </div>
      ) : (
        <h1>{TITLES[page]}</h1>
      )}
      {searchable && (
        <label className="search">
          <span className="sr-only">Search jobs</span>
          <Icon name="search" />
          <input type="search" placeholder="Search jobs" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      )}
      <button className="iconbtn" onClick={goAttention} aria-label={attention ? `${attention} jobs need your attention` : 'Notifications'}>
        <Icon name="bell" />
        {attention > 0 && <span className="dot">{attention}</span>}
      </button>
      <div className="user" title="Demo account">
        <span className="avatar">DC</span>
        <span>Demo client<small>Test account</small></span>
      </div>
    </header>
  );
}

// ---------------- footer ----------------
export function Footer() {
  const { health } = useApp();
  const mode = health?.payments === 'paypal' ? 'PayPal sandbox (test money only)' : 'Built-in PayPal simulator';
  return (
    <footer className="footer">
      <div className="footer-top">
        <div>
          <div className="brandline"><span className="mk"><Logo tone="light" /></span>ProofPay</div>
          <p className="blurb">Payment released only when the work is proven. AI-verified, PayPal-powered.</p>
        </div>
        <div>
          <h4>Product</h4>
          <ul>
            <li><a href="#/">Overview</a></li>
            <li><a href="#/ledger">Ledger</a></li>
            <li><a href="#/policy">Spending policy</a></li>
          </ul>
        </div>
        <div>
          <h4>How it works</h4>
          <ul>
            <li><a href="#/" onClick={() => setTimeout(() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }), 80)}>Hold, prove, release</a></li>
            <li><a href="#/" onClick={() => setTimeout(() => document.getElementById('new-job')?.scrollIntoView({ behavior: 'smooth' }), 80)}>Post a job</a></li>
          </ul>
        </div>
        <div>
          <h4>Built with</h4>
          <ul>
            <li><a href="https://developer.paypal.com" target="_blank" rel="noreferrer">PayPal Developer</a></li>
            <li><a href="https://paypalaihackathon.devpost.com" target="_blank" rel="noreferrer">PayPal AI Hackathon</a></li>
            <li><a href="https://www.ag-grid.com" target="_blank" rel="noreferrer">AG Grid</a></li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 ProofPay · MIT License</span>
        <span className="modechip"><i />{mode}</span>
      </div>
    </footer>
  );
}
