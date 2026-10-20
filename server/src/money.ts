export interface Money {
  currency: string; // ISO 4217, e.g. "USD"
  value: string; // decimal string with 2 places, e.g. "120.50"
}

const VALUE_RE = /^\d+(\.\d{1,2})?$/;

/** Parse a decimal string into integer cents (avoids float errors on money). */
export function toCents(value: string): number {
  if (!VALUE_RE.test(value)) throw new Error(`Invalid money value "${value}"`);
  const [whole, frac = ''] = value.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export function fromCents(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`Invalid cents ${cents}`);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function money(value: string | number, currency = 'USD'): Money {
  const v = typeof value === 'number' ? fromCents(Math.round(value * 100)) : fromCents(toCents(value));
  return { currency, value: v };
}

/** Split `total` by a worker share in basis points (0..10000). Cents always sum to total. */
export function splitByBps(total: Money, workerBps: number): { worker: Money; client: Money } {
  if (!Number.isInteger(workerBps) || workerBps < 0 || workerBps > 10000) {
    throw new Error('workerBps must be an integer 0..10000');
  }
  const t = toCents(total.value);
  const w = Math.floor((t * workerBps) / 10000);
  return {
    worker: { currency: total.currency, value: fromCents(w) },
    client: { currency: total.currency, value: fromCents(t - w) },
  };
}
