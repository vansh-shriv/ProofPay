import { useRef, useState, type ReactNode } from 'react';
import { api, type Job, type JobView, type UploadImage } from '../api';
import { usd } from '../format';
import { prepareImage, type PreparedImage } from '../images';
import { Busy, Icon, useToast } from '../ui';

export type Run = (label: string, fn: () => Promise<JobView>, ok?: (v: JobView) => string) => Promise<void>;
/** Which side of the job the screen is showing. "viewer" = a read-only sample. */
export type Side = 'client' | 'worker' | 'viewer';

export function resultToast(v: JobView): string {
  const j = v.job;
  if (j.status === 'paid') return 'Verified. Worker paid.';
  if (j.status === 'settled') return 'Attempts used up. Arbiter split the funds.';
  if (j.status === 'refunded') return 'No valid work. Hold released to the client.';
  if (j.status === 'payout_failed') return 'Verified, but the payout failed. See the job.';
  if (j.status === 'escalated') return 'The arbiter needs the client\'s sign-off.';
  const f = j.verdicts.at(-1);
  return f && !f.passed ? `Failed at ${Math.round(f.score * 100)}%. The worker can retry with feedback.` : 'Done.';
}

function Waiting({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card shadow" aria-label={title}>
      <header><h2>{title}</h2></header>
      <p className="muted">{children}</p>
    </section>
  );
}

/** The link the client sends to a human worker. */
function InviteBox({ job }: { job: Job }) {
  const toast = useToast();
  if (!job.workerToken) return null;
  const link = `${location.origin}/#/join/${job.id}/${job.workerToken}`;
  return (
    <div className="share">
      <input readOnly value={link} aria-label="Worker invite link" onFocus={(e) => e.currentTarget.select()} />
      <button
        className="btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            toast('Invite link copied. Send it to your worker.');
          } catch {
            toast('Select the link and copy it.', true);
          }
        }}
      >
        Copy link
      </button>
    </div>
  );
}

/** Both sides can open a dispute while the funds are held. */
function Dispute({ job, run }: { job: Job; run: Run }) {
  const [cClaim, setCClaim] = useState('');
  const [wClaim, setWClaim] = useState('');
  return (
    <details className="more" style={{ marginTop: 8 }}>
      <summary>Disagree? Open a dispute</summary>
      <div className="stack" style={{ gap: 10, marginTop: 8 }}>
        <label className="field">Client's claim<textarea value={cClaim} onChange={(e) => setCClaim(e.target.value)} style={{ minHeight: 64 }} /></label>
        <label className="field">Worker's claim<textarea value={wClaim} onChange={(e) => setWClaim(e.target.value)} style={{ minHeight: 64 }} /></label>
        <div><button className="btn danger" disabled={cClaim.trim().length < 3 || wClaim.trim().length < 3} onClick={() => run('AI arbiter is reviewing the evidence…', () => api.dispute(job.id, cClaim, wClaim))}>Ask the AI arbiter to rule</button></div>
        <p className="faint">The arbiter weighs objective verification results most and the claims least.</p>
      </div>
    </details>
  );
}

