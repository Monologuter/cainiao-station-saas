import { ApplicationService } from './application.service';

describe('ApplicationService file detail', () => {
  it('adds temporary download URLs to qualification files without mutating stored JSON', async () => {
    const storedQualifications = [
      {
        type: 'BUSINESS_LICENSE',
        fileKey: 'onboarding/202606/license.jpg',
        fileName: 'license.jpg',
      },
    ];
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      tenantApplication: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'app-1',
          applicationNo: 'APP20260618-0001',
          qualifications: storedQualifications,
        }),
      },
    };
    const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
    const files = {
      createDownloadUrl: jest.fn((fileKey: string) => ({
        downloadUrl: `mock://download/${fileKey}`,
        expiresIn: 600,
      })),
    };
    const service = new ApplicationService(prisma as any, files as any);

    const detail = await service.detail('app-1');

    expect(tx.tenantApplication.findUnique).toHaveBeenCalledWith({
      where: { id: 'app-1' },
    });
    expect(detail.qualifications).toEqual([
      {
        ...storedQualifications[0],
        downloadUrl: 'mock://download/onboarding/202606/license.jpg',
      },
    ]);
    expect(storedQualifications[0]).not.toHaveProperty('downloadUrl');
  });
});
