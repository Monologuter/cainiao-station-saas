import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { FileStorageService } from '../file/file-storage.service';
import { ReportProcessor } from './report.processor';

const REPORT_TYPES = new Map([
  ['daily_summary', 'DAILY_SUMMARY'],
  ['inbound_detail', 'INBOUND_DETAIL'],
  ['pickup_detail', 'PICKUP_DETAIL'],
  ['station_compare', 'STATION_COMPARE'],
]);

const REPORT_FORMATS = new Map([
  ['csv', 'CSV'],
  ['xlsx', 'XLSX'],
]);

interface CreateReportInput {
  type?: string;
  format?: string;
  from?: string;
  to?: string;
  stationId?: string;
}

interface Operator {
  tenantId: string;
  userId: string;
}

interface ReportJobRow {
  id: string;
  status: string;
  type: string;
  format: string;
  rangeFrom: Date;
  rangeTo: Date;
  fileKey?: string | null;
  error?: string | null;
}

@Injectable()
export class ReportService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly processor: ReportProcessor,
    private readonly files: FileStorageService,
  ) {}

  async create(input: CreateReportInput, operator: Operator) {
    const normalized = this.normalize(input);
    const job = await this.tenantPrisma.withTenant<ReportJobRow>((tx) =>
      tx.reportJob.create({
        data: {
          tenantId: operator.tenantId,
          stationId: input.stationId,
          type: normalized.type,
          format: normalized.format,
          rangeFrom: normalized.from,
          rangeTo: normalized.to,
          status: 'PENDING',
          createdBy: operator.userId,
        },
      }),
    );

    await this.processor.process(job.id);
    return { jobId: job.id, status: job.status };
  }

  async get(tenantId: string, jobId: string) {
    const job = await this.tenantPrisma.withTenant<ReportJobRow | null>((tx) =>
      tx.reportJob.findFirst({
        where: { id: jobId, tenantId },
      }),
    );
    if (!job) {
      throw new BizError(ApiCode.NOT_FOUND, '报表任务不存在');
    }

    return {
      id: job.id,
      status: job.status,
      type: job.type,
      format: job.format,
      rangeFrom: this.toDateKey(job.rangeFrom),
      rangeTo: this.toDateKey(job.rangeTo),
      downloadUrl:
        job.status === 'DONE' && job.fileKey
          ? this.files.createDownloadUrl(job.fileKey).downloadUrl
          : undefined,
      error: job.error,
    };
  }

  private normalize(input: CreateReportInput) {
    const type = REPORT_TYPES.get(String(input.type ?? '').toLowerCase());
    const format = REPORT_FORMATS.get(String(input.format ?? '').toLowerCase());
    const from = this.parseDate(input.from);
    const to = this.parseDate(input.to);

    if (!type || !format || !from || !to || from.getTime() > to.getTime()) {
      throw new BizError(ApiCode.BAD_REQUEST, '无效报表区间');
    }

    return { type, format, from, to };
  }

  private parseDate(value?: string) {
    if (!value) {
      return null;
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private toDateKey(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
