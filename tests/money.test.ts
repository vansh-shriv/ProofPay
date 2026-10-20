import { describe, expect, it } from 'vitest';
import { fromCents, money, splitByBps, toCents } from '../server/src/money';

describe('money', () => {
  it('converts without float error', () => {
    expect(toCents('0.10')).toBe(10);
    expect(toCents('19.99')).toBe(1999);
    expect(toCents('5')).toBe(500);
    expect(fromCents(1999)).toBe('19.99');
    expect(money(0.1 + 0.2).value).toBe('0.30');
  });
  it('rejects bad values', () => {
    for (const v of ['-1', '1.234', 'abc', '', '1,5']) expect(() => toCents(v)).toThrow();
  });
  it('splits always sum to total', () => {
    for (const total of ['100.00', '0.01', '33.33', '999.99']) {
      for (const bps of [0, 1, 3333, 5000, 7000, 9999, 10000]) {
        const s = splitByBps(money(total), bps);
        expect(toCents(s.worker.value) + toCents(s.client.value)).toBe(toCents(total));
      }
    }
    expect(splitByBps(money('100.00'), 7000).worker.value).toBe('70.00');
  });
  it('rejects invalid bps', () => {
    expect(() => splitByBps(money('1.00'), 10001)).toThrow();
    expect(() => splitByBps(money('1.00'), 0.5)).toThrow();
  });
});
