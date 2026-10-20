import { describe, expect, it } from 'vitest';
import { ContractSchema, type Contract } from '../server/src/ai/types';
import { verifyCode } from '../server/src/verify/code-verifier';

const contract: Contract = ContractSchema.parse({
  title: 'Sum of evens',
  summary: 'Return the sum of even numbers in an array',
  kind: 'code',
  deliverableSpec: 'JavaScript function sumEvens(arr)',
  code: {
    functionName: 'sumEvens',
    cases: [
      { args: [[1, 2, 3, 4]], expected: 6, label: 'basic' },
      { args: [[]], expected: 0, label: 'empty' },
      { args: [[-2, 5]], expected: -2, label: 'negative' },
    ],
  },
});

describe('verifyCode (real sandboxed execution)', () => {
  it('passes correct code', async () => {
    const v = await verifyCode(contract, 'function sumEvens(a){ return a.filter(x=>x%2===0).reduce((s,x)=>s+x,0); }');
    expect(v.passed).toBe(true);
    expect(v.score).toBe(1);
    expect(v.checks).toHaveLength(3);
  });

  it('fails wrong code with actionable feedback', async () => {
    const v = await verifyCode(contract, 'function sumEvens(a){ return a.reduce((s,x)=>s+x,0); }');
    expect(v.passed).toBe(false);
    expect(v.score).toBeCloseTo(1 / 3);
    expect(v.feedback).toMatch(/basic/);
  });

  it('fails when the function is missing', async () => {
    const v = await verifyCode(contract, 'const x = 1;');
    expect(v.passed).toBe(false);
    expect(v.feedback).toMatch(/not defined/);
  });

  it('survives syntax errors', async () => {
    const v = await verifyCode(contract, 'function sumEvens( {{{');
    expect(v.passed).toBe(false);
    expect(v.feedback).toMatch(/failed to load/);
  });

  it('kills infinite loops', async () => {
    const v = await verifyCode(contract, 'function sumEvens(a){ while(true){} }');
    expect(v.passed).toBe(false);
  }, 15000);

  it('cannot read files, spawn processes, or reach process/require', async () => {
    const evil = `function sumEvens(a){
      try { return require('fs').readFileSync('.env','utf8'); } catch(e) {}
      try { return process.env.PAYPAL_CLIENT_SECRET; } catch(e) {}
      try { return this.constructor.constructor('return process')().env; } catch(e) {}
      return -999;
    }`;
    const v = await verifyCode(contract, evil);
    expect(v.passed).toBe(false);
    expect(JSON.stringify(v)).not.toMatch(/PAYPAL|SECRET|CLIENT/);
  });

  it('rejects oversized submissions', async () => {
    const v = await verifyCode(contract, 'x'.repeat(30_000));
    expect(v.passed).toBe(false);
    expect(v.feedback).toMatch(/too large/);
  });
});
