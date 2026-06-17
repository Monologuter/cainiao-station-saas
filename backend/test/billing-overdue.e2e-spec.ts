import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';
import { ExpiryCheckProcessor } from '../apps/api/src/modules/billing/jobs/expiry-check.processor';
import { InvoiceRunProcessor } from '../apps/api/src/modules/billing/jobs/invoice-run.processor';

describe('Billing overdue e2e', () => {
  let app: INestApplication;
  let invoiceRun: InvoiceRunProcessor;
  let expiryCheck: ExpiryCheckProcessor;
  const prisma = new PrismaService();

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    await prisma.$connect();
    invoiceRun = app.get(InvoiceRunProcessor);
    expiryCheck = app.get(ExpiryCheckProcessor);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('runs invoice job, marks overdue, then suspends tenant after grace period', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken);
    const planId = await createPlan(adminToken);
    const subscription = await request(app.getHttpServer())
      .post('/api/billing/subscriptions')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ stationId: boss.stationId, planId })
      .expect(201);

    const periodStart = new Date('2026-06-01T00:00:00.000Z');
    const periodEnd = new Date('2026-07-01T00:00:00.000Z');
    await withBypass((tx) =>
      tx.subscription.update({
        where: { id: subscription.body.data.id },
        data: {
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          nextBillingAt: periodEnd,
        },
      }),
    );

    const run = await invoiceRun.runInvoiceRun(
      new Date('2026-07-02T00:00:00.000Z'),
    );
    expect(run.generated).toBeGreaterThanOrEqual(1);

    await expiryCheck.runExpiryCheck(new Date('2026-07-10T00:00:00.000Z'));
    const afterOverdue = await billingState(boss.tenantId);
    expect(afterOverdue.invoice.status).toBe('OVERDUE');
    expect(afterOverdue.subscription.status).toBe('PAST_DUE');
    expect(afterOverdue.tenant.status).toBe('ACTIVE');

    await expiryCheck.runExpiryCheck(new Date('2026-07-20T00:00:00.000Z'));
    const afterSuspend = await billingState(boss.tenantId);
    expect(afterSuspend.subscription.status).toBe('SUSPENDED');
    expect(afterSuspend.tenant.status).toBe('SUSPENDED');
  });

  async function login(username: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(201);
    return res.body.data.accessToken as string;
  }

  async function createPlan(adminToken: string) {
    const res = await request(app.getHttpServer())
      .post('/api/billing/plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `JOB_${Date.now()}`,
        name: '任务测试套餐',
        monthlyPrice: 1000,
        quotas: { sms: -1, parcels: -1, stations: 1 },
        overagePrices: { sms: 0, parcels: 0, stations: 99900 },
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function openTenant(adminToken: string) {
    const phone = `133${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '逾期驿站',
        ownerName: '逾期店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    const token = await login(phone, 'pw123456');
    return {
      tenantId: open.body.data.tenantId as string,
      stationId: open.body.data.stationId as string,
      token,
    };
  }

  async function billingState(tenantId: string) {
    return withBypass(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
      });
      const subscription = await tx.subscription.findFirstOrThrow({
        where: { tenantId },
      });
      const invoice = await tx.invoice.findFirstOrThrow({
        where: { tenantId },
      });
      return { tenant, subscription, invoice };
    });
  }

  async function withBypass<T>(fn: (tx: any) => Promise<T>) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return fn(tx);
    });
  }
});
