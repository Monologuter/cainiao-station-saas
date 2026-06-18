import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';
import { ExpiryCheckProcessor } from '../apps/api/src/modules/billing/jobs/expiry-check.processor';

describe('Billing full flow e2e', () => {
  let app: INestApplication;
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
    expiryCheck = app.get(ExpiryCheckProcessor);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('runs subscription, SMS usage, invoice, overdue suspension and payment recovery', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken);
    const planId = await createPlan(adminToken);

    const subscription = await request(app.getHttpServer())
      .post('/api/billing/subscriptions')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ stationId: boss.stationId, planId })
      .expect(201)
      .then((res) => res.body.data);

    await createShelfAndSlots(boss.token, boss.stationId);
    await request(app.getHttpServer())
      .post('/api/inbound')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({
        stationId: boss.stationId,
        waybillNo: `BILL${Date.now()}`,
        carrier: 'YTO',
        receiverPhone: '13800000000',
      })
      .expect(201);

    const usage = await waitForSmsUsage(boss.token);
    expect(usage.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: 'SMS', quantity: 1 }),
      ]),
    );

    const invoice = await request(app.getHttpServer())
      .post('/api/billing/invoices/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tenantId: boss.tenantId, subscriptionId: subscription.id })
      .expect(201)
      .then((res) => res.body.data);
    expect(invoice).toMatchObject({
      status: 'OPEN',
      baseAmount: 1000,
      overageAmount: 0,
      totalAmount: 1000,
    });

    await request(app.getHttpServer())
      .post(`/api/billing/invoices/${invoice.id}/pay`)
      .set('Authorization', `Bearer ${boss.token}`)
      .set('Idempotency-Key', `full-pay-${invoice.id}`)
      .expect(201);

    const overdueInvoice = await request(app.getHttpServer())
      .post('/api/billing/invoices/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tenantId: boss.tenantId, subscriptionId: subscription.id })
      .expect(201)
      .then((res) => res.body.data);

    await withBypass((tx) =>
      tx.invoice.update({
        where: { id: overdueInvoice.id },
        data: { dueAt: new Date('2026-07-01T00:00:00.000Z') },
      }),
    );
    await expiryCheck.runExpiryCheck(new Date('2026-07-20T00:00:00.000Z'));
    const suspended = await billingState(boss.tenantId, subscription.id);
    expect(suspended.tenant.status).toBe('SUSPENDED');
    expect(suspended.subscription.status).toBe('SUSPENDED');

    await request(app.getHttpServer())
      .post(`/api/billing/invoices/${overdueInvoice.id}/pay`)
      .set('Authorization', `Bearer ${boss.token}`)
      .set('Idempotency-Key', `full-pay-${overdueInvoice.id}`)
      .expect(201);
    const restored = await billingState(boss.tenantId, subscription.id);
    expect(restored.tenant.status).toBe('ACTIVE');
    expect(restored.subscription.status).toBe('ACTIVE');
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
        code: `FULL_${Date.now()}`,
        name: '全流程测试套餐',
        monthlyPrice: 1000,
        quotas: { sms: 1, parcels: -1, stations: 1 },
        overagePrices: { sms: 5, parcels: 0, stations: 99900 },
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function openTenant(adminToken: string) {
    const phone = `135${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '全流程驿站',
        ownerName: '全流程店长',
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

  async function createShelfAndSlots(token: string, stationId: string) {
    const shelf = await request(app.getHttpServer())
      .post(`/api/stations/${stationId}/shelves`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `F${Date.now()}`, name: '全流程货架', zone: 'F' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/shelves/${shelf.body.data.id}/slots/batch`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: 1, levels: 1, cols: 1 })
      .expect(201);
  }

  async function billingState(tenantId: string, subscriptionId: string) {
    return withBypass(async (tx) => ({
      tenant: await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      subscription: await tx.subscription.findUniqueOrThrow({
        where: { id: subscriptionId },
      }),
    }));
  }

  async function withBypass<T>(fn: (tx: any) => Promise<T>) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return fn(tx);
    });
  }

  async function waitForSmsUsage(token: string, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    let latest: request.Response | undefined;
    while (Date.now() < deadline) {
      latest = await request(app.getHttpServer())
        .get('/api/billing/usage')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      if (
        latest.body.data.some(
          (item: any) => item.metric === 'SMS' && item.quantity >= 1,
        )
      ) {
        return latest;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return latest!;
  }
});
