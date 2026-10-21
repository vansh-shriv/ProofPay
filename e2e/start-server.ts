// Boots ProofPay for browser tests: simulators only, throwaway database.
import { rmSync } from 'node:fs';
import { buildApp } from '../server/src/index';
import { parseConfig } from '../server/src/config';
import { DEFAULT_POLICY } from '../server/src/core/policy';

const db = 'data/e2e.db';
for (const f of [db, `${db}-wal`, `${db}-shm`]) rmSync(f, { force: true });
const cfg = parseConfig({ PORT: '3100', APP_BASE_URL: 'http://localhost:3100', DB_PATH: db });
const { app, store } = buildApp(cfg, { rateLimit: { max: 1000, windowMs: 60_000 } });
// Tests share one database: a large daily budget keeps them independent of order (limits themselves are still tested).
store.setPolicy({ ...DEFAULT_POLICY, dailyBudgetCents: 100_000_000 });
await app.listen({ port: 3100, host: '127.0.0.1' });
