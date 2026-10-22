import type { AuditEvent, Job } from '../api';
import { describeEvent } from '../events';
import { cents, timeAgo, usd } from '../format';
import { Badge } from '../ui';

// ---------------- stepper ----------------
export function Stepper({ job }: { job: Job }) {
  const s = job.status;
  const last = s === 'refunded' ? 'Refunded' : s === 'paid' ? 'Paid out' : s === 'settled' ? 'Settled' : 'Settlement';
  const labels = ['Contract', 'Funds held', 'Work verified', last];
  let now = 0;
  let done = 0;
  let bad = -1;
  if (s === 'awaiting_funds') { now = 1; done = 1; }
  else if (s === 'funded') { now = 2; done = 2; }
  else if (s === 'escalated') { now = 3; done = 3; }
  else if (s === 'payout_failed') { done = 3; bad = 3; now = -1; }
  else if (['paid', 'settled', 'refunded'].includes(s)) { done = 4; now = -1; }
  else if (s === 'rejected') { bad = 0; now = -1; }
  return (
    <ol className="stepper" aria-label="Progress">
      {labels.map((l, i) => (
        <li key={l} className={`step ${i === bad ? 'bad' : i < done ? 'done' : i === now ? 'now' : ''}`} aria-current={i === now ? 'step' : undefined}>
          <span className="dot">{i < done && i !== bad ? '✓' : i === bad ? '!' : ''}</span>{l}
        </li>
      ))}
    </ol>
  );
}

