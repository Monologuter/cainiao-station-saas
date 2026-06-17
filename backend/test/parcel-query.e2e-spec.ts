import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Parcel query e2e', () => {
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

  it('queries parcel list and detail within current tenant only', async () => {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const adminToken = adminLogin.body.data.accessToken;

    const boss = await openTenant(adminToken, '包裹查询驿站');
    const otherBoss = await openTenant(adminToken, '包裹查询隔离驿站');
    await prepareSlots(boss);

    const phone = '13812345678';
    const first = await inbound(boss, phone);
    await inbound(boss, '13800009999');

    const list = await request(app.getHttpServer())
      .get('/api/parcels')
      .query({
        status: 'STORED',
        phoneTail: phone.slice(-4),
        pickupCode: first.pickupCode,
        slot: first.slotCode,
        page: 1,
        size: 10,
      })
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);

    expect(list.body.data).toMatchObject({ total: 1, page: 1, size: 10 });
    expect(list.body.data.list[0]).toMatchObject({
      id: first.parcelId,
      pickupCode: first.pickupCode,
      status: 'STORED',
      receiverPhoneTail: '5678',
      slot: expect.objectContaining({ code: first.slotCode }),
    });

    const detail = await request(app.getHttpServer())
      .get(`/api/parcels/${first.parcelId}`)
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(
      detail.body.data.events.map((event: any) => event.eventType),
    ).toEqual(['INBOUND', 'STORED']);

    const isolated = await request(app.getHttpServer())
      .get(`/api/parcels/${first.parcelId}`)
      .set('Authorization', `Bearer ${otherBoss.token}`);
    expect(isolated.body.code).toBe(1004);
  });

  async function openTenant(adminToken: string, name: string) {
    const phone = `132${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name,
        ownerName: '查询店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: phone, password: 'pw123456' })
      .expect(201);

    return {
      stationId: open.body.data.stationId as string,
      token: login.body.data.accessToken as string,
    };
  }

  async function prepareSlots(boss: { stationId: string; token: string }) {
    const shelf = await request(app.getHttpServer())
      .post(`/api/stations/${boss.stationId}/shelves`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ code: 'Q', name: '查询货架', zone: 'Q' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/shelves/${shelf.body.data.id}/slots/batch`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ rows: 1, levels: 1, cols: 3 })
      .expect(201);
  }

  async function inbound(
    boss: { stationId: string; token: string },
    phone: string,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/inbound')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({
        stationId: boss.stationId,
        waybillNo: `PQ${Date.now()}${Math.floor(Math.random() * 1000)}`,
        carrier: 'YTO',
        receiverPhone: phone,
      })
      .expect(201);
    return res.body.data;
  }
});
