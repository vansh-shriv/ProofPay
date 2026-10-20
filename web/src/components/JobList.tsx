import type { Job } from '../api';
import { needsAttention, shortId, timeAgo, usd } from '../format';
import { StatusBadge } from '../ui';

function Row({ job }: { job: Job }) {
  return (
    <a className="jobrow" href={`#/jobs/${job.id}`}>
      <div style={{ minWidth: 0 }}>
        <div className="t">{job.contract.title}</div>
        <div className="faint">
          {job.contract.kind === 'code' ? 'Code, verified by running tests' : 'Written work, AI-reviewed'} · #{shortId(job.id)} · {timeAgo(job.createdAt)}
        </div>
      </div>
      <span className="amt">{usd(job.amount.value, job.amount.currency)}</span>
      <StatusBadge status={job.status} />
    </a>
  );
}

export function JobList({ jobs }: { jobs: Job[] }) {
  const attention = jobs.filter(needsAttention);
  const rest = jobs.filter((j) => !needsAttention(j));
  return (
    <div className="stack">
      {attention.length > 0 && (
        <section className="card attention" aria-label="Needs your attention">
          <header><h2>Needs your attention ({attention.length})</h2></header>
          <div className="joblist">{attention.map((j) => <Row key={j.id} job={j} />)}</div>
        </section>
      )}
      <section className="card" aria-label="Jobs">
        <header><h2>Jobs</h2><span className="faint">{jobs.length} total</span></header>
        {rest.length === 0 && attention.length === 0 ? (
          <div className="empty">No jobs yet. Pick an example on the left and create your first contract.</div>
        ) : (
          <div className="joblist">{rest.map((j) => <Row key={j.id} job={j} />)}</div>
        )}
      </section>
    </div>
  );
}
