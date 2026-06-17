import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class RuntimeConfigService {
  private readonly cache = new Map<string, unknown>();

  constructor(private readonly prisma: PrismaService) {}

  async get(key: string): Promise<unknown> {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    const record = (await this.withBypass((tx) =>
      tx.systemConfig.findUnique({ where: { configKey: key } }),
    )) as any;
    if (!record) {
      throw new BizError(ApiCode.NOT_FOUND, '系统参数不存在');
    }

    const envValue = process.env[this.envKeyFor(key)];
    const value =
      envValue !== undefined
        ? parseValue(envValue, record.valueType)
        : (record.value ?? record.defaultValue);
    this.cache.set(key, value);
    return value;
  }

  invalidate(key: string) {
    this.cache.delete(key);
  }

  envKeyFor(key: string) {
    return `CAINIAO_CONFIG_${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
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

function parseValue(value: string, valueType: string) {
  if (valueType === 'NUMBER') {
    return Number(value);
  }
  if (valueType === 'BOOLEAN') {
    return value === 'true' || value === '1';
  }
  if (valueType === 'JSON') {
    return JSON.parse(value);
  }
  return value;
}
