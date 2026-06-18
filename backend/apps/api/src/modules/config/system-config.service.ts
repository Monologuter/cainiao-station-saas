import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RuntimeConfigService } from './runtime-config.service';

export type UpdateSystemConfigInput = {
  value: unknown;
};

@Injectable()
export class SystemConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: RuntimeConfigService,
  ) {}

  async list(group?: string) {
    const records = (await this.withBypass((tx) =>
      tx.systemConfig.findMany({
        where: { group },
        orderBy: [{ group: 'asc' }, { configKey: 'asc' }],
      }),
    )) as any[];

    return Promise.all(records.map((record) => this.present(record)));
  }

  async update(key: string, input: UpdateSystemConfigInput, userId?: string) {
    const updated = await this.withBypass(async (tx) => {
      const current = await tx.systemConfig.findUnique({
        where: { configKey: key },
      });
      if (!current) {
        throw new BizError(ApiCode.NOT_FOUND, '系统参数不存在');
      }
      if (!current.editable) {
        throw new BizError(ApiCode.BAD_REQUEST, '系统参数不可编辑');
      }
      return tx.systemConfig.update({
        where: { configKey: key },
        data: {
          value: input.value as any,
          updatedBy: userId,
        },
      });
    });

    await this.runtime.invalidate(key);
    return this.present(updated);
  }

  private async present(record: any) {
    const effectiveValue = await this.runtime.get(record.configKey);
    return {
      ...record,
      value: record.secret ? '[REDACTED]' : record.value,
      defaultValue: record.secret ? '[REDACTED]' : record.defaultValue,
      effectiveValue: record.secret ? '[REDACTED]' : effectiveValue,
    };
  }

  private async withBypass<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return fn(tx);
    });
  }
}
