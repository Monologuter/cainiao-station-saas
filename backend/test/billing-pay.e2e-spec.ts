import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Billing pay e2e', () => {
  let app: INestApplication;
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
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('pays subscription invoices idempotently and restores overdue suspension', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken);
    const invoice = await createFirstOpenInvoice(adminToken, boss);

    const paid = await request(app.getHttpServer())
      .post(`/api/billing/invoices/${invoice.id}/pay`)
      .set('Authorization', `Bearer ${boss.token}`)
      .set('Idempotency-Key', 'invoice-pay-key-1')
      .expect(201);
    expect(paid.body.data).toMatchObject({
      id: invoice.id,
      status: 'PAID',
      totalAmount: 1000,
    });

    const duplicate = await request(app.getHttpServer())
      .post(`/api/billing/invoices/${invoice.id}/pay`)
      .set('Authorization', `Bearer ${boss.token}`)
      .set('Idempotency-Key', 'invoice-pay-key-1')
      .expect(201);
    expect(duplicate.body.data.id).toBe(invoice.id);

    const overdue = await request(app.getHttpServer())
      .post('/api/billing/invoices/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tenantId: boss.tenantId,
        subscriptionId: invoice.subscriptionId,
      })
      .expect(201)
      .then((res) => res.body.data);
    await withBypass((tx) =>
      Promise.all([
        tx.invoice.update({
          where: { id: overdue.id },
          data: { status: 'OVERDUE' },
        }),
        tx.subscription.update({
          where: { id: overdue.subscriptionId },
          data: { status: 'SUSPENDED' },
        }),
        tx.tenant.update({
          where: { id: boss.tenantId },
          data: { status: 'SUSPENDED' },
        }),
      ]),
    );

    await request(app.getHttpServer())
      .post(`/api/billing/invoices/${overdue.id}/pay`)
      .set('Authorization', `Bearer ${boss.token}`)
      .set('Idempotency-Key', 'invoice-pay-key-2')
      .expect(201);

    const state = await withBypass(async (tx) => ({
      tenant: await tx.tenant.findUniqueOrThrow({
        where: { id: boss.tenantId },
      }),
      subscription: await tx.subscription.findUniqueOrThrow({
        where: { id: overdue.subscriptionId },
      }),
    }));
    expect(state.tenant.status).toBe('ACTIVE');
    expect(state.subscription.status).toBe('ACTIVE');

    const callback = await request(app.getHttpServer())
      .post('/api/billing/pay/callback')
      .send({ channel: 'mock' })
      .expect(201);
    expect(callback.body.data).toEqual({ handled: true });
  });

  async function createFirstOpenInvoice(adminToken: string, boss: any) {
    const planId = await createPlan(adminToken);
    const subscription = await request(app.getHttpServer())
      .post('/api/billing/subscriptions')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ stationId: boss.stationId, planId })
      .expect(201);
    const invoice = await request(app.getHttpServer())
      .post('/api/billing/invoices/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tenantId: boss.tenantId,
        subscriptionId: subscription.body.data.id,
      })
      .expect(201);
    return invoice.body.data;
  }

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
        code: `PAY_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name: '支付测试套餐',
        monthlyPrice: 1000,
        quotas: { sms: -1, parcels: -1, stations: 1 },
        overagePrices: { sms: 0, parcels: 0, stations: 99900 },
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function openTenant(adminToken: string) {
    const phone = `134${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '支付驿站',
        ownerName: '支付店长',
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

  async function withBypass<T>(fn: (tx: any) => Promise<T>) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return fn(tx);
    });
  }
});
