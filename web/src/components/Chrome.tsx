import { useApp } from '../data';
import { needsAttention } from '../format';
import { ThemeToggle } from '../theme';
import { Brand, Icon } from '../ui';

export type PageKey = 'overview' | 'ledger' | 'policy' | 'job';

const scrollTo = (id: string) => setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 90);

// ---------------- sidebar ----------------
export function Sidebar({ page, mode, collapsed, onToggle }: { page: PageKey; mode?: string; collapsed: boolean; onToggle: () => void }) {
  const link = (href: string, icon: 'overview' | 'ledger' | 'policy', label: string, key: PageKey) => (
    <a href={href} tabIndex={collapsed ? -1 : undefined} aria-current={page === key || (key === 'overview' && page === 'job') ? 'page' : undefined}>
      <Icon name={icon} />
      <span>{label}</span>
    </a>
  );
  return (
    <aside className="side" aria-hidden={collapsed} id="sidebar">
      <div className="side-head">
        <a href="#/" aria-label="ProofPay home" tabIndex={collapsed ? -1 : undefined}><Brand /></a>
        <button className="iconbtn sm" onClick={onToggle} tabIndex={collapsed ? -1 : undefined} aria-label="Hide sidebar" title="Hide sidebar"><Icon name="panel" /></button>
      </div>
      <div className="side-label">Menu</div>
      <nav className="nav" aria-label="Main">
        {link('#/', 'overview', 'Overview', 'overview')}
        {link('#/ledger', 'ledger', 'Ledger', 'ledger')}
        {link('#/policy', 'policy', 'Policy', 'policy')}
      </nav>
      <div className="side-label">Quick links</div>
      <div className="quick">
        <a href="https://developer.paypal.com" target="_blank" rel="noreferrer" tabIndex={collapsed ? -1 : undefined}>PayPal Developer<Icon name="ext" /></a>
        <a href="https://paypalaihackathon.devpost.com" target="_blank" rel="noreferrer" tabIndex={collapsed ? -1 : undefined}>PayPal AI Hackathon<Icon name="ext" /></a>
      </div>
      <div className="side-sp" />
      {mode && <div className="side-note"><b>Test environment</b>{mode}</div>}
    </aside>
  );
}

// ---------------- top bar (frosted glass) ----------------
const TITLES: Record<Exclude<PageKey, 'job'>, string> = { overview: 'Overview', ledger: 'Ledger', policy: 'Policy' };

export function Topbar({ page, collapsed, onToggle }: { page: PageKey; collapsed: boolean; onToggle: () => void }) {
  const { jobs, query, setQuery } = useApp();
  const attention = (jobs ?? []).filter(needsAttention).length;
  const searchable = page === 'overview' || page === 'ledger';

  function goAttention() {
    location.hash = '#/';
    scrollTo('attention');
  }

  return (
    <header className="topbar">
      <button
        className={`iconbtn side-toggle${collapsed ? '' : ' hidden-when-open'}`}
        onClick={onToggle}
        aria-label="Show sidebar"
        aria-expanded={!collapsed}
        aria-controls="sidebar"
        title="Show sidebar"
        tabIndex={collapsed ? 0 : -1}
      >
        <Icon name="panel" />
      </button>
      <a href="#/" className="tb-brand" aria-label="ProofPay home" tabIndex={collapsed ? 0 : -1}><Brand size="sm" tagline={false} /></a>
      <div className="title">
        {page === 'job' ? (
          <div className="crumbs"><a href="#/">Overview</a><span aria-hidden="true">/</span><span style={{ color: 'var(--ink)' }}>Contract</span></div>
        ) : (
          <h1>{TITLES[page]}</h1>
        )}
      </div>
      {searchable && (
        <label className="search">
          <span className="sr-only">Search jobs</span>
          <Icon name="search" />
          <input type="search" placeholder="Search jobs" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      )}
      <ThemeToggle />
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
export function Footer({ mode }: { mode: string }) {
  return (
    <footer className="footer">
      <div className="footer-in">
        <div className="footer-top">
          <div>
            <Brand />
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
            <h4>Get started</h4>
            <ul>
              <li><a href="#/" onClick={() => scrollTo('new-job')}>Post a job</a></li>
              <li><a href="#/" onClick={() => scrollTo('how')}>How it works</a></li>
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
      </div>
    </footer>
  );
}
