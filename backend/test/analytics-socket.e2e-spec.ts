import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';
import { RealtimePublisher } from '../apps/api/src/modules/analytics/realtime.publisher';

describe('Analytics socket e2e', () => {
  let app: INestApplication;
  let baseUrl: string;

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
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(() => app.close());

  it('disconnects invalid JWT clients', async () => {
    const socket = io(`${baseUrl}/analytics`, {
      auth: { token: 'invalid-token' },
      reconnection: false,
      timeout: 1000,
    });

    await expect(waitForDisconnect(socket)).resolves.toBe(true);
    socket.close();
  });

  it('sends snapshot init and tenant-isolated metric updates', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken, 'socket-main');
    const otherBoss = await openTenant(adminToken, 'socket-other');
    const publisher = app.get(RealtimePublisher);

    const socket = io(`${baseUrl}/analytics`, {
      auth: { token: boss.token },
      reconnection: false,
      timeout: 2000,
    });
    const otherSocket = io(`${baseUrl}/analytics`, {
      auth: { token: otherBoss.token },
      reconnection: false,
      timeout: 2000,
    });

    const snapshot = await once(socket, 'snapshot:init');
    expect(snapshot).toMatchObject({
      overview: expect.any(Object),
      ranking: expect.any(Object),
    });
    await once(otherSocket, 'snapshot:init');

    const metricPromise = once(socket, 'metric:update');
    const otherMetricPromise = expectNoEvent(otherSocket, 'metric:update');
    publisher.publishMetric({
      tenantId: boss.tenantId,
      stationId: boss.stationId,
      metric: 'inbound',
      value: 3,
      delta: 1,
      date: today(),
    });

    await expect(metricPromise).resolves.toMatchObject({
      tenantId: boss.tenantId,
      stationId: boss.stationId,
      metric: 'inbound',
      value: 3,
    });
    await expect(otherMetricPromise).resolves.toBe(true);

    socket.emit('subscribe:station', { stationId: otherBoss.stationId });
    const leakedStationEvent = expectNoEvent(socket, 'metric:update');
    publisher.publishMetric({
      tenantId: otherBoss.tenantId,
      stationId: otherBoss.stationId,
      metric: 'pickup',
      value: 1,
      delta: 1,
      date: today(),
    });
    await expect(leakedStationEvent).resolves.toBe(true);

    socket.close();
    otherSocket.close();
  });

  async function login(username: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(201);
    return res.body.data.accessToken as string;
  }

  async function openTenant(adminToken: string, suffix: string) {
    const phone = `132${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `实时大屏${suffix}`,
        ownerName: '实时店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    const token = await login(phone, 'pw123456');
    return {
      tenantId: open.body.data.tenantId as string,
      stationId: open.body.data.stationId as string,
      token,
    };
  }

  function once(socket: Socket, event: string) {
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timeout waiting for ${event}`)),
        2000,
      );
      socket.once(event, (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
      socket.once('connect_error', reject);
    });
  }

  function expectNoEvent(socket: Socket, event: string) {
    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => resolve(true), 250);
      socket.once(event, (payload) => {
        clearTimeout(timer);
        reject(new Error(`unexpected ${event}: ${JSON.stringify(payload)}`));
      });
    });
  }

  function waitForDisconnect(socket: Socket) {
    return new Promise<boolean>((resolve) => {
      socket.once('disconnect', () => resolve(true));
      socket.once('connect_error', () => resolve(true));
      setTimeout(() => resolve(!socket.connected), 1000);
    });
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }
});
