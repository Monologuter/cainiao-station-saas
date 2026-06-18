/**
 * Jest `setupFilesAfterEnv` entry for the e2e suite (OPS-2).
 *
 * Runs once per test FILE, before that file's tests, in the same realm as the
 * tests. We use it purely to cap the Postgres connection pool so the suite
 * cannot exhaust the database's non-superuser connection slots.
 */
import Redis from 'ioredis';
import { config as loadEnv } from 'dotenv';

// Ensure DATABASE_URL / REDIS_URL are populated from .env before we use them.
// dotenv does not override already-set vars, so this is a no-op when present.
loadEnv();

// Cap each Prisma connection pool (OPS-2). Even with --runInBand, a spec that
// keeps its own app (websocket / provider-override specs) can briefly run
// alongside the previous file's not-yet-released pool, and Prisma's default pool
// size (num_cpus*2+1) can exhaust the non-superuser role's slots
// ("remaining connection slots are reserved for roles with the SUPERUSER
// attribute"). A small explicit limit keeps total connections bounded and
// deterministic across machines/CI. Only applied if not already specified.
if (
  process.env.DATABASE_URL &&
  !/[?&]connection_limit=/.test(process.env.DATABASE_URL)
) {
  const sep = process.env.DATABASE_URL.includes('?') ? '&' : '?';
  // 17 per pool. With --runInBand and each file closing its app in afterAll, at
  // most ~2 pools are alive at once (the current file's app + one spec that
  // keeps its own app), so <=34 connections total — comfortably under PG's
  // default 100 / non-superuser budget. We still pin the value (rather than
  // leave Prisma's machine-dependent num_cpus*2+1 default) so a high-core CI box
  // can't open enough connections to exhaust the role's slots, while keeping the
  // pool large enough that multi-query requests don't starve and time out.
  process.env.DATABASE_URL = `${process.env.DATABASE_URL}${sep}connection_limit=17`;
}

// Reset the shared RATE-LIMIT state before each spec FILE (OPS-2 lightweight
// isolation).
//
// The rate limiter lives in the (project-dedicated) test Redis. Running the
// suite serially against one Redis means its counters bleed across files — most
// importantly the login limit (10/min per username): dozens of specs logging in
// as `admin` within a minute trip it, and the cascading auth failures surfaced
// as flaky 403s / socket "Parse Error"s that migrated between runs.
//
// We delete ONLY the rate-limiter keys (their distinct prefixes below), NOT the
// whole DB: a blanket flushdb would also wipe BullMQ queues and distributed
// locks that a just-closed app's worker might still be draining, which itself
// caused intermittent hangs. Clearing per file (not per test) is enough.
const RATE_LIMIT_PREFIXES = [
  'login',
  'consumer-otp-send',
  'consumer-otp-verify',
  'inbound',
  'inbound-ocr',
  'inbound-ocr-batch',
  'pickup',
  'shipping-pay',
];

beforeAll(async () => {
  const url = process.env.REDIS_URL ?? 'redis://localhost:16379';
  const client = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await client.connect();
    for (const prefix of RATE_LIMIT_PREFIXES) {
      // keys look like `${prefix}:${subject}` and `${prefix}:${subject}:seq`.
      const keys = await client.keys(`${prefix}:*`);
      if (keys.length) {
        await client.del(...keys);
      }
    }
  } catch {
    // If Redis is unavailable the app itself fails fast elsewhere; don't mask
    // that here. Best-effort cleanup only.
  } finally {
    client.disconnect();
  }
});
