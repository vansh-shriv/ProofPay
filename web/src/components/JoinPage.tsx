import { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../data';

/** Opened from the invite link the client shares: attaches this browser to the job as the worker, then shows the job. */
export function JoinPage({ id, token }: { id: string; token: string }) {
  const { reload } = useApp();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.join(id, { token })
      .then(() => {
        if (!live) return;
        reload();
        location.replace(`#/jobs/${id}`);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [id, token, reload]);

  if (error) {
    return (
      <div className="card empty" role="alert">
        This invite link is not valid. Ask the client for a new link. <a href="#/" style={{ textDecoration: 'underline' }}>Back to overview</a>
      </div>
    );
  }
  return <div className="card empty">Joining the job…</div>;
}
