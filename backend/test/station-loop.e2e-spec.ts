import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getTestApp, getTestPrisma, closeTestApp } from './setup';
import type { PrismaService } from '../apps/api/src/core/prisma/prisma.service';

describe('Station core loop e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await getTestApp();
    prisma = getTestPrisma();
  });

  afterAll(() => closeTestApp());

  it('开店 → 建货架库位 → 入库通知 → 核销释放库位', async () => {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const adminToken = adminLogin.body.data.accessToken;

    const phone = `136${Date.now().toString().slice(-8)}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '闭环驿站',
        ownerName: '王五',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);

    const tenantId = open.body.data.tenantId;
    const stationId = open.body.data.stationId;
    const bossLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: phone, password: 'pw123456' })
      .expect(201);
    const bossToken = bossLogin.body.data.accessToken;

    const shelf = await request(app.getHttpServer())
      .post(`/api/stations/${stationId}/shelves`)
      .set('Authorization', `Bearer ${bossToken}`)
      .send({ code: 'A', name: 'A 区货架', zone: 'A' })
      .expect(201);
    const shelfId = shelf.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/shelves/${shelfId}/slots/batch`)
      .set('Authorization', `Bearer ${bossToken}`)
      .send({ rows: 1, levels: 1, cols: 2 })
      .expect(201);

    const inbound = await request(app.getHttpServer())
      .post('/api/inbound')
      .set('Authorization', `Bearer ${bossToken}`)
      .send({
        stationId,
        waybillNo: `YT${Date.now()}`,
        carrier: 'YTO',
        receiverPhone: '13800000000',
      })
      .expect(201);

    expect(inbound.body.data.status).toBe('STORED');
    expect(inbound.body.data.pickupCode).toBeDefined();
    expect(inbound.body.data.slotCode).toBe('A-01-01-01');

    const afterInbound = await waitFor(async () => {
      const snapshot = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.bypass_rls', 'on', true)`,
        );
        const parcel = await tx.parcel.findUniqueOrThrow({
          where: { id: inbound.body.data.parcelId },
        });
        const slot = await tx.slot.findFirstOrThrow({
          where: { stationId, code: inbound.body.data.slotCode },
        });
        const notifications = await tx.notification.findMany({
          where: { tenantId, parcelId: parcel.id },
          orderBy: { channel: 'asc' },
        });
        return { parcel, slot, notifications };
      });
      return snapshot.notifications.length >= 2 ? snapshot : null;
    });

    expect(afterInbound).toBeDefined();
    expect(afterInbound!.parcel.status).toBe('STORED');
    expect(afterInbound!.slot.status).toBe('OCCUPIED');
    expect(afterInbound!.slot.currentParcelId).toBe(inbound.body.data.parcelId);
    expect(
      afterInbound!.notifications.map((item) => item.channel).sort(),
    ).toEqual(['IN_APP', 'SMS']);

    const pickup = await request(app.getHttpServer())
      .post('/api/pickup')
      .set('Authorization', `Bearer ${bossToken}`)
      .send({ stationId, pickupCode: inbound.body.data.pickupCode })
      .expect(201);

    expect(pickup.body.data).toMatchObject({
      parcelId: inbound.body.data.parcelId,
      status: 'PICKED_UP',
      slotReleased: true,
    });

    const afterPickup = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const parcel = await tx.parcel.findUniqueOrThrow({
        where: { id: inbound.body.data.parcelId },
      });
      const slot = await tx.slot.findFirstOrThrow({
        where: { stationId, code: inbound.body.data.slotCode },
      });
      return { parcel, slot };
    });

    expect(afterPickup.parcel.status).toBe('PICKED_UP');
    expect(afterPickup.slot.status).toBe('FREE');
    expect(afterPickup.slot.currentParcelId).toBeNull();

    const duplicate = await request(app.getHttpServer())
      .post('/api/pickup')
      .set('Authorization', `Bearer ${bossToken}`)
      .send({ stationId, pickupCode: inbound.body.data.pickupCode });
    expect(duplicate.body.code).toBe(2005);
  });

  it('并发扫描同一运单只创建一个活跃包裹并返回幂等结果', async () => {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const phone = `135${Date.now().toString().slice(-8)}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({
        name: '并发运单驿站',
        ownerName: '并发店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    const bossLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: phone, password: 'pw123456' })
      .expect(201);

    const stationId = open.body.data.stationId;
    const tenantId = open.body.data.tenantId;
    const bossToken = bossLogin.body.data.accessToken;
    const shelf = await request(app.getHttpServer())
      .post(`/api/stations/${stationId}/shelves`)
      .set('Authorization', `Bearer ${bossToken}`)
      .send({ code: `C${Date.now()}`, name: '并发货架', zone: 'C' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/shelves/${shelf.body.data.id}/slots/batch`)
      .set('Authorization', `Bearer ${bossToken}`)
      .send({ rows: 1, levels: 1, cols: 2 })
      .expect(201);

    const waybillNo = `CON${Date.now()}`;
    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/inbound')
        .set('Authorization', `Bearer ${bossToken}`)
        .send({
          stationId,
          waybillNo,
          carrier: 'YTO',
          receiverPhone: '13800000000',
        })
        .expect(201),
      request(app.getHttpServer())
        .post('/api/inbound')
        .set('Authorization', `Bearer ${bossToken}`)
        .send({
          stationId,
          waybillNo,
          carrier: 'YTO',
          receiverPhone: '13800000000',
        })
        .expect(201),
    ]);

    expect(second.body.data.parcelId).toBe(first.body.data.parcelId);
    const count = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.parcel.count({
        where: {
          tenantId,
          stationId,
          waybillNo,
          deletedAt: null,
          status: { in: ['PENDING', 'STORED', 'EXCEPTION'] },
        },
      });
    });
    expect(count).toBe(1);
  });

  async function waitFor<T>(
    probe: () => Promise<T | null>,
    timeoutMs = 5000,
  ): Promise<T | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = await probe();
      if (value) {
        return value;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  }
});
