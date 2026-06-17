import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Consumer shipping e2e', () => {
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

  it('lets a consumer quote, create, pay, list and track only their own shipping orders', async () => {
    const { stationId } = await openTenant();
    const alice = await verifyConsumer('13000000001');
    const bob = await verifyConsumer('13000000002');

    const quote = await request(app.getHttpServer())
      .post('/api/shipping/consumer/quote')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ ...makeQuoteBody(), stationId })
      .expect(201);
    expect(quote.body.data[0]).toMatchObject({
      courierCode: expect.any(String),
      recommended: true,
    });

    const created = await request(app.getHttpServer())
      .post('/api/shipping/consumer/orders')
      .set('Authorization', `Bearer ${alice.token}`)
      .send(makeOrderBody(stationId))
      .expect(201);
    expect(created.body.data).toMatchObject({
      status: 'CREATED',
      consumerId: alice.consumerId,
      stationId,
    });

    const paid = await request(app.getHttpServer())
      .post(`/api/shipping/consumer/orders/${created.body.data.id}/pay`)
      .set('Authorization', `Bearer ${alice.token}`)
      .set('Idempotency-Key', `consumer-pay-${Date.now()}`)
      .expect(201);
    expect(paid.body.data.status).toBe('PAID');

    const mine = await request(app.getHttpServer())
      .get('/api/shipping/my-orders')
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);
    expect(mine.body.data.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.body.data.id }),
      ]),
    );

    const otherMine = await request(app.getHttpServer())
      .get('/api/shipping/my-orders')
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(200);
    expect(otherMine.body.data.list).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.body.data.id }),
      ]),
    );

    const bobDetail = await request(app.getHttpServer())
      .get(`/api/shipping/consumer/orders/${created.body.data.id}`)
      .set('Authorization', `Bearer ${bob.token}`);
    expect(bobDetail.body.code).toBe(1004);

    const tracks = await request(app.getHttpServer())
      .get(`/api/shipping/consumer/orders/${created.body.data.id}/tracks`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);
    expect(tracks.body.data).toEqual([]);
  });

  async function openTenant() {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const phone = `130${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const opened = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({
        name: '消费者寄件驿站',
        ownerName: '线上店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);

    return { stationId: opened.body.data.stationId as string };
  }

  async function verifyConsumer(phone: string) {
    await request(app.getHttpServer())
      .post('/api/consumer/auth/send-code')
      .send({ phone })
      .expect(201);
    const verified = await request(app.getHttpServer())
      .post('/api/consumer/auth/verify')
      .send({ phone, code: '123456' })
      .expect(201);
    return {
      token: verified.body.data.pickToken as string,
      consumerId: verified.body.data.consumerId as string,
    };
  }

  function makeQuoteBody() {
    return {
      sender: {
        name: '张三',
        phone: '13000000001',
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
      weightGram: 1200,
      preference: 'priceFirst',
    };
  }

  function makeOrderBody(stationId: string) {
    return {
      stationId,
      courierCode: 'YTO',
      sender: {
        name: '张三',
        phone: '13000000001',
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
