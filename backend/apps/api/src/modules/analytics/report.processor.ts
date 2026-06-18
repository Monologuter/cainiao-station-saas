import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { FileStorageService } from '../file/file-storage.service';

@Injectable()
export class ReportProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FileStorageService,
  ) {}

  async process(jobId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const job = await tx.reportJob.findUnique({ where: { id: jobId } });
      if (!job) {
        return;
      }

      await tx.reportJob.update({
        where: { id: job.id },
        data: { status: 'RUNNING', error: null },
      });

      try {
        const body = await this.buildCsv(tx, job);
        const fileKey = this.reportFileKey(job);
        await this.files.storeObject({
          fileKey,
          contentType: 'text/csv; charset=utf-8',
          body,
        });
        await tx.reportJob.update({
          where: { id: job.id },
          data: {
            status: 'DONE',
            fileKey,
            error: null,
          },
        });
      } catch (error) {
        await tx.reportJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            error: error instanceof Error ? error.message : 'report failed',
          },
        });
      }
    });
  }

  private async buildCsv(tx: any, job: any) {
    if (job.type !== 'DAILY_SUMMARY') {
      return 'date,metric,value\n';
    }

    const rows = await tx.metricDaily.findMany({
      where: {
        tenantId: job.tenantId,
        stationId: job.stationId ?? undefined,
        statDate: { gte: job.rangeFrom, lte: job.rangeTo },
      },
      orderBy: [{ statDate: 'asc' }, { metric: 'asc' }],
    });

    return [
      'date,metric,value',
      ...rows.map(
        (row: any) =>
          `${row.statDate.toISOString().slice(0, 10)},${row.metric},${row.value}`,
      ),
    ].join('\n');
  }

  private reportFileKey(job: any) {
    const month = `${job.rangeFrom.getUTCFullYear()}${String(
      job.rangeFrom.getUTCMonth() + 1,
    ).padStart(2, '0')}`;
    return `reports/${job.tenantId}/${month}/${job.id}.${job.format.toLowerCase()}`;
  }
}
