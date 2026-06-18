/**
 * Shared e2e harness (OPS-2).
 *
 * Why this file exists
 * --------------------
 * Each `*.e2e-spec.ts` used to inline ~20 lines of identical bootstrap
 * (Test.createTestingModule -> createNestApplication -> pipes/interceptors/
 * filters -> init), and many ALSO created a *second* `new PrismaService()` (=
 * a second PG connection pool) on top of the one the app already owns via DI.
 *
 * The connection-exhaustion failure ("sorry, too many clients" / "remaining
 * connection slots are reserved for roles with the SUPERUSER attribute") had
 * two compounding causes:
 *   1. Jest runs spec files in PARALLEL by default (one worker per CPU), so N
 *      apps + N stray PrismaServices opened far more pools than PG allows.
 *   2. Each stray `new PrismaService()` doubled the pools per file.
 *
 * Fix:
 *   - `test:e2e` runs with `--runInBand` so only ONE spec file is active at a
 *     time (see package.json). Combined with each file closing its app in
 *     afterAll, at most one app pool is alive at a time.
 *   - `jest-e2e.setup.ts` caps each pool via `?connection_limit=...` on
 *     DATABASE_URL, so even the few specs that keep their own app (websocket /
 *     provider-override specs) plus this shared one stay well under the limit.
 *   - This module gives each spec FILE one app + one PrismaService (the app's
 *     own DI instance — no second pool).
 *
 * IMPORTANT — Jest isolation:
 *   Jest sandboxes every test FILE in its own module registry and its own
 *   `global`. A singleton cannot be shared ACROSS files. So the cache here is
 *   intentionally module-level (= per file): `getTestApp()` builds one app for
 *   the current file and `closeTestApp()` tears it down in that file's afterAll.
 *
 * Usage (app-based spec)
 * ----------------------
 *   import { getTestApp, getTestPrisma, closeTestApp } from './setup';
 *   let app: INestApplication;
 *   let prisma: PrismaService;
 *   beforeAll(async () => {
 *     app = await getTestApp();
 *     prisma = getTestPrisma();      // == app's DI PrismaService, single pool
 *   });
 *   afterAll(() => closeTestApp());  // releases the pool before the next file
 *
 * Usage (prisma-only spec: RLS / model tests, no HTTP)
 * ----------------------------------------------------
 *   import { getTestPrisma, closeTestApp } from './setup';
 *   const prisma = getTestPrisma();  // lightweight: standalone client, no app
 *   afterAll(() => closeTestApp());
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';
import { applyHttpSecurity } from '../apps/api/src/core/http/security';

// Module-level state = per test FILE under Jest's sandbox.
let app: INestApplication | undefined;
let appPromise: Promise<INestApplication> | undefined;
let prisma: PrismaService | undefined;
let prismaOwnedByApp = false;

/**
 * Builds (once per file) the Nest application, mirroring `apps/api/src/main.ts`
 * so e2e behaviour matches runtime: helmet security, global `api` prefix,
 * validation pipe, response interceptor, exception filter.
 *
 * The validation pipe deliberately omits `forbidNonWhitelisted` (which main.ts
 * sets) because the existing specs were written against the lenient pipe (extra
 * body fields stripped, not rejected) — keeping behaviour identical.
 */
export async function getTestApp(): Promise<INestApplication> {
  if (app) return app;
  if (!appPromise) {
    appPromise = (async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      const created = moduleRef.createNestApplication();
      applyHttpSecurity(created);
      created.setGlobalPrefix('api');
      created.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true }),
      );
      created.useGlobalInterceptors(new ResponseInterceptor());
      created.useGlobalFilters(new AllExceptionsFilter());
      await created.init();
      app = created;
      // Reuse the app's DI PrismaService for raw DB access -> a single pool.
      prisma = created.get(PrismaService);
      prismaOwnedByApp = true;
      return created;
    })();
  }
  return appPromise;
}

/**
 * Returns the PrismaService for this file.
 * - With an app built: the app's DI-managed instance (same pool as the app).
 * - Without an app (prisma-only specs): a standalone client, connected lazily.
 *   `closeTestApp()` disconnects it.
 */
export function getTestPrisma(): PrismaService {
  if (prisma) return prisma;
  const standalone = new PrismaService();
  prisma = standalone;
  prismaOwnedByApp = false;
  return standalone;
}

/**
 * Tears down this file's app and/or prisma. Call from `afterAll`.
 * Safe to call when nothing was created. Releases the PG connection pool so the
 * next (serial) spec file starts from a clean connection budget.
 */
export async function closeTestApp(): Promise<void> {
  if (app) {
    // app.close() -> PrismaService.onModuleDestroy -> $disconnect, so the
    // app-owned prisma must not be disconnected twice.
    await app.close();
    app = undefined;
    appPromise = undefined;
    if (prismaOwnedByApp) {
      prisma = undefined;
      prismaOwnedByApp = false;
    }
  }
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}

// Monotonic per-process counter for collision-free suffixes. The old
// `Date.now().slice(-8)` could collide within a millisecond and, with no table
// truncation between runs, made the onboarding specs flaky.
let suffixCounter = 0;

/**
 * Returns an 8-digit suffix unique within this process run and effectively
 * collision-free against leftover data. Shape: 5 epoch-ms digits + 3 digits of
 * (counter+random). Short enough to embed in a phone (`139${suffix}` => 11).
 */
export function uniqueSuffix(): string {
  const seq = (suffixCounter = (suffixCounter + 1) % 1000);
  const time = Date.now().toString().slice(-5);
  const rand = Math.floor(Math.random() * 1000);
  const tail = ((seq * 7 + rand) % 1000).toString().padStart(3, '0');
  return `${time}${tail}`;
}
