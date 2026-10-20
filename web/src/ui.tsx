import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { JobStatus } from './api';
import { STATUS_LABEL, STATUS_TONE, type Tone } from './format';

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0b5fff" />
      <path d="M16 5l9 3.5v7c0 5.2-3.6 9.2-9 11.5-5.4-2.3-9-6.3-9-11.5v-7z" fill="#fff" opacity=".95" />
      <path d="M11.5 15.8l3.3 3.3 6-6.6" fill="none" stroke="#0b5fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
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
    <div className="notice" role="status" aria-live="polite" style={{ display: 'grid', gap: 10 }}>
      <span>{children}</span>
      <div className="progress"><i /></div>
    </div>
  );
}

// ---------- toasts ----------
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
