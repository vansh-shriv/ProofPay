import { useState } from 'react';
import { api } from '../api';
import { Icon, useToast } from '../ui';

const EXAMPLES: { label: string; amount: string; text: string }[] = [
  {
    label: 'Code: palindrome checker',
    amount: '45.00',
    text: 'Write a JavaScript function called isPalindrome that returns true if a string reads the same forwards and backwards, ignoring case, spaces and punctuation.',
  },
  {
    label: 'Code: FizzBuzz',
    amount: '30.00',
    text: 'Write a JavaScript function called fizzBuzz(n) that returns an array of strings for 1..n: "Fizz" for multiples of 3, "Buzz" for multiples of 5, "FizzBuzz" for both, otherwise the number as a string.',
  },
  {
    label: 'Writing: product copy',
    amount: '60.00',
    text: 'Write a short product description for a reusable bamboo water bottle, mentioning sustainability and insulation.',
  },
  {
    label: 'Over the limit (policy demo)',
    amount: '2500.00',
    text: 'Write a JavaScript function called factorial that returns n! for non-negative integers.',
  },
];

export function NewJob({ onCreated }: { onCreated: (id: string) => void }) {
  const [request, setRequest] = useState('');
  const [amount, setAmount] = useState('45.00');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { job } = await api.createJob(request, amount);
      toast(job.status === 'pending_approval' ? 'Contract ready. Policy needs your approval to spend.' : 'Contract written. Fund it to hold the money.');
      onCreated(job.id);
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="new-job" className="card shadow stack" onSubmit={submit} style={{ gap: 16, position: 'sticky', top: 96 }} aria-label="Post a job">
      <header style={{ marginBottom: 0 }}>
        <h2>Post a job</h2>
        <span className="faint">AI writes the contract</span>
      </header>
      <label className="field">
        What do you need done?
        <textarea
          id="job-request"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="Describe the work in plain English. The AI will write the acceptance tests."
          required
          minLength={10}
          maxLength={2000}
          name="request"
        />
      </label>
      <div className="chips" aria-label="Examples">
        {EXAMPLES.map((x) => (
          <button type="button" key={x.label} className="chip-btn" onClick={() => { setRequest(x.text); setAmount(x.amount); }}>
            {x.label}
          </button>
        ))}
      </div>
      <label className="field">
        Budget (USD)
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" pattern="\d+(\.\d{1,2})?" required name="amount" />
      </label>
      <button className="btn primary lg" disabled={busy}>
        {busy ? 'AI is writing the contract…' : <>Create contract<Icon name="arrow" /></>}
      </button>
    </form>
  );
}
