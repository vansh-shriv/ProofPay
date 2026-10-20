import { useEffect, useState } from 'react';
import { api, type Policy } from '../api';
import { Icon, useToast } from '../ui';

type Field = { key: keyof Policy; label: string; help: string; kind: 'usd' | 'ratio' };
const FIELDS: Field[] = [
  { key: 'autoApproveMaxCents', label: 'Auto-approve up to', help: 'Jobs at or below this are funded without asking you.', kind: 'usd' },
  { key: 'hardMaxCents', label: 'Hard limit per job', help: 'Anything above this is refused outright.', kind: 'usd' },
  { key: 'dailyBudgetCents', label: 'Daily budget', help: 'Total new jobs allowed per day (UTC).', kind: 'usd' },
  { key: 'arbiterAutoLimitCents', label: 'AI may rule alone up to', help: 'Disputes on bigger jobs wait for your sign-off before any money moves.', kind: 'usd' },
  { key: 'arbiterMinConfidence', label: 'Min. AI confidence to rule alone', help: 'Below this (0 to 1) the AI must ask you.', kind: 'ratio' },
];

export function PolicyPage() {
  const [p, setP] = useState<Policy | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const toast = useToast();

  useEffect(() => {
    api.policy().then((pol) => { setP(pol); setDraft(toDraft(pol)); }).catch((e) => toast(e.message, true));
  }, [toast]);

  if (!p) return <div className="card empty">Loading…</div>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const next = { ...p! };
      for (const f of FIELDS) {
        const n = Number(draft[f.key]);
        if (!Number.isFinite(n) || n < 0) throw new Error(`${f.label} must be a non-negative number`);
        (next as any)[f.key] = f.kind === 'usd' ? Math.round(n * 100) : n;
      }
      const saved = await api.setPolicy(next);
      setP(saved);
      setDraft(toDraft(saved));
      toast('Policy saved. It applies to the next job.');
    } catch (err) {
      toast((err as Error).message, true);
    }
  }

  return (
    <div className="cols">
      <form className="card shadow stack" onSubmit={save} aria-label="Policy" style={{ gap: 22 }}>
        <header style={{ marginBottom: 0 }}><h2>Guardrails</h2></header>
        <div className="policy-grid">
          {FIELDS.map((f) => (
            <label className="field" key={f.key}>
              {f.label}{f.kind === 'usd' ? ' (USD)' : ''}
              <input value={draft[f.key] ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} inputMode="decimal" name={f.key} />
              <span className="faint" style={{ fontWeight: 400 }}>{f.help}</span>
            </label>
          ))}
        </div>
        <div><button className="btn primary lg">Save policy<Icon name="arrow" /></button></div>
      </form>
      <aside className="money" aria-label="Why guardrails">
        <header><h2>Why guardrails?</h2></header>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.25 }}>Let an AI agent spend money without losing control.</div>
        <p style={{ color: '#b7b9c6', fontSize: 14.5 }}>
          Every job is checked against these rules before PayPal is touched. Small jobs flow through on their own. Anything bigger, or any ruling the AI is unsure about, stops and waits for a human. Every decision is written to the audit log.
        </p>
      </aside>
    </div>
  );
}

function toDraft(p: Policy): Record<string, string> {
  return Object.fromEntries(FIELDS.map((f) => [f.key, f.kind === 'usd' ? (p[f.key] / 100).toFixed(2) : String(p[f.key])]));
}
