import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon } from './ui';

export type Theme = 'light' | 'dark';
const KEY = 'proofpay-theme';

function current(): Theme {
  // index.html already set data-theme before first paint (saved choice, else the system preference).
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} });
export const useTheme = () => useContext(Ctx);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(current);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch { /* private mode: the choice just will not persist */ }
  }, [theme]);

  // Follow the OS only until the user makes an explicit choice.
  useEffect(() => {
    const m = matchMedia('(prefers-color-scheme: dark)');
    const on = (e: MediaQueryListEvent) => {
      let saved: string | null = null;
      try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }
      if (!saved) setTheme(e.matches ? 'dark' : 'light');
    };
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button className="iconbtn" onClick={toggle} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}
