import { useState } from 'react';
import type { Job } from '../api';
import { useApp } from '../data';
import { needsAttention, shortId, timeAgo, usd } from '../format';
import { Icon, StatusBadge } from '../ui';

/** Which side of the job this browser is on, shown next to the id. */
const roleTag = (job: Job) => {
  const v = job.viewer;
  if (v?.sample) return ' · Sample';
  if (v && v.roles.length === 1 && v.roles[0] === 'worker') return ' · You are the worker';
  return '';
};

function Row({ job }: { job: Job }) {
  return (
    <a className="jobrow" href={`#/jobs/${job.id}`}>
      <div className="name">
        <span className="tile" aria-hidden="true">{job.contract.kind === 'code' ? '</>' : job.contract.deliverableType === 'image' ? 'Img' : 'Aa'}</span>
        <div style={{ minWidth: 0 }}>
          <div className="t">{job.contract.title}</div>
          <div className="faint">{job.contract.kind === 'code' ? 'Code · tested' : job.contract.deliverableType === 'image' ? 'Image · reviewed' : 'Writing · reviewed'} · #{shortId(job.id)}{roleTag(job)}</div>
        </div>
      </div>
      <span><StatusBadge status={job.status} /></span>
      <span className="amt">{usd(job.amount.value, job.amount.currency)}</span>
      <span className="when">{timeAgo(job.createdAt)}</span>
      <span className="chev"><Icon name="chev" /></span>
    </a>
  );
}

const Head = () => (
  <div className="thead" aria-hidden="true"><span>Job</span><span>Status</span><span>Amount</span><span style={{ textAlign: 'right' }}>Created</span><span /></div>
);

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
          <div>{attention.map((j) => <Row key={j.id} job={j} />)}</div>
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
          <div className="card soft empty">{jobs.length === 0 ? 'No jobs yet. Post your first one above. Your jobs are private to this browser.' : 'Nothing matches.'}</div>
        ) : (
          <div className="table"><Head />{list.map((j) => <Row key={j.id} job={j} />)}</div>
        )}
      </section>
    </div>
  );
}
