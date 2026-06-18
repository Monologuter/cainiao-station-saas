import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getTestApp, getTestPrisma, closeTestApp } from './setup';
import type { PrismaService } from '../apps/api/src/core/prisma/prisma.service';

describe('Overdue exception closure e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await getTestApp();
    prisma = getTestPrisma();
  });

  afterAll(() => closeTestApp());

  it('scans overdue levels, sends dedup notifications and returns expired parcel', async () => {
    await cleanupOverdueFixtureData();
    const boss = await openTenant('滞留闭环驿站');
    await prepareSlots(boss);
    const remind = await inbound(boss, '13800010001');
    const urge = await inbound(boss, '13800010002');
    const final = await inbound(boss, '13800010003');
    const expired = await inbound(boss, '13800010004');

    await ageParcel(remind.parcelId, 3);
    await ageParcel(urge.parcelId, 7);
    await ageParcel(final.parcelId, 11);
    await ageParcel(expired.parcelId, 15);

    const scan = await request(app.getHttpServer())
      .post('/api/parcels/overdue/scan')
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(201);
    expect(scan.body.data).toMatchObject({
      skipped: false,
      upgraded: 3,
      returned: 1,
      levels: { 1: 1, 2: 1, 3: 1 },
    });
    await waitForNotifications([
      remind.parcelId,
      urge.parcelId,
      final.parcelId,
    ]);

    const state = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const parcels = await tx.parcel.findMany({
        where: {
          id: {
            in: [
              remind.parcelId,
              urge.parcelId,
              final.parcelId,
              expired.parcelId,
            ],
          },
        },
      });
      const notifications = await tx.notification.findMany({
        where: {
          parcelId: { in: [remind.parcelId, urge.parcelId, final.parcelId] },
          templateCode: {
            in: ['OVERDUE_REMIND', 'OVERDUE_URGE', 'OVERDUE_FINAL'],
          },
        },
        orderBy: [{ parcelId: 'asc' }, { channel: 'asc' }],
      });
      const expiredSlot = await tx.slot.findFirstOrThrow({
        where: { stationId: boss.stationId, code: expired.slotCode },
      });
      return { parcels, notifications, expiredSlot };
    });

    const byId = new Map(state.parcels.map((parcel) => [parcel.id, parcel]));
    expect(byId.get(remind.parcelId)?.lastOverdueLevel).toBe(1);
    expect(byId.get(urge.parcelId)?.lastOverdueLevel).toBe(2);
    expect(byId.get(final.parcelId)?.lastOverdueLevel).toBe(3);
    expect(byId.get(expired.parcelId)?.status).toBe('RETURNED');
    expect(state.expiredSlot.status).toBe('FREE');
    expect(state.expiredSlot.currentParcelId).toBeNull();

    expect(
      state.notifications.map(
        (item) => `${item.parcelId}:${item.templateCode}`,
      ),
    ).toEqual(
      expect.arrayContaining([
        `${remind.parcelId}:OVERDUE_REMIND`,
        `${urge.parcelId}:OVERDUE_URGE`,
        `${final.parcelId}:OVERDUE_FINAL`,
      ]),
    );
  }, 30000);

  async function openTenant(name: string) {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const phone = `137${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({
        name,
        ownerName: '闭环店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: phone, password: 'pw123456' })
      .expect(201);
    return {
      token: login.body.data.accessToken as string,
      stationId: open.body.data.stationId as string,
    };
  }

  async function prepareSlots(boss: { token: string; stationId: string }) {
    const shelf = await request(app.getHttpServer())
      .post(`/api/stations/${boss.stationId}/shelves`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ code: `O${Date.now()}`, name: '滞留货架', zone: 'O' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/shelves/${shelf.body.data.id}/slots/batch`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ rows: 1, levels: 1, cols: 4 })
      .expect(201);
  }

  async function inbound(
    boss: { token: string; stationId: string },
    phone: string,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/inbound')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({
        stationId: boss.stationId,
        waybillNo: `OD${Date.now()}${Math.floor(Math.random() * 1000)}`,
        carrier: 'YTO',
        receiverPhone: phone,
      })
      .expect(201);
    return res.body.data;
  }

  async function ageParcel(parcelId: string, days: number) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      await tx.parcel.update({
        where: { id: parcelId },
        data: {
          storedAt: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        },
      });
    });
  }

  async function cleanupOverdueFixtureData() {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const parcels = await tx.parcel.findMany({
        where: {
          waybillNo: { startsWith: 'OD' },
          receiverPhone: {
            in: ['13800010001', '13800010002', '13800010003', '13800010004'],
          },
        },
        select: { id: true },
      });
      const parcelIds = parcels.map((parcel) => parcel.id);
      if (parcelIds.length === 0) {
        return;
      }

      await tx.slot.updateMany({
        where: { currentParcelId: { in: parcelIds } },
        data: { currentParcelId: null, status: 'FREE' },
      });
      await tx.notification.deleteMany({
        where: { parcelId: { in: parcelIds } },
      });
      await tx.parcelEvent.deleteMany({
        where: { parcelId: { in: parcelIds } },
      });
      await tx.exceptionTicket.deleteMany({
        where: { parcelId: { in: parcelIds } },
      });
      await tx.ocrRecognition.deleteMany({
        where: { parcelId: { in: parcelIds } },
      });
      await tx.parcel.deleteMany({
        where: { id: { in: parcelIds } },
      });
    });
  }

  async function waitForNotifications(parcelIds: string[], timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const count = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.bypass_rls', 'on', true)`,
        );
        return tx.notification.count({
          where: {
            parcelId: { in: parcelIds },
            templateCode: {
              in: ['OVERDUE_REMIND', 'OVERDUE_URGE', 'OVERDUE_FINAL'],
            },
          },
        });
      });
      if (count >= parcelIds.length) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('overdue notifications were not delivered');
  }
});
