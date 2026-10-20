import { useState } from 'react';
import type { Job } from '../api';
import { useApp } from '../data';
import { needsAttention, shortId, timeAgo, usd } from '../format';
import { Icon, StatusBadge } from '../ui';

function Row({ job }: { job: Job }) {
  return (
    <a className="jobrow" href={`#/jobs/${job.id}`}>
      <span className="tile" aria-hidden="true">{job.contract.kind === 'code' ? '</>' : 'Aa'}</span>
      <div style={{ minWidth: 0 }}>
        <div className="t">{job.contract.title}</div>
        <div className="faint">{job.contract.kind === 'code' ? 'Code · tested' : 'Writing · reviewed'} · #{shortId(job.id)} · {timeAgo(job.createdAt)}</div>
      </div>
      <StatusBadge status={job.status} />
      <span className="amt">{usd(job.amount.value, job.amount.currency)}</span>
      <span className="chev"><Icon name="chev" /></span>
    </a>
  );
}

type Filter = 'all' | 'attention' | 'open' | 'done';
const isDone = (j: Job) => ['paid', 'settled', 'refunded', 'rejected'].includes(j.status);

export function JobList({ jobs }: { jobs: Job[] }) {
  const { query } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const q = query.trim().toLowerCase();
  const matches = (j: Job) => !q || `${j.contract.title} ${j.status} ${j.id}`.toLowerCase().includes(q);

  const attention = jobs.filter((j) => needsAttention(j) && matches(j));
  const list = jobs.filter((j) => matches(j) && (filter === 'all' ? !needsAttention(j) : filter === 'attention' ? needsAttention(j) : filter === 'open' ? !isDone(j) && !needsAttention(j) : isDone(j)));
  const filters: [Filter, string][] = [['all', 'All'], ['attention', `Needs attention (${jobs.filter(needsAttention).length})`], ['open', 'In progress'], ['done', 'Completed']];

  return (
    <div className="stack">
      {attention.length > 0 && filter === 'all' && (
        <section className="attn" id="attention" aria-label="Needs your attention">
          <h2>Needs your attention ({attention.length})</h2>
          <div className="jobs">{attention.map((j) => <Row key={j.id} job={j} />)}</div>
        </section>
      )}
      <section aria-label="Jobs">
        <div className="section-h">
          <h2>Jobs</h2>
          <div className="filters" role="group" aria-label="Filter jobs">
            {filters.map(([k, label]) => <button key={k} className="filter" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>)}
          </div>
        </div>
        {list.length === 0 ? (
          <div className="card soft empty">{jobs.length === 0 ? 'No jobs yet. Post your first one on the right.' : 'Nothing matches.'}</div>
        ) : (
          <div className="jobs">{list.map((j) => <Row key={j.id} job={j} />)}</div>
        )}
      </section>
    </div>
  );
}
