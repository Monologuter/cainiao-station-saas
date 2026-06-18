import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { getTestApp, getTestPrisma, closeTestApp } from './setup';

describe('Shipping collect e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await getTestApp();
    prisma = getTestPrisma();
  });

  afterAll(() => closeTestApp());

  it('collects a paid order and creates the first logistics track', async () => {
    const { token, stationId, tenantId } = await openTenantAndLogin();
    const order = await createOrder(token, stationId);
    await request(app.getHttpServer())
      .post(`/api/shipping/orders/${order.id}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pay-${Date.now()}`)
      .expect(201);

    const collected = await request(app.getHttpServer())
      .post(`/api/shipping/orders/${order.id}/collect`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(collected.body.data).toMatchObject({
      id: order.id,
      status: 'COLLECTED',
      waybillNo: expect.stringMatching(/^MOCK/),
    });

    const tracks = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.logisticsTrack.findMany({
        where: { tenantId, shipOrderId: order.id },
        orderBy: { seq: 'asc' },
      });
    });
    expect(tracks).toEqual([
      expect.objectContaining({
        seq: 1,
        nodeStatus: 'COLLECTED',
        waybillNo: collected.body.data.waybillNo,
      }),
    ]);
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
    const phone = `132${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const opened = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({
        name: '寄件揽收驿站',
        ownerName: '揽收店长',
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
