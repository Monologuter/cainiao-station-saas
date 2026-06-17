import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Shipping tracks e2e', () => {
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

  it('materializes logistics tracks and syncs order status to DELIVERED', async () => {
    const { token, stationId } = await openTenantAndLogin();
    const order = await createOrder(token, stationId);
    await request(app.getHttpServer())
      .post(`/api/shipping/orders/${order.id}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pay-${Date.now()}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/shipping/orders/${order.id}/collect`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const tracks = await request(app.getHttpServer())
      .get(`/api/shipping/orders/${order.id}/tracks`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(tracks.body.data.map((track: any) => track.nodeStatus)).toEqual([
      'COLLECTED',
      'IN_TRANSIT',
      'ARRIVED',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ]);

    const detail = await request(app.getHttpServer())
      .get(`/api/shipping/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.data.status).toBe('DELIVERED');
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
    const phone = `131${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const opened = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({
        name: '寄件轨迹驿站',
        ownerName: '轨迹店长',
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
