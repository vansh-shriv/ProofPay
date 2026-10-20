import { MockAI } from '../server/src/ai/mock-ai';
import { JobService } from '../server/src/core/jobs';
import { DEFAULT_POLICY, type Policy } from '../server/src/core/policy';
import { Store } from '../server/src/core/store';
import { MockPaymentProvider } from '../server/src/payments/mock';
import type { PaymentProvider } from '../server/src/payments/types';

export const GOOD_SUM_EVENS = 'function sumEvens(a){ return a.filter(x=>x%2===0).reduce((s,x)=>s+x,0); }';
export const BAD_SUM_EVENS = 'function sumEvens(a){ return a.reduce((s,x)=>s+x,0); }';
export const JOB_REQUEST = 'Write a JavaScript function sumEvens that returns the sum of even numbers in an array';

export function makeEnv(opts: { policy?: Partial<Policy>; wrap?: (p: MockPaymentProvider) => PaymentProvider } = {}) {
  const store = new Store(':memory:');
  if (opts.policy) store.setPolicy({ ...DEFAULT_POLICY, ...opts.policy });
  const mock = new MockPaymentProvider('http://localhost:3000');
  const payments = opts.wrap ? opts.wrap(mock) : mock;
  const jobs = new JobService({ store, payments, ai: new MockAI(), appBaseUrl: 'http://localhost:3000', defaultWorkerEmail: 'worker@example.com' });
  return { store, mock, payments, jobs };
}

/** Create a job and walk it to the funded state (buyer approves in the simulated PayPal popup). */
export async function fundedJob(env: ReturnType<typeof makeEnv>, amount = '50.00', request = JOB_REQUEST) {
  const job = await env.jobs.createJob({ request, amount: { currency: 'USD', value: amount } });
  env.mock.approve(job.orderId!);
  return env.jobs.confirmFunding(job.id, job.orderId);
}
