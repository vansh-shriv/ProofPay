import { Icon } from '../ui';
import { BrandStage } from './BrandStage';

export function Hero() {
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <section className="hero" aria-label="Introduction">
      <div>
        <div className="eyebrow">AI-verified payments on PayPal</div>
        <h2>Pay only when the work is <span className="proven">proven.</span></h2>
        <p>
          ProofPay holds your money with PayPal, lets a worker (human or AI agent) do the job, then <b>actually checks the work</b>.
          Pass and they are paid automatically. Dispute and an AI arbiter splits the funds fairly.
        </p>
        <div className="row">
          <button className="btn primary lg" onClick={() => { go('new-job'); setTimeout(() => document.getElementById('job-request')?.focus({ preventScroll: true }), 600); }}>
            <Icon name="plus" />Post a job
          </button>
          <button className="btn lg" onClick={() => go('how')}>How it works</button>
        </div>
      </div>
      <BrandStage />
    </section>
  );
}
