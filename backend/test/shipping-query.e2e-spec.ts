import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Shipping query e2e', () => {
  let app: INestApplication;

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
  });

  afterAll(() => app.close());

  it('lists and details tenant shipping orders without leaking across tenants', async () => {
    const tenantA = await openTenantAndLogin('A');
    const tenantB = await openTenantAndLogin('B');
    const order = await createOrder(tenantA.token, tenantA.stationId);
    await createOrder(tenantB.token, tenantB.stationId);

    const list = await request(app.getHttpServer())
      .get('/api/shipping/orders')
      .query({ status: 'CREATED', page: 1, size: 10 })
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(200);

    expect(list.body.data).toMatchObject({
      total: expect.any(Number),
      page: 1,
      size: 10,
    });
    expect(list.body.data.list).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: order.id })]),
    );
    expect(list.body.data.list).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stationId: tenantB.stationId }),
      ]),
    );

    const detail = await request(app.getHttpServer())
      .get(`/api/shipping/orders/${order.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(200);
    expect(detail.body.data).toMatchObject({
      id: order.id,
      status: 'CREATED',
      quoteSnapshotJson: expect.objectContaining({
        amount: order.quoteAmount,
      }),
    });

    const cross = await request(app.getHttpServer())
      .get(`/api/shipping/orders/${order.id}`)
      .set('Authorization', `Bearer ${tenantB.token}`);
    expect(cross.body.code).toBe(1004);
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
    const phone = `134${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const opened = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({
        name: `寄件查询驿站${suffix}`,
        ownerName: '查询店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    const bossLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: phone, password: 'pw123456' })
      .expect(201);

    return {
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
