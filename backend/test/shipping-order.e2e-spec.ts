import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getTestApp, closeTestApp } from './setup';

describe('Shipping order e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(() => closeTestApp());

  it('creates a CREATED shipping order with a quote snapshot', async () => {
    const { token, stationId } = await openTenantAndLogin();

    const res = await request(app.getHttpServer())
      .post('/api/shipping/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(makeOrderBody(stationId))
      .expect(201);

    expect(res.body.data).toMatchObject({
      id: expect.any(String),
      orderNo: expect.any(String),
      status: 'CREATED',
      courierCode: 'YTO',
      quoteAmount: expect.any(Number),
    });
    expect(res.body.data.quoteSnapshotJson).toMatchObject({
      zone: 'CROSS_PROVINCE',
      amount: res.body.data.quoteAmount,
    });
  });

  async function openTenantAndLogin() {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const phone = `135${Date.now().toString().slice(-8)}`;
    const opened = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({
        name: '寄件下单驿站',
        ownerName: '下单店长',
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
