import { useCallback, useEffect, useState } from 'react';
import { api, type JobView } from '../api';
import { usd } from '../format';
import { StatusBadge, useToast } from '../ui';
import { ActionCard, type Run, type Side } from './JobActions';
import { Attempts, ContractCard, MoneyCard, Stepper, Timeline } from './JobParts';

const FINAL = ['paid', 'settled', 'refunded', 'rejected'];

export function JobPage({ id, error }: { id: string; error?: string }) {
  const [view, setView] = useState<JobView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [chosen, setChosen] = useState<Side | null>(null);
  const toast = useToast();

  useEffect(() => {
    let live = true;
    api.job(id).then((v) => live && setView(v)).catch(() => live && setMissing(true));
    return () => { live = false; };
  }, [id]);

  useEffect(() => { if (error) toast(error, true); }, [error, toast]);

  // Keep the page current while something is still moving: the other person acts, or PayPal finishes a payout.
  const status = view?.job.status;
  const payoutPending = ['PENDING', 'PROCESSING'].includes(view?.job.payoutStatus ?? '');
  const live = !!view && !busy && (!FINAL.includes(status!) || payoutPending);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => api.job(id).then(setView).catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [live, id]);

  const run: Run = useCallback(async (label, fn, ok) => {
    setBusy(label);
    try {
      const v = await fn();
      setView(v);
      if (ok) toast(ok(v));
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  }, [toast]);

  if (missing) return <div className="card empty">Job not found. It may belong to another browser. <a href="#/" style={{ textDecoration: 'underline' }}>Back to overview</a></div>;
  if (!view) return <div className="card empty">Loading…</div>;

  const { job, events } = view;
  const roles = job.viewer?.roles ?? [];
  const both = roles.includes('client') && roles.includes('worker');
  const natural: Side = roles.includes('client') ? 'client' : roles.includes('worker') ? 'worker' : 'viewer';
  const side: Side = chosen && (chosen === 'viewer' ? natural === 'viewer' : roles.includes(chosen)) ? chosen : natural;

  return (
    <>
      <div className="jobhead">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Contract · #{job.id.slice(0, 8)}</div>
          <h2>{job.contract.title}</h2>
        </div>
        <div className="row"><span className="bigamt">{usd(job.amount.value, job.amount.currency)}</span><StatusBadge status={job.status} /></div>
      </div>

      <div className="rolebar" aria-label="Your role on this job">
        {both ? (
          <>
            <span className="faint">Viewing as</span>
            <div className="filters" role="group" aria-label="Viewing as">
              {(['client', 'worker'] as const).map((s) => (
                <button key={s} className="filter" aria-pressed={side === s} onClick={() => setChosen(s)}>{s === 'client' ? 'Client' : 'Worker'}</button>
              ))}
            </div>
          </>
        ) : (
          <span className="rolechip">
            {side === 'client' ? 'You are the client on this job' : side === 'worker' ? 'You are the worker on this job' : 'Read-only sample'}
          </span>
        )}
      </div>

      <Stepper job={job} />

      <div className="cols">
        <div className="stack">
          <ActionCard view={view} side={side} busy={busy} run={run} onSide={setChosen} />
          <ContractCard job={job} />
          <Attempts job={job} />
        </div>
        <div className="stack">
          <MoneyCard job={job} />
          <Timeline events={events} />
        </div>
      </div>
    </>
  );
}
