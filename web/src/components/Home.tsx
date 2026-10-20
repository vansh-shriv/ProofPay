import { totals, usd } from '../format';
import { useApp } from '../data';
import { Icon, type IconName } from '../ui';
import { Hero } from './Hero';
import { JobList } from './JobList';
import { NewJob } from './NewJob';

function Stat({ tone, icon, label, value, sub }: { tone: string; icon: IconName; label: string; value: string; sub: string }) {
  return (
    <div className={`stat ${tone}`}>
      <div className="top"><span>{label}</span><span className="ico"><Icon name={icon} /></span></div>
      <div><div className="value">{value}</div><div className="sub">{sub}</div></div>
    </div>
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
  const t = totals(jobs ?? []);
  return (
    <>
      <Hero />

      <section className="stats" aria-label="Totals">
        <Stat tone="sky" icon="lock" label="Held by PayPal" value={usd(t.held)} sub="authorized, not yet charged" />
        <Stat tone="mint" icon="wallet" label="Paid to workers" value={usd(t.paidOut)} sub="released after verification" />
        <Stat tone="butter" icon="undo" label="Returned to clients" value={usd(t.returned)} sub="refunds and unused holds" />
        <Stat tone="lav" icon="file" label="Contracts" value={String(t.jobs)} sub="created so far" />
      </section>

      <div className="cols">
        {jobs ? <JobList jobs={jobs} /> : <div className="card empty">Loading…</div>}
        <NewJob onCreated={(id) => { reload(); location.hash = `#/jobs/${id}`; }} />
      </div>

      <section id="how" aria-label="How it works">
        <div className="section-h"><h2>How ProofPay works</h2></div>
        <div className="how">
          {STEPS.map(([title, text], i) => (
            <div key={title}><span className="n">{i + 1}</span><b>{title}</b><p>{text}</p></div>
          ))}
        </div>
      </section>
    </>
  );
}