// ---------------- contract ----------------
export function ContractCard({ job }: { job: Job }) {
  const c = job.contract;
  const hidden = job.viewer?.hiddenTests ?? 0;
  return (
    <section className="card" aria-label="Contract">
      <header>
        <h2>Contract</h2>
        <Badge tone="info" plain>{c.kind === 'code' ? 'Verified by running tests' : c.deliverableType === 'image' ? 'AI looks at the picture' : 'Verified by AI review'}</Badge>
      </header>
      <p className="muted">{c.summary}</p>
      <p className="small" style={{ marginTop: 10 }}><b>Deliverable:</b> {c.deliverableSpec}</p>
      <p className="small"><b>Attempts allowed:</b> {c.maxAttempts}</p>
      {job.attachments && job.attachments.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Reference images ({job.attachments.length})</div>
          <ul className="thumbs ref" aria-label="Reference images">
            {job.attachments.map((a) => (
              <li key={a.idx}>
                <a href={`/api/jobs/${job.id}/attachments/${a.idx}`} target="_blank" rel="noreferrer" title={a.name}>
                  <img src={`/api/jobs/${job.id}/attachments/${a.idx}`} alt={a.name} loading="lazy" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {c.kind === 'code' && c.code && (
        <details className="more" style={{ marginTop: 10 }}>
          <summary>{hidden > 0 ? `${c.code.cases.length} example tests for ` : `${c.code.cases.length} acceptance tests for `}<code>{c.code.functionName}()</code>{hidden > 0 ? ` (${hidden} more are hidden)` : ''}</summary>
          <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
            {c.code.cases.map((t, i) => (
              <div key={i} className="small mono">
                {t.label ?? `case ${i + 1}`}: {c.code!.functionName}({t.args.map((a) => JSON.stringify(a)).join(', ')}) → {JSON.stringify(t.expected)}
              </div>
            ))}
          </div>
        </details>
      )}
      {c.kind === 'rubric' && c.rubric && (
        <details className="more" open style={{ marginTop: 10 }}>
          <summary>Rubric (pass at {Math.round(c.rubric.passScore * 100)}%)</summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {c.rubric.criteria.map((x) => <li key={x.id} className="small">{x.description} <span className="faint">(weight {x.weight})</span></li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

// ---------------- verification history ----------------
export function Attempts({ job }: { job: Job }) {
  if (job.verdicts.length === 0) return null;
  return (
    <section className="card" aria-label="Verification results">
      <header><h2>Verification</h2><span className="faint">{job.attempts} of {job.contract.maxAttempts} attempts used</span></header>
      <div className="stack" style={{ gap: 10 }}>
        {job.verdicts.map((v, i) => (
          <details className="attempt" key={i} open={i === job.verdicts.length - 1}>
            <summary>
              <Badge tone={v.passed ? 'good' : 'bad'}>{v.passed ? 'Passed' : 'Failed'}</Badge>
              <span style={{ flex: 1 }}>Attempt {i + 1}</span>
              <span className="score">{Math.round(v.score * 100)}%</span>
            </summary>
            <div className="body">
              {v.checks.map((c, k) => (
                <div className="check" key={k}>
                  <span className={c.passed ? 'ok' : 'no'} aria-label={c.passed ? 'passed' : 'failed'}>{c.passed ? '✓' : '✗'}</span>
                  <div>{c.name}<div className="d">{c.detail}</div></div>
                </div>
              ))}
              {job.deliveries?.some((x) => x.attempt === i + 1) && (
                <ul className="thumbs ref" aria-label={`Image submitted in attempt ${i + 1}`}>
                  <li>
                    <a href={`/api/jobs/${job.id}/deliveries/${i + 1}`} target="_blank" rel="noreferrer" title="Open the submitted image">
                      <img src={`/api/jobs/${job.id}/deliveries/${i + 1}`} alt={`Submitted in attempt ${i + 1}`} loading="lazy" />
                    </a>
                  </li>
                </ul>
              )}
              {!v.passed && <div className="notice warn small" style={{ marginTop: 6 }}><b>Feedback to worker:</b> {v.feedback}</div>}
            </div>
          </details>
        ))}
        {job.lastDeliverable && !job.deliveries?.length && (
          <details className="more">
            <summary>Latest submission</summary>
            <pre className="pre">{job.lastDeliverable}</pre>
          </details>
        )}
      </div>
    </section>
  );
}

// ---------------- money ----------------
export function MoneyCard({ job }: { job: Job }) {
  const total = cents(job.amount.value);
  const st = job.settlement;
  const w = st ? cents(st.workerAmount.value) : 0;
  const cl = st ? cents(st.clientAmount.value) : 0;
  const held = job.status === 'funded' || job.status === 'escalated';
  const pctOf = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <section className="money" aria-label="Money">
      <header><h2>Money</h2><span className="faint">{job.amount.currency}</span></header>
      <div className="bigmoney">{usd(job.amount.value, job.amount.currency)}</div>
      <div className="flow-bar" role="img" aria-label="Where the money is">
        {held && <span className="seg-held" style={{ width: '100%' }} />}
        {st && <><span className="seg-worker" style={{ width: pctOf(w) }} /><span className="seg-client" style={{ width: pctOf(cl) }} /></>}
      </div>
      <div className="legend">
        {held && <span><i style={{ background: '#e3ae4f' }} />Held by PayPal - client is not charged yet</span>}
        {!held && !st && <span>Nothing is held or charged yet.</span>}
        {st && <span><i className="seg-worker" />Worker {usd(w)}</span>}
        {st && cl > 0 && <span><i className="seg-client" />Back to client {usd(cl)}</span>}
      </div>
      <dl className="kv">
        <dt>Worker</dt><dd>{job.workerEmail}</dd>
        {job.orderId && <><dt>PayPal order</dt><dd className="mono">{job.orderId}</dd></>}
        {job.authorizationId && <><dt>Authorization</dt><dd className="mono">{job.authorizationId}</dd></>}
        {job.authorizationExpiresAt && <><dt>Hold expires</dt><dd>{new Date(job.authorizationExpiresAt).toLocaleDateString()}</dd></>}
        {job.captureId && <><dt>Capture</dt><dd className="mono">{job.captureId}</dd></>}
        {job.payoutBatchId && <><dt>Payout batch</dt><dd className="mono">{job.payoutBatchId}</dd></>}
        {job.payoutStatus && <><dt>Payout status</dt><dd>{job.payoutStatus}</dd></>}
      </dl>
    </section>
  );
}

// ---------------- audit timeline ----------------
export function Timeline({ events }: { events: AuditEvent[] }) {
  return (
    <section className="card" aria-label="Audit trail">
      <header><h2>Audit trail</h2><span className="faint">every action, who did it</span></header>
      <ul className="timeline">
        {events.map((e) => {
          const d = describeEvent(e);
          return (
            <li key={e.seq}>
              <span className={`pip ${d.tone}`} />
              <div>{d.text}</div>
              <div className="who">{e.actor} · {timeAgo(e.ts)} · #{e.seq}</div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
