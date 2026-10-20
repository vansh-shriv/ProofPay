import { useEffect, useState } from 'react';
import { api, type Job } from '../api';
import { totals, usd } from '../format';
import { useToast } from '../ui';
import { JobList } from './JobList';
import { NewJob } from './NewJob';

export function Home() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const toast = useToast();

  useEffect(() => {
    let live = true;
    const load = () => api.jobs().then((j) => live && setJobs(j)).catch((e) => toast(e.message, true));
    load();
    const t = setInterval(load, 4000);
    return () => { live = false; clearInterval(t); };
  }, [toast]);

  const t = totals(jobs ?? []);
  return (
    <main className="page">
      <section className="hero">
        <h1>Pay only when the work is proven.</h1>
        <p className="muted">
          ProofPay holds your money with PayPal, lets a worker (human or AI agent) do the job, then <b>actually checks the work</b>: code is run against tests,
          writing is reviewed against a rubric. Pass and the worker is paid automatically. Dispute and an AI arbiter splits the funds fairly.
        </p>
      </section>

      <div className="stats" aria-label="Totals">
        <div className="stat held"><div className="label">Held by PayPal</div><div className="value">{usd(t.held)}</div><div className="sub">authorized, not yet charged</div></div>
        <div className="stat paid"><div className="label">Paid to workers</div><div className="value">{usd(t.paidOut)}</div><div className="sub">after verification</div></div>
        <div className="stat"><div className="label">Returned to clients</div><div className="value">{usd(t.returned)}</div><div className="sub">refunds and unused holds</div></div>
        <div className="stat"><div className="label">Contracts</div><div className="value">{t.jobs}</div><div className="sub">total</div></div>
      </div>

      <div className="how" aria-label="How it works">
        <div><b>Describe</b>AI writes a contract with tests or a rubric.</div>
        <div><b>Hold</b>PayPal authorizes the funds. Nothing is charged yet.</div>
        <div><b>Prove</b>The worker submits. The verifier runs it for real.</div>
        <div><b>Release</b>Pass: auto-capture and payout. Dispute: AI arbiter.</div>
      </div>

      <div className="grid-2">
        <NewJob onCreated={(id) => { location.hash = `#/jobs/${id}`; }} />
        {jobs ? <JobList jobs={jobs} /> : <div className="card empty">Loading…</div>}
      </div>
    </main>
  );
}
