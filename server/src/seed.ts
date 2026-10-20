import type { JobService } from './core/jobs';
import type { Store } from './core/store';
import { money } from './money';
import type { MockPaymentProvider } from './payments/mock';

const GOOD_SUM_EVENS = 'function sumEvens(a){ return a.filter(x => x % 2 === 0).reduce((s, x) => s + x, 0); }';
const BAD_FIZZ = "function fizzBuzz(n){ const r = []; for (let i = 1; i <= n; i++) r.push(i % 3 === 0 ? 'Fizz' : i % 5 === 0 ? 'Buzz' : String(i)); return r; }";

/**
 * Fills an EMPTY simulator database with a few jobs in different states so first-time visitors
 * (and the Ledger) have something to look at. Never used with real PayPal: its IDs would be fake.
 */
export async function seedDemo(jobs: JobService, mock: MockPaymentProvider, store: Store): Promise<boolean> {
  if (store.listJobs().length > 0) return false;
  const usd = (v: string) => money(v);
  const fund = async (request: string, amount: string) => {
    const j = await jobs.createJob({ request, amount: usd(amount) });
    mock.approve(j.orderId!);
    return jobs.confirmFunding(j.id, j.orderId);
  };

  // 1. clean pass -> paid
  const a = await fund('Write a JavaScript function called sumEvens that returns the sum of the even numbers in an array.', '120.00');
  await jobs.autoWork(a.id);

  // 2. partial work -> AI arbiter pays a proportional share
  const b = await fund('Write a JavaScript function called fizzBuzz(n) that returns FizzBuzz strings from 1 to n.', '80.00');
  for (let i = 0; i < b.contract.maxAttempts; i++) await jobs.submit(b.id, BAD_FIZZ);

  // 3. no real work -> hold released, client never charged
  const c = await fund('Write a short product description for a reusable bamboo water bottle, mentioning sustainability and insulation.', '60.00');
  for (let i = 0; i < c.contract.maxAttempts; i++) await jobs.submit(c.id, 'TODO');

  // 4. waiting for the client's PayPal approval
  await jobs.createJob({ request: 'Write a JavaScript function called isPalindrome that ignores case, spaces and punctuation.', amount: usd('45.00') });

  // 5. above the auto-approve limit -> waiting for a human
  await jobs.createJob({ request: 'Write a JavaScript function called factorial that returns n! for non-negative integers.', amount: usd('300.00') });
  return true;
}
