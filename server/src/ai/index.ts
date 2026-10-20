import type { Config } from '../config';
import { GeminiAI } from './gemini-ai';
import { GeminiClient } from './gemini-client';
import { MockAI } from './mock-ai';
import type { AI } from './types';

export function createAI(cfg: Config): AI {
  if (cfg.llmProvider === 'mock') return new MockAI();
  return new GeminiAI(new GeminiClient({ apiKey: cfg.geminiApiKey, model: cfg.geminiModel }), cfg.geminiModel);
}

export * from './types';
export { MockAI, GeminiAI, GeminiClient };
