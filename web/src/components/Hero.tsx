import { Icon } from '../ui';

function Art() {
  return (
    <svg className="art" viewBox="0 0 420 270" fill="none" aria-hidden="true">
      <g stroke="#555669" strokeWidth="2">
        <rect x="190" y="30" width="196" height="126" rx="22" transform="rotate(9 288 93)" />
        <rect x="170" y="74" width="196" height="126" rx="22" transform="rotate(-7 268 137)" />
      </g>
      <path d="M64 226C124 262 206 254 262 208" stroke="#8fb9ee" strokeWidth="2.5" strokeDasharray="2 10" strokeLinecap="round" />
      <path d="M262 62l66 24v52c0 38-28 66-66 80-38-14-66-42-66-80V86z" fill="#f6efd2" />
      <path d="M232 140l22 22 40-46" stroke="#1b1b1f" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="84" cy="196" r="36" fill="#cfe4fb" />
      <text x="84" y="209" textAnchor="middle" fontSize="38" fontWeight="700" fill="#1b1b1f" fontFamily="inherit">$</text>
      <circle cx="372" cy="58" r="24" fill="#d8efdc" />
      <path d="M361 58l8 8 14-16" stroke="#1b1b1f" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="132" cy="70" r="7" fill="#e6e0fa" />
      <circle cx="346" cy="214" r="9" fill="#cdb8ff" />
      <circle cx="40" cy="120" r="4" fill="#f8f0cf" />
    </svg>
  );
}

export function Hero() {
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <section className="hero" aria-label="Introduction">
      <div>
        <h2>Pay only when the work is <em>proven.</em></h2>
        <p>
          ProofPay holds your money with PayPal, lets a worker (human or AI agent) do the job, then <b style={{ color: '#fff' }}>actually checks the work</b>.
          Pass and they are paid automatically. Dispute and an AI arbiter splits the funds fairly.
        </p>
        <div className="row">
          <button className="btn sky lg" onClick={() => { go('new-job'); setTimeout(() => document.getElementById('job-request')?.focus({ preventScroll: true }), 500); }}>
            <Icon name="plus" />Post a job
          </button>
          <button className="btn ghost-dark lg" onClick={() => go('how')}>How it works</button>
        </div>
      </div>
      <Art />
    </section>
  );
}
