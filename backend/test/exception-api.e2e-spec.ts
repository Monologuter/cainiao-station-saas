import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Exception and overdue API e2e', () => {
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

  it('marks, claims and resolves exception tickets with parcel transitions', async () => {
    const boss = await openTenant('异常 API 驿站');
    await prepareSlots(boss, 3);
    const first = await inbound(boss, '13800000000');

    const created = await request(app.getHttpServer())
      .post(`/api/parcels/${first.parcelId}/exception`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ type: 'DAMAGED', description: '外包装破损', severity: 'HIGH' })
      .expect(201);

    expect(created.body.data).toMatchObject({
      parcelId: first.parcelId,
      status: 'OPEN',
      type: 'DAMAGED',
    });

    const list = await request(app.getHttpServer())
      .get('/api/exceptions')
      .query({ status: 'OPEN', type: 'DAMAGED' })
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(list.body.data.total).toBeGreaterThanOrEqual(1);
    expect(list.body.data.list[0]).toMatchObject({
      id: created.body.data.id,
      parcelId: first.parcelId,
    });

    await request(app.getHttpServer())
      .post(`/api/exceptions/${created.body.data.id}/claim`)
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(201);

    const restocked = await request(app.getHttpServer())
      .post(`/api/exceptions/${created.body.data.id}/resolve`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ resolution: 'RESTOCK', note: '检查后可重新入库' })
      .expect(201);
    expect(restocked.body.data).toMatchObject({
      status: 'RESOLVED',
      resolution: 'RESTOCK',
    });

    const firstParcel = await parcelBypass(first.parcelId);
    expect(firstParcel.status).toBe('STORED');
    expect(firstParcel.lastOverdueLevel).toBe(0);

    const second = await inbound(boss, '13800001111');
    const returned = await request(app.getHttpServer())
      .post(`/api/parcels/${second.parcelId}/exception`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ type: 'REJECTED', description: '用户拒收' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/exceptions/${returned.body.data.id}/claim`)
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/exceptions/${returned.body.data.id}/resolve`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ resolution: 'RETURN', note: '退回快递员' })
      .expect(201);

    const secondState = await stateBypass(second.parcelId, second.slotCode);
    expect(secondState.parcel.status).toBe('RETURNED');
    expect(secondState.slot.status).toBe('FREE');
    expect(secondState.slot.currentParcelId).toBeNull();
  }, 30000);

  it('lists overdue parcels and triggers scan manually', async () => {
    const boss = await openTenant('滞留 API 驿站');
    await prepareSlots(boss, 2);
    const remind = await inbound(boss, '13800002222');
    const returned = await inbound(boss, '13800003333');

    await ageParcel(remind.parcelId, 7);
    await ageParcel(returned.parcelId, 15);

    const overdue = await request(app.getHttpServer())
      .get('/api/parcels/overdue')
      .query({ level: 2 })
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(overdue.body.data.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: remind.parcelId, overdueLevel: 2 }),
      ]),
    );

    const scan = await request(app.getHttpServer())
      .post('/api/parcels/overdue/scan')
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(201);
    expect(scan.body.data.returned).toBeGreaterThanOrEqual(1);

    const returnedState = await stateBypass(
      returned.parcelId,
      returned.slotCode,
    );
    expect(returnedState.parcel.status).toBe('RETURNED');
    expect(returnedState.slot.status).toBe('FREE');
  }, 30000);

  async function openTenant(name: string) {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const phone = `139${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({
        name,
        ownerName: '异常店长',
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

  async function prepareSlots(
    boss: { token: string; stationId: string },
    cols: number,
  ) {
    const shelf = await request(app.getHttpServer())
      .post(`/api/stations/${boss.stationId}/shelves`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ code: `E${Date.now()}`, name: '异常货架', zone: 'E' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/shelves/${shelf.body.data.id}/slots/batch`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ rows: 1, levels: 1, cols })
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
        waybillNo: `EX${Date.now()}${Math.floor(Math.random() * 1000)}`,
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

  async function parcelBypass(parcelId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.parcel.findUniqueOrThrow({ where: { id: parcelId } });
    });
  }

  async function stateBypass(parcelId: string, slotCode: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const parcel = await tx.parcel.findUniqueOrThrow({
        where: { id: parcelId },
      });
      const slot = await tx.slot.findFirstOrThrow({
        where: { stationId: parcel.stationId, code: slotCode },
      });
      return { parcel, slot };
    });
  }
});
