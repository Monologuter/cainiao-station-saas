import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Consumer parcel lookup e2e', () => {
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

  it('allows verified phone to read own parcels across tenants only', async () => {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const adminToken = adminLogin.body.data.accessToken;

    const consumerPhone = `136${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const otherPhone = `134${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;

    const firstBoss = await openTenant(adminToken, '用户跨店 A');
    const secondBoss = await openTenant(adminToken, '用户跨店 B');

    await prepareSlots(firstBoss);
    await prepareSlots(secondBoss);

    const firstParcel = await inbound(firstBoss, consumerPhone);
    const secondParcel = await inbound(secondBoss, consumerPhone);
    const otherParcel = await inbound(firstBoss, otherPhone);

    await request(app.getHttpServer())
      .post('/api/consumer/auth/send-code')
      .send({ phone: consumerPhone })
      .expect(201);

    const verify = await request(app.getHttpServer())
      .post('/api/consumer/auth/verify')
      .send({ phone: consumerPhone, code: '123456' })
      .expect(201);
    const pickToken = verify.body.data.pickToken;
    expect(pickToken).toBeDefined();

    const list = await request(app.getHttpServer())
      .get('/api/consumer/parcels')
      .set('Authorization', `Bearer ${pickToken}`)
      .expect(200);
    const ids = list.body.data.list.map((parcel: any) => parcel.id);
    expect(ids).toEqual(
      expect.arrayContaining([firstParcel.parcelId, secondParcel.parcelId]),
    );
    expect(ids).not.toContain(otherParcel.parcelId);
    expect(list.body.data.list[0]).toEqual(
      expect.objectContaining({
        receiverPhoneTail: consumerPhone.slice(-4),
        pickupCode: expect.any(String),
        station: expect.objectContaining({ name: expect.any(String) }),
      }),
    );

    const detail = await request(app.getHttpServer())
      .get(`/api/consumer/parcels/${firstParcel.parcelId}`)
      .set('Authorization', `Bearer ${pickToken}`)
      .expect(200);
    expect(detail.body.data.pickupCode).toBe(firstParcel.pickupCode);

    const denied = await request(app.getHttpServer())
      .get(`/api/consumer/parcels/${otherParcel.parcelId}`)
      .set('Authorization', `Bearer ${pickToken}`);
    expect(denied.body.code).toBe(1004);
  });

  async function openTenant(adminToken: string, name: string) {
    const phone = `133${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name,
        ownerName: '用户端店长',
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
      .send({ code: 'U', name: '用户端货架', zone: 'U' })
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
        waybillNo: `CU${Date.now()}${Math.floor(Math.random() * 1000)}`,
        carrier: 'YTO',
        receiverPhone: phone,
      })
      .expect(201);
    return res.body.data;
  }
});
