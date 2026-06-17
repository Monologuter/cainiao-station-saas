import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Shipping full flow e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
    prisma = app.get(PrismaService);
  });

  afterAll(() => app.close());

  it('runs staff quote -> order -> pay -> collect -> tracks -> delivered', async () => {
    const { token, stationId } = await openTenantAndLogin('flow');

    const quote = await request(app.getHttpServer())
      .post('/api/shipping/quote')
      .set('Authorization', `Bearer ${token}`)
      .send(makeQuoteBody())
      .expect(201);
    expect(quote.body.data[0].recommended).toBe(true);

    const order = await createOrder(token, stationId);
    const pay = await request(app.getHttpServer())
      .post(`/api/shipping/orders/${order.id}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pay-${Date.now()}`)
      .expect(201);
    expect(pay.body.data.status).toBe('PAID');

    const collected = await request(app.getHttpServer())
      .post(`/api/shipping/orders/${order.id}/collect`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(collected.body.data).toMatchObject({
      status: 'COLLECTED',
      waybillNo: expect.stringMatching(/^MOCK/),
    });

    const tracks = await request(app.getHttpServer())
      .get(`/api/shipping/orders/${order.id}/tracks`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(tracks.body.data.at(-1)).toMatchObject({
      nodeStatus: 'DELIVERED',
    });

    const detail = await request(app.getHttpServer())
      .get(`/api/shipping/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.data.status).toBe('DELIVERED');
  });

  it('keeps repeated successful payment idempotent', async () => {
    const { token, stationId, tenantId } = await openTenantAndLogin('pay');
    const order = await createOrder(token, stationId);
    const key = `same-${Date.now()}`;

    await request(app.getHttpServer())
      .post(`/api/shipping/orders/${order.id}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/shipping/orders/${order.id}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .expect(201);

    const paymentCount = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.payment.count({
        where: {
          tenantId,
          bizType: 'SHIP_ORDER',
          bizId: order.id,
          idempotencyKey: key,
          status: 'SUCCESS',
        },
      });
    });
    expect(paymentCount).toBe(1);
  });

  it('does not expose tenant A shipping orders to tenant B', async () => {
    const tenantA = await openTenantAndLogin('a');
    const tenantB = await openTenantAndLogin('b');
    const order = await createOrder(tenantA.token, tenantA.stationId);

    const listB = await request(app.getHttpServer())
      .get('/api/shipping/orders')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .expect(200);
    expect(listB.body.data.list).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: order.id })]),
    );

    const detailB = await request(app.getHttpServer())
      .get(`/api/shipping/orders/${order.id}`)
      .set('Authorization', `Bearer ${tenantB.token}`);
    expect(detailB.body.code).toBe(1004);
  });

  async function createOrder(token: string, stationId: string) {
    const res = await request(app.getHttpServer())
      .post('/api/shipping/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(makeOrderBody(stationId))
      .expect(201);
    return res.body.data;
  }

  async function openTenantAndLogin(suffix: string) {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const phone = `129${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const opened = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({
        name: `P2-1 ${suffix} 驿站`,
        ownerName: '寄件店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    const bossLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: phone, password: 'pw123456' })
      .expect(201);

    return {
      tenantId: opened.body.data.tenantId as string,
      stationId: opened.body.data.stationId as string,
      token: bossLogin.body.data.accessToken as string,
    };
  }

  function makeQuoteBody() {
    return {
      sender: {
        name: '张三',
        phone: '13800000000',
        province: '浙江省',
        city: '杭州市',
        district: '西湖区',
        address: '文三路 1 号',
      },
      receiver: {
        name: '李四',
        phone: '13900000000',
        province: '广东省',
        city: '深圳市',
        district: '南山区',
        address: '科技园 2 号',
      },
      weightGram: 1200,
      preference: 'priceFirst',
    };
  }

  function makeOrderBody(stationId: string) {
    return {
      channel: 'STATION',
      stationId,
      courierCode: 'YTO',
      sender: {
        name: '张三',
        phone: '13800000000',
        province: '浙江省',
        city: '杭州市',
        district: '西湖区',
        address: '文三路 1 号',
      },
      receiver: {
        name: '李四',
        phone: '13900000000',
        province: '广东省',
        city: '深圳市',
        district: '南山区',
        address: '科技园 2 号',
      },
      item: { type: '文件', weightGram: 1200 },
    };
  }
});
