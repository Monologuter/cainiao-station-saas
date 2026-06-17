import { ApiCode, BizError } from '../../../core/http/api-code';
import { ApplicationService } from './application.service';

describe('ApplicationService', () => {
  it('submits a pending company application with a generated application number', async () => {
    const { service, tx } = createService();

    const result = await service.submit(companyInput());

    expect(result.status).toBe('PENDING');
    expect(result.applicationNo).toMatch(/^APP\d{8}-/);
    expect(tx.tenantApplication.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        applicationNo: result.applicationNo,
        status: 'PENDING',
        entityType: 'COMPANY',
        entityName: '上海测试科技有限公司',
        contactPhone: '13800000001',
      }),
    });
  });

  it('rejects duplicate pending applications by contact phone', async () => {
    const { service } = createService({
      pendingApplication: { applicationNo: 'APP20260618-0001' },
    });

    await expect(service.submit(companyInput())).rejects.toMatchObject({
      code: ApiCode.BAD_REQUEST,
      message: expect.stringContaining('已有待审核申请'),
    });
  });

  it('rejects company or individual applications with missing qualifications', async () => {
    const { service } = createService();

    await expect(
      service.submit({
        ...companyInput(),
        unifiedCreditCode: undefined,
      }),
    ).rejects.toBeInstanceOf(BizError);
    await expect(
      service.submit({
        ...companyInput(),
        entityType: 'INDIVIDUAL',
        unifiedCreditCode: undefined,
        qualifications: [{ type: 'ID_CARD_FRONT', fileKey: 'a', fileName: 'a' }],
      }),
    ).rejects.toMatchObject({
      code: ApiCode.BAD_REQUEST,
      message: expect.stringContaining('资质材料不完整'),
    });
  });

  it('rejects contact phones that already belong to a staff account', async () => {
    const { service } = createService({
      existingUser: { id: 'user-1' },
    });

    await expect(service.submit(companyInput())).rejects.toMatchObject({
      code: ApiCode.BAD_REQUEST,
      message: expect.stringContaining('已注册门店'),
    });
  });

  it('tracks only the applicant-visible status and reject reason', async () => {
    const { service, tx } = createService({
      trackApplication: {
        status: 'REJECTED',
        rejectReason: '证件照片不清晰',
        reviewedBy: 'admin',
        approvedTenantId: 'tenant-1',
      },
    });

    const result = await service.track('APP20260618-0002', '13800000002');

    expect(tx.tenantApplication.findFirst).toHaveBeenCalledWith({
      where: {
        applicationNo: 'APP20260618-0002',
        contactPhone: '13800000002',
        deletedAt: null,
      },
      select: { applicationNo: true, status: true, rejectReason: true },
    });
    expect(result).toEqual({
      applicationNo: 'APP20260618-0002',
      status: 'REJECTED',
      rejectReason: '证件照片不清晰',
    });
  });

  function createService(options: any = {}) {
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      tenantApplication: {
        findFirst: jest.fn().mockImplementation((args) => {
          if (args?.where?.status === 'PENDING') {
            return Promise.resolve(options.pendingApplication ?? null);
          }
          if (args?.select?.applicationNo) {
            const row = options.trackApplication;
            return Promise.resolve(
              row
                ? {
                    applicationNo: args.where.applicationNo,
                    status: row.status,
                    rejectReason: row.rejectReason,
                    reviewedBy: row.reviewedBy,
                    approvedTenantId: row.approvedTenantId,
                  }
                : null,
            );
          }
          return Promise.resolve(null);
        }),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            applicationNo: data.applicationNo,
            status: data.status,
          }),
        ),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(options.existingUser ?? null),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn) => fn(tx)),
    };
    return { service: new ApplicationService(prisma as any), tx };
  }

  function companyInput() {
    return {
      entityType: 'COMPANY' as const,
      entityName: '上海测试科技有限公司',
      unifiedCreditCode: '91310000123456789X',
      regionCode: '310000',
      contactName: '张三',
      contactPhone: '13800000001',
      contactEmail: 'apply@example.com',
      stationName: '张三菜鸟驿站',
      stationAddress: '上海市测试路 1 号',
      proposedPlanCode: 'BASIC',
      qualifications: [
        {
          type: 'BUSINESS_LICENSE',
          fileKey: 'onboarding/202606/license.jpg',
          fileName: 'license.jpg',
        },
      ],
    };
  }
});
