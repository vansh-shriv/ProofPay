import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { JobStatus } from './api';
import { STATUS_LABEL, STATUS_TONE, type Tone } from './format';

// ---------------- icons (24px grid, 1.8 stroke) ----------------
const ICONS = {
  overview: <><rect x="3" y="3" width="7.5" height="7.5" rx="2.2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2.2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2.2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.2" /></>,
  ledger: <><rect x="3" y="4" width="18" height="16" rx="3.5" /><path d="M3 9.5h18M9 9.5V20" /></>,
  policy: <><path d="M12 3l7.5 2.8v5.7c0 4.4-3 7.6-7.5 9.5-4.5-1.9-7.5-5.1-7.5-9.5V5.8z" /><path d="M9 12l2.2 2.2L15.5 10" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  bell: <><path d="M6 9a6 6 0 1112 0c0 5 2 6.5 2 6.5H4S6 14 6 9z" /><path d="M10 19a2 2 0 004 0" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  chev: <path d="M9 6l6 6-6 6" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="3" /><path d="M8 10.5V8a4 4 0 018 0v2.5" /></>,
  wallet: <><path d="M4 7.5A2.5 2.5 0 016.5 5H18v3" /><rect x="3.5" y="8" width="17" height="11.5" rx="3" /><circle cx="16.5" cy="13.8" r="1.1" /></>,
  undo: <><path d="M8 8H4V4" /><path d="M4.5 8A8.5 8.5 0 1112 20.5" /></>,
  file: <><path d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
} satisfies Record<string, ReactNode>;
export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/** Brand mark: a shield with a check. `dark` = charcoal on a light tile, `light` = cream on a dark tile. */
export function Logo({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const fg = tone === 'dark' ? '#1b1b1f' : '#f6efd2';
  const bg = tone === 'dark' ? '#f6efd2' : '#1b1b1f';
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3.5l10 3.7v8.3c0 6-4.2 10.4-10 13-5.8-2.6-10-7-10-13V7.2z" fill={fg} />
      <path d="M11.2 15.8l3.6 3.6 6.2-7" fill="none" stroke={bg} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Badge({ tone = 'neutral', children, plain }: { tone?: Tone; children: ReactNode; plain?: boolean }) {
  return <span className={`badge ${tone}${plain ? ' plain' : ''}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: JobStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function Busy({ children }: { children: ReactNode }) {
  return (
    <div className="notice" role="status" aria-live="polite" style={{ display: 'grid', gap: 12, padding: 20 }}>
      <span>{children}</span>
      <div className="progress"><i /></div>
    </div>
  );
}

// ---------------- toasts ----------------
interface Toast { id: number; text: string; bad?: boolean }
const ToastCtx = createContext<(text: string, bad?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, bad?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, bad }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), bad ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.bad ? ' bad' : ''}`} role={t.bad ? 'alert' : 'status'}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
