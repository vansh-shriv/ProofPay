import type { ZodType } from 'zod';
import type { ImageInput } from './types';

export interface GeminiOptions {
  apiKey: string;
  /** One model id, or a comma-separated fallback chain: "gemini-3.5-flash,gemini-3.1-flash-lite". */
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/** Minimal Gemini REST client that returns schema-validated JSON, with retry/backoff for free-tier limits. */
export class GeminiClient {
  private readonly f: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(private readonly o: GeminiOptions) {
    this.f = o.fetchImpl ?? fetch;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async json<T>(system: string, prompt: string, schema: ZodType<T>, temperature = 0.2, images: ImageInput[] = []): Promise<T> {
    let lastProblem = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await this.generate(system, attempt === 0 ? prompt : `${prompt}\n\nYour previous reply was invalid: ${lastProblem}\nReturn ONLY corrected JSON.`, temperature, images);
      let parsed: unknown;
      try {
        parsed = JSON.parse(stripFences(text));
      } catch {
        lastProblem = 'not valid JSON';
        continue;
      }
      const r = schema.safeParse(parsed);
      if (r.success) return r.data;
      lastProblem = r.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    }
    throw new Error(`Gemini returned unusable output after retry (${lastProblem})`);
  }

  /** Try each model in order; within a model retry transient failures with backoff. */
  private async generate(system: string, prompt: string, temperature: number, images: ImageInput[]): Promise<string> {
    const models = this.o.model.split(',').map((m) => m.trim()).filter(Boolean);
    let lastError = 'no models configured';
    for (const model of models) {
      const r = await this.tryModel(model, system, prompt, temperature, images);
      if (r.ok) return r.text;
      lastError = `${model}: ${r.error}`;
      if (!r.next) break; // non-retryable (bad request / bad key): other models won't help
    }
    throw new Error(`Gemini failed on all models (${lastError})`);
  }

  private async tryModel(model: string, system: string, prompt: string, temperature: number, images: ImageInput[]):
    Promise<{ ok: true; text: string } | { ok: false; error: string; next: boolean }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    let delay = 1500;
    let error = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await this.sleep(delay);
        delay *= 2;
      }
      let res: Response;
      try {
        res = await this.f(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.o.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [...images.map((i) => ({ inlineData: { mimeType: i.mimeType, data: i.data } })), { text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature },
          }),
          signal: AbortSignal.timeout(this.o.timeoutMs ?? 45_000),
        });
      } catch (e) {
        error = `unreachable (${(e as Error).message})`; // dropped connection / timeout: transient
        continue;
      }
      if (res.ok) {
        const j: any = await res.json();
        const text = j.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('');
        if (text) return { ok: true, text };
        return { ok: false, error: `no text (finishReason=${j.candidates?.[0]?.finishReason ?? 'unknown'})`, next: true };
      }
      const body: any = await res.json().catch(() => ({}));
      error = `HTTP ${res.status}: ${body.error?.message ?? res.statusText}`;
      if (res.status === 404) return { ok: false, error, next: true }; // model retired/unavailable: fall back
      if (!RETRYABLE.has(res.status)) return { ok: false, error, next: false };
    }
    return { ok: false, error, next: true };
  }
}

function stripFences(t: string) {
  return t.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}
