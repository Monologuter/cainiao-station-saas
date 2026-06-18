import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';
import { OcrClient } from '../apps/api/src/modules/ai/ocr.client';

describe('OCR inbound e2e', () => {
  let app: INestApplication;
  const prisma = new PrismaService();
  const ocr = {
    recognizeWaybill: jest.fn().mockResolvedValue({
      provider: 'mock',
      fields: {
        waybillNo: { value: 'SF1234567890123', confidence: 0.93 },
        phoneTail: { value: '8765', confidence: 0.88 },
        courier: { value: 'SF', raw: '顺丰速运', confidence: 0.81 },
      },
      overallConfidence: 0.87,
      latencyMs: 8,
      warnings: [],
    }),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OcrClient)
      .useValue(ocr)
      .compile();
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

  it('recognizes a waybill image and confirms it through the normal inbound flow', async () => {
    const adminToken = await login('admin', 'admin123456');
    const phone = `131${Date.now().toString().slice(-8)}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `OCR驿站${phone}`,
        ownerName: 'OCR店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    const stationId = open.body.data.stationId;
    const bossToken = await login(phone, 'pw123456');

    const shelf = await request(app.getHttpServer())
      .post(`/api/stations/${stationId}/shelves`)
      .set('Authorization', `Bearer ${bossToken}`)
      .send({ code: 'O', name: 'OCR 货架', zone: 'O' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/shelves/${shelf.body.data.id}/slots/batch`)
      .set('Authorization', `Bearer ${bossToken}`)
      .send({ rows: 1, levels: 1, cols: 1 })
      .expect(201);

    const recognized = await request(app.getHttpServer())
      .post('/api/inbound/ocr/recognize')
      .set('Authorization', `Bearer ${bossToken}`)
      .field('stationId', stationId)
      .attach('image', Buffer.from('fake image'), {
        filename: 'label.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    expect(recognized.body.data).toMatchObject({
      fields: {
        waybillNo: 'SF1234567890123',
        phoneTail: '8765',
        courierCode: 'SF',
      },
      status: 'RECOGNIZED',
      needReview: false,
    });

    const confirmed = await request(app.getHttpServer())
      .post('/api/inbound/ocr/confirm')
      .set('Authorization', `Bearer ${bossToken}`)
      .send({
        recognitionId: recognized.body.data.recognitionId,
        waybillNo: 'SF1234567890123',
        phone: '13800008765',
        courierCode: 'SF',
      })
      .expect(201);

    expect(confirmed.body.data).toMatchObject({
      status: 'STORED',
      slotCode: 'O-01-01-01',
    });

    const repeated = await request(app.getHttpServer())
      .post('/api/inbound/ocr/confirm')
      .set('Authorization', `Bearer ${bossToken}`)
      .send({
        recognitionId: recognized.body.data.recognitionId,
        waybillNo: 'SF1234567890123',
        phone: '13800008765',
        courierCode: 'SF',
      })
      .expect(201);
    expect(repeated.body.data).toEqual(confirmed.body.data);

    const record = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.ocrRecognition.findUniqueOrThrow({
        where: { id: recognized.body.data.recognitionId },
      });
    });
    expect(record.status).toBe('CONFIRMED');
    expect(record.parcelId).toBe(confirmed.body.data.parcelId);
  });

  async function login(username: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(201);
    return res.body.data.accessToken as string;
  }
});
