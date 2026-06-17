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

  it('creates temporary download URLs only for onboarding keys', () => {
    const service = new FileStorageService();

    expect(
      service.createDownloadUrl('onboarding/202606/license.jpg').downloadUrl,
    ).toBe('mock://download/onboarding/202606/license.jpg');
    expectBadRequest(() => service.createDownloadUrl('reports/report.csv'));
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
