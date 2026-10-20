import { useCallback, useEffect, useState } from 'react';
import { api, type JobView } from '../api';
import { usd } from '../format';
import { Busy, StatusBadge, useToast } from '../ui';
import { Attempts, ContractCard, MoneyCard, Stepper, Timeline } from './JobParts';

export function JobPage({ id, error }: { id: string; error?: string }) {
  const [view, setView] = useState<JobView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let live = true;
    api.job(id).then((v) => live && setView(v)).catch(() => live && setMissing(true));
    return () => { live = false; };
  }, [id]);

  useEffect(() => { if (error) toast(error, true); }, [error, toast]);

  const run = useCallback(async (label: string, fn: () => Promise<JobView>, ok?: (v: JobView) => string) => {
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

  if (missing) return <div className="card empty">Job not found. <a href="#/" style={{ textDecoration: 'underline' }}>Back to overview</a></div>;
  if (!view) return <div className="card empty">Loading…</div>;

  const { job, events } = view;
  return (
    <>
      <div className="jobhead">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Contract · #{job.id.slice(0, 8)}</div>
          <h2>{job.contract.title}</h2>
        </div>
        <div className="row"><span className="bigamt">{usd(job.amount.value, job.amount.currency)}</span><StatusBadge status={job.status} /></div>
      </div>
      <Stepper job={job} />

      <div className="cols">
        <div className="stack">
          <ActionCard view={view} busy={busy} run={run} />
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

type Run = (label: string, fn: () => Promise<JobView>, ok?: (v: JobView) => string) => Promise<void>;

function ActionCard({ view, busy, run }: { view: JobView; busy: string | null; run: Run }) {
  const { job } = view;
  const [manual, setManual] = useState('');
  const [cClaim, setCClaim] = useState('');
  const [wClaim, setWClaim] = useState('');
  const [override, setOverride] = useState('50');
  const left = job.contract.maxAttempts - job.attempts;
  const lastFail = job.verdicts.at(-1) && !job.verdicts.at(-1)!.passed ? job.verdicts.at(-1)! : undefined;

  if (busy) return <section className="card shadow"><Busy>{busy}</Busy></section>;

  switch (job.status) {
    case 'pending_approval':
      return (
        <section className="card shadow" aria-label="Approval needed">
          <header><h2>Your approval is needed</h2></header>
          <div className="notice warn">{job.note}</div>
          <p className="muted small" style={{ margin: '12px 0' }}>This is the spending guardrail. Nothing has been sent to PayPal yet.</p>
          <button className="btn primary" onClick={() => run('Creating the PayPal order…', () => api.approve(job.id), () => 'Approved. Now fund the job.')}>Approve this spend</button>
        </section>
      );

    case 'awaiting_funds':
      return (
        <section className="card shadow" aria-label="Fund the job">
          <header><h2>Step 1: hold the funds</h2></header>
          <p className="muted">You approve a <b>hold</b> with PayPal. <b>You are not charged</b> until the work is verified. If it never passes, the hold is released and you keep your money.</p>
          <div className="row" style={{ marginTop: 14 }}>
            <a className="btn primary lg" href={job.approveUrl} style={{ textDecoration: 'none' }}>
              Hold {usd(job.amount.value, job.amount.currency)} with PayPal
            </a>
          </div>
        </section>
      );

    case 'funded':
      return (
        <section className="card shadow" aria-label="Worker">
          <header><h2>Step 2: the work</h2><span className="faint">{left} attempt{left === 1 ? '' : 's'} left</span></header>
          {lastFail && <div className="notice warn small" style={{ marginBottom: 12 }}><b>Last attempt failed.</b> {lastFail.feedback}</div>}
          <p className="muted">Funds are held. Put a worker on it. An AI worker agent writes the deliverable, then the verifier checks it for real.</p>
          <div className="row" style={{ margin: '14px 0' }}>
            <button className="btn primary" onClick={() => run('Worker agent is drafting, then the sandbox verifier runs the checks…', () => api.autoWork(job.id, false), (v) => resultToast(v))}>
              Hire AI worker
            </button>
            <button className="btn" onClick={() => run('Rushed worker agent is drafting a quick first pass, then the verifier runs…', () => api.autoWork(job.id, true), (v) => resultToast(v))} title="Simulates a rushed worker: likely fails first, then fixes it using the verifier's feedback">
              Hire rushed AI worker
            </button>
          </div>
          <details className="more">
            <summary>Submit work manually (human worker)</summary>
            <div className="stack" style={{ gap: 10, marginTop: 8 }}>
              <textarea className={job.contract.kind === 'code' ? 'code' : ''} value={manual} onChange={(e) => setManual(e.target.value)} placeholder={job.contract.kind === 'code' ? `function ${job.contract.code?.functionName}(...) { ... }` : 'Paste the finished work here'} aria-label="Deliverable" />
              <div><button className="btn" disabled={!manual.trim()} onClick={() => run('Verifying your submission…', () => api.submit(job.id, manual), (v) => resultToast(v))}>Submit for verification</button></div>
            </div>
          </details>
          <details className="more" style={{ marginTop: 8 }}>
            <summary>Disagree? Open a dispute</summary>
            <div className="stack" style={{ gap: 10, marginTop: 8 }}>
              <label className="field">Client's claim<textarea value={cClaim} onChange={(e) => setCClaim(e.target.value)} style={{ minHeight: 64 }} /></label>
              <label className="field">Worker's claim<textarea value={wClaim} onChange={(e) => setWClaim(e.target.value)} style={{ minHeight: 64 }} /></label>
              <div><button className="btn danger" disabled={cClaim.trim().length < 3 || wClaim.trim().length < 3} onClick={() => run('AI arbiter is reviewing the evidence…', () => api.dispute(job.id, cClaim, wClaim))}>Ask the AI arbiter to rule</button></div>
              <p className="faint">The arbiter weighs objective verification results most and the claims least.</p>
            </div>
          </details>
        </section>
      );

    case 'escalated': {
      const r = job.pendingRuling!;
      return (
        <section className="card shadow" aria-label="Sign-off needed">
          <header><h2>Your sign-off is needed</h2></header>
          <div className="notice warn">{job.note}</div>
          <div style={{ margin: '14px 0' }}>
            <b>AI arbiter proposes: pay the worker {(r.workerShareBps / 100).toFixed(0)}%</b> <span className="faint">(confidence {Math.round(r.confidence * 100)}%)</span>
            <p className="muted small" style={{ marginTop: 6 }}>{r.reasoning}</p>
          </div>
          <div className="row">
            <button className="btn good" onClick={() => run('Settling…', () => api.resolve(job.id), () => 'Ruling approved. Money moved.')}>Approve ruling</button>
            <label className="row small"><span>or override: worker gets</span>
              <input style={{ width: 80 }} value={override} onChange={(e) => setOverride(e.target.value)} inputMode="numeric" aria-label="Worker share percent" />%
            </label>
            <button className="btn" onClick={() => run('Settling…', () => api.resolve(job.id, Math.round(Number(override) * 100)), () => 'Override applied. Money moved.')}>Apply override</button>
          </div>
        </section>
      );
    }

    case 'payout_failed':
      return (
        <section className="card shadow" aria-label="Payout failed">
          <header><h2>Payout needs a retry</h2></header>
          <div className="notice bad">{job.note}</div>
          <p className="muted small" style={{ margin: '12px 0' }}>The money is captured and safe. Retrying uses the same idempotency key, so the worker can never be paid twice.</p>
          <button className="btn primary" onClick={() => run('Retrying payout…', () => api.retryPayout(job.id), (v) => v.job.status === 'payout_failed' ? 'Still failing, see the note.' : 'Payout sent.')}>Retry payout</button>
        </section>
      );

    case 'paid':
    case 'settled':
    case 'refunded':
      return (
        <section className="card shadow" aria-label="Result">
          <header><h2>{job.status === 'paid' ? 'Work verified. Worker paid.' : job.status === 'settled' ? 'Dispute settled' : 'Hold released. Client keeps the money.'}</h2></header>
          <p className="muted">
            {job.status === 'paid' && `All checks passed, PayPal captured ${usd(job.amount.value)} and paid the worker automatically.`}
            {job.status === 'settled' && `Worker received ${usd(job.settlement!.workerAmount.value)}; ${usd(job.settlement!.clientAmount.value)} was released back to the client.`}
            {job.status === 'refunded' && 'No valid work was delivered, so the PayPal hold was voided. The client was never charged.'}
          </p>
          {job.ruling && <div className="notice small" style={{ marginTop: 12 }}><b>Arbiter's reasoning:</b> {job.ruling.reasoning}</div>}
        </section>
      );

    case 'rejected':
      return <section className="card shadow"><header><h2>Rejected by policy</h2></header><div className="notice bad">{job.note}</div></section>;
  }
}

function resultToast(v: JobView): string {
  const j = v.job;
  if (j.status === 'paid') return 'Verified. Worker paid.';
  if (j.status === 'settled') return 'Attempts used up. Arbiter split the funds.';
  if (j.status === 'refunded') return 'No valid work. Hold released to the client.';
  if (j.status === 'payout_failed') return 'Verified, but the payout failed. See the job.';
  if (j.status === 'escalated') return 'The arbiter needs your sign-off.';
  const f = j.verdicts.at(-1);
  return f && !f.passed ? `Failed at ${Math.round(f.score * 100)}%. The worker can retry with feedback.` : 'Done.';
}