/** The worker's hand-in form: text or code for most jobs, a picture file for image jobs. */
function SubmitWork({ job, run }: { job: Job; run: Run }) {
  const isImage = job.contract.deliverableType === 'image';
  const [text, setText] = useState('');
  const [email, setEmail] = useState(job.workerEmail);
  const [image, setImage] = useState<PreparedImage | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const toast = useToast();

  async function pick(files: File[]) {
    const f = files.find((x) => x.type.startsWith('image/'));
    if (!f) return;
    try {
      setImage(await prepareImage(f));
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  const ready = isImage ? !!image : !!text.trim();
  const send = () => {
    const work: { deliverable?: string; image?: UploadImage; workerEmail?: string } = { workerEmail: email.trim() || undefined };
    if (isImage) work.image = { name: image!.name, type: image!.type, data: image!.data };
    else work.deliverable = text;
    return run(isImage ? 'The AI reviewer is looking at your picture…' : 'Verifying your submission…', () => api.submit(job.id, work), resultToast);
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      {isImage ? (
        <div className="fgroup">
          <span className="lbl" id="work-image">Your image file</span>
          <div className="dropzone" role="group" aria-labelledby="work-image">
            {image ? (
              <div className="dz-list">
                <ul className="thumbs" aria-label="Picture to submit">
                  <li>
                    <img src={image.preview} alt={image.name} />
                    <button type="button" aria-label="Remove the picture" onClick={() => setImage(null)}><Icon name="x" /></button>
                  </li>
                </ul>
              </div>
            ) : (
              <div className="dz-empty">
                <span className="dz-ico"><Icon name="image" /></span>
                <div><b>Upload the finished picture</b><span>PNG, JPEG, WebP or GIF. A link or a description is not accepted.</span></div>
                <button type="button" className="tool" onClick={() => file.current?.click()} aria-label="Browse for the picture">Browse</button>
              </div>
            )}
          </div>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden aria-label="Choose the picture" onChange={(e) => { pick([...(e.target.files ?? [])]); e.target.value = ''; }} />
        </div>
      ) : (
        <label className="fgroup">
          <span className="lbl">Your work</span>
          <textarea className={job.contract.kind === 'code' ? 'code' : ''} value={text} onChange={(e) => setText(e.target.value)} placeholder={job.contract.kind === 'code' ? `function ${job.contract.code?.functionName}(...) { ... }` : 'Paste the finished work itself (not a link to it)'} aria-label="Deliverable" />
        </label>
      )}
      <label className="fgroup">
        <span className="lbl">Your PayPal email (where you get paid)</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} name="workerEmail" autoComplete="email" />
      </label>
      <div><button className="btn primary" disabled={!ready} onClick={send}>Submit for verification</button></div>
    </div>
  );
}

export function ActionCard({ view, side, busy, run, onSide }: { view: JobView; side: Side; busy: string | null; run: Run; onSide: (s: Side) => void }) {
  const { job } = view;
  const [override, setOverride] = useState('50');
  const [payee, setPayee] = useState<string | undefined>(undefined);
  const left = job.contract.maxAttempts - job.attempts;
  const lastFail = job.verdicts.at(-1) && !job.verdicts.at(-1)!.passed ? job.verdicts.at(-1)! : undefined;
  const isImage = job.contract.deliverableType === 'image';
  const hasWorkerRole = !!job.viewer?.roles.includes('worker');

  if (busy) return <section className="card shadow"><Busy>{busy}</Busy></section>;
  if (side === 'viewer' && !['paid', 'settled', 'refunded', 'rejected'].includes(job.status)) {
    return <Waiting title="Sample job">This is a read-only example so you can see how a contract moves. Post your own job to try every step.</Waiting>;
  }

  switch (job.status) {
    case 'pending_approval':
      if (side !== 'client') return <Waiting title="Waiting for the client">The client's spending guardrail needs their approval before the money is held.</Waiting>;
      return (
        <section className="card shadow" aria-label="Approval needed">
          <header><h2>Your approval is needed</h2></header>
          <div className="notice warn">{job.note}</div>
          <p className="muted small" style={{ margin: '12px 0' }}>This is the spending guardrail. Nothing has been sent to PayPal yet.</p>
          <button className="btn primary" onClick={() => run('Creating the PayPal order…', () => api.approve(job.id), () => 'Approved. Now fund the job.')}>Approve this spend</button>
        </section>
      );

    case 'awaiting_funds':
      if (side !== 'client') return <Waiting title="Waiting for the client to fund the job">You can start as soon as the client has put the money on hold with PayPal. You will see it here.</Waiting>;
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
      if (side === 'worker') {
        return (
          <section className="card shadow" aria-label="Worker">
            <header><h2>Step 2: do the work</h2><span className="faint">{left} attempt{left === 1 ? '' : 's'} left</span></header>
            {lastFail && <div className="notice warn small" style={{ marginBottom: 12 }}><b>Last attempt failed.</b> {lastFail.feedback}</div>}
            <p className="muted" style={{ marginBottom: 14 }}>The funds are held by PayPal. You are paid automatically as soon as your work passes the checks.</p>
            <SubmitWork job={job} run={run} />
            {!isImage && (
              <details className="more" style={{ marginTop: 12 }}>
                <summary>Or let an AI agent do the work</summary>
                <div className="row" style={{ margin: '10px 0 2px' }}>
                  <button className="btn" onClick={() => run('Worker agent is drafting, then the sandbox verifier runs the checks…', () => api.autoWork(job.id, false), resultToast)}>Hire AI worker</button>
                </div>
              </details>
            )}
            <Dispute job={job} run={run} />
          </section>
        );
      }
      return (
        <section className="card shadow" aria-label="Put a worker on it">
          <header><h2>Step 2: put a worker on it</h2><span className="faint">{left} attempt{left === 1 ? '' : 's'} left</span></header>
          {lastFail && <div className="notice warn small" style={{ marginBottom: 12 }}><b>Last attempt failed.</b> {lastFail.feedback}</div>}
          <p className="muted">Funds are held. Choose who does the work. The verifier then checks it for real, and only passing work gets paid.</p>

          <div className="choice">
            <h3>Send it to a person</h3>
            <p className="muted small">Share this private link. Whoever opens it joins as the worker, enters their PayPal email and submits{isImage ? ' the picture' : ' the work'}.</p>
            <InviteBox job={job} />
          </div>

          {isImage ? (
            <div className="choice">
              <h3>AI worker</h3>
              <p className="muted small">AI workers cannot produce picture files yet, so this job needs a person to upload the image.</p>
            </div>
          ) : (
            <div className="choice">
              <h3>Hire an AI worker agent</h3>
              <div className="row" style={{ margin: '4px 0 0' }}>
                <button className="btn primary" onClick={() => run('Worker agent is drafting, then the sandbox verifier runs the checks…', () => api.autoWork(job.id, false), resultToast)}>Hire AI worker</button>
                <button className="btn" onClick={() => run('Rushed worker agent is drafting a quick first pass, then the verifier runs…', () => api.autoWork(job.id, true), resultToast)} title="Simulates a rushed worker: likely fails first, then fixes it using the verifier's feedback">
                  Hire rushed AI worker
                </button>
              </div>
            </div>
          )}

          <details className="more" style={{ marginTop: 12 }}>
            <summary>Trying this alone? Play the worker yourself</summary>
            <p className="muted small" style={{ margin: '8px 0' }}>For demos: you act as the worker on your own job. In real use, send the link above to another person.</p>
            <button className="btn" onClick={() => run('Switching to the worker side…', () => api.join(job.id, { demo: true }), () => { onSide('worker'); return 'You are now acting as the worker.'; })}>
              {hasWorkerRole ? 'Switch to the worker side' : 'Act as the worker'}
            </button>
          </details>
          <Dispute job={job} run={run} />
        </section>
      );

    case 'escalated': {
      const r = job.pendingRuling!;
      if (side !== 'client') {
        return <Waiting title="Waiting for the client's sign-off">The AI arbiter proposed paying the worker {(r.workerShareBps / 100).toFixed(0)}%. The client must confirm it before money moves.</Waiting>;
      }
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
      if (side !== 'client') return <Waiting title="Payout is being sorted out"><span>{job.note} The money is captured and safe; the client can retry the payout.</span></Waiting>;
      return (
        <section className="card shadow" aria-label="Payout failed">
          <header><h2>Payout needs a retry</h2></header>
          <div className="notice bad">{job.note}</div>
          <p className="muted small" style={{ margin: '12px 0' }}>The money is captured and safe. Retrying can never pay the worker twice.</p>
          <label className="fgroup" style={{ marginBottom: 14 }}>
            <span className="lbl">Worker's PayPal email</span>
            <input type="email" value={payee ?? job.workerEmail} onChange={(e) => setPayee(e.target.value)} name="workerEmail" />
          </label>
          <button className="btn primary" onClick={() => run('Retrying payout…', () => api.retryPayout(job.id, payee ?? job.workerEmail), (v) => v.job.status === 'payout_failed' ? 'Still failing, see the note.' : 'Payout sent.')}>Retry payout</button>
        </section>
      );

    case 'paid':
    case 'settled':
    case 'refunded':
      return (
        <section className="card shadow" aria-label="Result">
          <header><h2>{job.status === 'paid' ? (job.payoutStatus && job.payoutStatus !== 'SUCCESS' ? 'Work verified. Payout in progress.' : 'Work verified. Worker paid.') : job.status === 'settled' ? 'Dispute settled' : 'Hold released. Client keeps the money.'}</h2></header>
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
