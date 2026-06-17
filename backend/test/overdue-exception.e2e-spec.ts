import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Overdue exception closure e2e', () => {
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

  it('scans overdue levels, sends dedup notifications and returns expired parcel', async () => {
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

    await request(app.getHttpServer())
      .post('/api/parcels/overdue/scan')
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(201);

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
});
