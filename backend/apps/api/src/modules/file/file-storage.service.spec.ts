import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiCode, BizError } from '../../core/http/api-code';
import { FileStorageService } from './file-storage.service';

describe('FileStorageService', () => {
  it('creates mock onboarding upload URLs with stable object keys', () => {
    const service = new FileStorageService();

    const result = service.createUploadUrl({
      fileType: 'BUSINESS_LICENSE',
      contentType: 'image/jpeg',
      now: new Date('2026-06-18T00:00:00.000Z'),
    });

    expect(result.fileKey).toMatch(
      /^onboarding\/202606\/[a-f0-9-]+-business-license\.jpg$/,
    );
    expect(result.uploadUrl).toBe(`mock://upload/${result.fileKey}`);
    expect(result.expiresIn).toBe(600);
  });

  it('rejects unsupported file types or content types', () => {
    const service = new FileStorageService();

    expectBadRequest(() =>
      service.createUploadUrl({
        fileType: 'SCRIPT',
        contentType: 'image/jpeg',
      }),
    );
    expectBadRequest(() =>
      service.createUploadUrl({
        fileType: 'BUSINESS_LICENSE',
        contentType: 'text/html',
      }),
    );
  });

  it('creates temporary download URLs only for managed object keys', () => {
    const service = new FileStorageService();

    expect(
      service.createDownloadUrl('onboarding/202606/license.jpg').downloadUrl,
    ).toBe('mock://download/onboarding/202606/license.jpg');
    expect(
      service.createDownloadUrl('reports/tenant-1/202606/report.csv')
        .downloadUrl,
    ).toBe('mock://download/reports/tenant-1/202606/report.csv');
    expectBadRequest(() => service.createDownloadUrl('../report.csv'));
  });

  it('creates private waybill image object keys', () => {
    const service = new FileStorageService();

    const result = service.createWaybillImageObject({
      tenantId: 'tenant-1',
      contentType: 'image/jpeg',
      now: new Date('2026-06-18T00:00:00.000Z'),
    });

    expect(result.fileKey).toMatch(
      /^waybills\/tenant-1\/20260618\/[a-f0-9-]+\.jpg$/,
    );
    expect(result.uploadUrl).toBe(`mock://upload/${result.fileKey}`);
  });

  it('stores generated report content in the configured mock storage root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cainiao-report-'));
    const originalRoot = process.env.FILE_STORAGE_ROOT;
    process.env.FILE_STORAGE_ROOT = root;
    const service = new FileStorageService();

    await service.storeObject({
      fileKey: 'reports/tenant-1/202606/job-1.csv',
      contentType: 'text/csv; charset=utf-8',
      body: 'date,metric,value\n2026-06-18,inbound,3',
    });

    await expect(
      readFile(join(root, 'reports/tenant-1/202606/job-1.csv'), 'utf8'),
    ).resolves.toContain('2026-06-18,inbound,3');
    process.env.FILE_STORAGE_ROOT = originalRoot;
    await rm(root, { recursive: true, force: true });
  });

  function expectBadRequest(fn: () => unknown) {
    try {
      fn();
      throw new Error('Expected function to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BizError);
      expect((error as BizError).code).toBe(ApiCode.BAD_REQUEST);
    }
  }
});
