import { useEffect, useState } from 'react';
import { api, type Policy } from '../api';
import { useApp } from '../data';
import { totals, usd } from '../format';
import { Icon, type IconName } from '../ui';
import { Hero } from './Hero';
import { JobList } from './JobList';
import { NewJob } from './NewJob';

function Bal({ tone, icon, label, value }: { tone: string; icon: IconName; label: string; value: string }) {
  return (
    <div className={`bal ${tone}`}>
      <span className="sq"><Icon name={icon} /></span>
      <div><div className="l">{label}</div><div className="v">{value}</div></div>
    </div>
  );
}

function RightRail() {
  const { jobs } = useApp();
  const t = totals(jobs ?? []);
  const [policy, setPolicy] = useState<Policy | null>(null);
  useEffect(() => { api.policy().then(setPolicy).catch(() => setPolicy(null)); }, []);
  return (
    <aside className="rightrail" aria-label="Money at a glance">
      <section className="rail-card">
        <h3>Money at a glance</h3>
        <div className="bal-grid">
          <Bal tone="held" icon="lock" label="Held by PayPal" value={usd(t.held)} />
          <Bal tone="paid" icon="wallet" label="Paid to workers" value={usd(t.paidOut)} />
          <Bal tone="ret" icon="undo" label="Returned to clients" value={usd(t.returned)} />
          <Bal tone="cnt" icon="file" label="Contracts" value={String(t.jobs)} />
        </div>
      </section>
      {policy && (
        <section className="rail-card fill">
          <h3>Spending guardrails</h3>
          <dl className="limits">
            <div><dt>Auto-approve up to</dt><dd>{usd(policy.autoApproveMaxCents)}</dd></div>
            <div><dt>Hard limit per job</dt><dd>{usd(policy.hardMaxCents)}</dd></div>
            <div><dt>Daily budget</dt><dd>{usd(policy.dailyBudgetCents)}</dd></div>
          </dl>
          <a className="linkbtn" href="#/policy">Edit policy<Icon name="arrow" /></a>
        </section>
      )}
    </aside>
  );
}

const STEPS = [
  ['Describe', 'AI turns plain English into a contract with real acceptance tests or a rubric.'],
  ['Hold', 'PayPal authorizes the funds. You are not charged until the work is verified.'],
  ['Prove', 'The worker submits. The verifier runs the code or reviews the writing for real.'],
  ['Release', 'Pass: PayPal captures and pays out. Dispute: an AI arbiter splits fairly.'],
];

export function Home() {
  const { jobs, reload } = useApp();
  return (
    <>
      <div className="span"><Hero /></div>

      <div className="col">
        <NewJob onCreated={(id) => { reload(); location.hash = `#/jobs/${id}`; }} />
      </div>
      <RightRail />

      <div className="span">{jobs ? <JobList jobs={jobs} /> : <div className="card empty">Loading…</div>}</div>

      <section id="how" className="span" aria-label="How it works">
        <div className="section-h"><h2>How ProofPay works</h2></div>
        <ol className="how">
          {STEPS.map(([title, text], i) => <li key={title}><span className="n">{i + 1}</span><b>{title}</b><p>{text}</p></li>)}
        </ol>
      </section>
    </>
  );
}
