import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class ReportProcessor {
  constructor(private readonly prisma: PrismaService) {}

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
        await this.buildCsv(tx, job);
        await tx.reportJob.update({
          where: { id: job.id },
          data: {
            status: 'DONE',
            fileKey: `mock://reports/${job.id}.${job.format.toLowerCase()}`,
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
}
