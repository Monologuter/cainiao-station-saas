import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Station core loop e2e', () => {
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

    const afterInbound = await prisma.$transaction(async (tx) => {
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

    expect(afterInbound.parcel.status).toBe('STORED');
    expect(afterInbound.slot.status).toBe('OCCUPIED');
    expect(afterInbound.slot.currentParcelId).toBe(inbound.body.data.parcelId);
    expect(
      afterInbound.notifications.map((item) => item.channel).sort(),
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
});
