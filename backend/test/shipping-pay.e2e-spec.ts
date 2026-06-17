import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Shipping pay e2e', () => {
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

  it('pays a shipping order and treats repeated idempotency key as same payment', async () => {
    const { token, stationId, tenantId } = await openTenantAndLogin();
    const order = await createOrder(token, stationId);
    const key = `pay-${Date.now()}`;

    const paid = await request(app.getHttpServer())
      .post(`/api/shipping/orders/${order.id}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .expect(201);
    expect(paid.body.data).toMatchObject({
      id: order.id,
      status: 'PAID',
      quoteAmount: order.quoteAmount,
    });

    const repeated = await request(app.getHttpServer())
      .post(`/api/shipping/orders/${order.id}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .expect(201);
    expect(repeated.body.data.status).toBe('PAID');

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

  async function createOrder(token: string, stationId: string) {
    const res = await request(app.getHttpServer())
      .post('/api/shipping/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(makeOrderBody(stationId))
      .expect(201);
    return res.body.data;
  }

  async function openTenantAndLogin() {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const phone = `133${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const opened = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({
        name: '寄件支付驿站',
        ownerName: '支付店长',
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
