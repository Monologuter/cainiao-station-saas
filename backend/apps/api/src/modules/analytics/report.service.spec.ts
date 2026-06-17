import { ApiCode, BizError } from '../../core/http/api-code';
import { ReportProcessor } from './report.processor';
import { ReportService } from './report.service';

function createReportService() {
  const tx = {
    reportJob: {
      create: jest.fn().mockResolvedValue({
        id: 'job-1',
        status: 'PENDING',
      }),
      findFirst: jest.fn(),
    },
  };
  const tenantPrisma = { withTenant: (fn: any) => fn(tx) } as any;
  const processor = { process: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new ReportService(
      tenantPrisma,
      processor as unknown as ReportProcessor,
    ),
    tx,
    processor,
  };
}

describe('ReportService', () => {
  it('creates a pending report job and starts synchronous processing', async () => {
    const { service, tx, processor } = createReportService();

    await expect(
      service.create(
        {
          type: 'daily_summary',
          format: 'csv',
          from: '2026-06-18',
          to: '2026-06-18',
          stationId: 's1',
        },
        { tenantId: 't1', userId: 'u1' },
      ),
    ).resolves.toEqual({ jobId: 'job-1', status: 'PENDING' });

    expect(tx.reportJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 't1',
          stationId: 's1',
          type: 'DAILY_SUMMARY',
          format: 'CSV',
          status: 'PENDING',
          createdBy: 'u1',
        }),
      }),
    );
    expect(processor.process).toHaveBeenCalledWith('job-1');
  });

  it('rejects invalid report ranges', async () => {
    const { service } = createReportService();

    await expect(
      service.create(
        {
          type: 'daily_summary',
          format: 'csv',
          from: '2026-06-19',
          to: '2026-06-18',
        },
        { tenantId: 't1', userId: 'u1' },
      ),
    ).rejects.toMatchObject(new BizError(ApiCode.BAD_REQUEST, '无效报表区间'));
  });

  it('returns download url only for jobs in the current tenant', async () => {
    const { service, tx } = createReportService();
    tx.reportJob.findFirst.mockResolvedValue({
      id: 'job-1',
      status: 'DONE',
      fileKey: 'mock://reports/job-1.csv',
      error: null,
      format: 'CSV',
      type: 'DAILY_SUMMARY',
      rangeFrom: new Date('2026-06-18T00:00:00.000Z'),
      rangeTo: new Date('2026-06-18T00:00:00.000Z'),
    });

    await expect(service.get('t1', 'job-1')).resolves.toMatchObject({
      id: 'job-1',
      status: 'DONE',
      downloadUrl: 'mock://reports/job-1.csv',
    });
    expect(tx.reportJob.findFirst).toHaveBeenCalledWith({
      where: { id: 'job-1', tenantId: 't1' },
    });
  });
});

describe('ReportProcessor', () => {
  it('marks a report job done with a mock file key', async () => {
    const tx = createProcessorTx();
    const processor = new ReportProcessor({
      $transaction: (fn: any) => fn(tx),
    } as any);

    await processor.process('job-1');

    expect(tx.reportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DONE',
          fileKey: 'mock://reports/job-1.csv',
        }),
      }),
    );
  });

  it('marks a report job failed when generation throws', async () => {
    const tx = createProcessorTx();
    tx.metricDaily.findMany.mockRejectedValue(new Error('csv failed'));
    const processor = new ReportProcessor({
      $transaction: (fn: any) => fn(tx),
    } as any);

    await processor.process('job-1');

    expect(tx.reportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          error: 'csv failed',
        }),
      }),
    );
  });

  function createProcessorTx() {
    return {
      $executeRawUnsafe: jest.fn(),
      reportJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'job-1',
          tenantId: 't1',
          stationId: 's1',
          type: 'DAILY_SUMMARY',
          format: 'CSV',
          rangeFrom: new Date('2026-06-18T00:00:00.000Z'),
          rangeTo: new Date('2026-06-18T00:00:00.000Z'),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      metricDaily: {
        findMany: jest.fn().mockResolvedValue([
          {
            statDate: new Date('2026-06-18T00:00:00.000Z'),
            metric: 'inbound',
            value: BigInt(3),
          },
        ]),
      },
    };
  }
});
