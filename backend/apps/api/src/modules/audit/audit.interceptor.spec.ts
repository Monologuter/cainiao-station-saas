import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AUDIT_METADATA, AuditOptions } from './audit.decorator';
import { AuditInterceptor } from './audit.interceptor';

describe('AuditInterceptor', () => {
  it('records successful audited write operations without changing the response', async () => {
    const handler = function auditedHandler() {};
    const options: AuditOptions = {
      action: 'config.channel.update',
      resourceType: 'channel_config',
      summary: ({ response }) => `updated ${(response as any).channel}`,
    };
    Reflect.defineMetadata(AUDIT_METADATA, options, handler);
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const interceptor = new AuditInterceptor(new Reflector(), audit as any);

    const response = await lastValueFrom(
      interceptor.intercept(
        createContext(handler, {
          user: {
            userId: 'user-1',
            tenantId: null,
            isPlatform: true,
          },
          ip: '127.0.0.1',
          headers: {
            'user-agent': 'jest',
            'x-request-id': 'req-1',
          },
        }),
        createCallHandler(of({ channel: 'sms' })),
      ),
    );

    expect(response).toEqual({ channel: 'sms' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: null,
        actorId: 'user-1',
        actorType: 'PLATFORM',
        action: 'config.channel.update',
        resourceType: 'channel_config',
        result: 'SUCCESS',
        summary: 'updated sms',
        ip: '127.0.0.1',
        userAgent: 'jest',
        requestId: 'req-1',
      }),
    );
  });

  it('records failures and rethrows the original error', async () => {
    const handler = function failingHandler() {};
    Reflect.defineMetadata(
      AUDIT_METADATA,
      { action: 'tenant.reject', resourceType: 'tenant_application' },
      handler,
    );
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const interceptor = new AuditInterceptor(new Reflector(), audit as any);
    const error = new Error('boom');

    await expect(
      lastValueFrom(
        interceptor.intercept(
          createContext(handler, {
            user: {
              userId: 'user-2',
              tenantId: 'tenant-1',
              isPlatform: false,
            },
            headers: {},
          }),
          createCallHandler(throwError(() => error)),
        ),
      ),
    ).rejects.toBe(error);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: 'user-2',
        actorType: 'STAFF',
        action: 'tenant.reject',
        resourceType: 'tenant_application',
        result: 'FAILURE',
        errorMessage: 'boom',
      }),
    );
  });

  it('does not let audit record failures affect the audited response', async () => {
    const handler = function auditedHandler() {};
    Reflect.defineMetadata(
      AUDIT_METADATA,
      { action: 'config.update', resourceType: 'system_config' },
      handler,
    );
    const audit = { record: jest.fn().mockRejectedValue(new Error('db down')) };
    const interceptor = new AuditInterceptor(new Reflector(), audit as any);

    await expect(
      lastValueFrom(
        interceptor.intercept(
          createContext(handler, { user: { isPlatform: true }, headers: {} }),
          createCallHandler(of({ ok: true })),
        ),
      ),
    ).resolves.toEqual({ ok: true });
  });

  it('ignores handlers without @Audit metadata', async () => {
    const audit = { record: jest.fn() };
    const interceptor = new AuditInterceptor(new Reflector(), audit as any);

    await lastValueFrom(
      interceptor.intercept(
        createContext(function plainHandler() {}, { headers: {} }),
        createCallHandler(of({ ok: true })),
      ),
    );

    expect(audit.record).not.toHaveBeenCalled();
  });
});

function createContext(handler: Function, request: any): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as any;
}

function createCallHandler(source: any): CallHandler {
  return { handle: () => source };
}
