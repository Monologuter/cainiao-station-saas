import { Injectable, Optional } from '@nestjs/common';
import { MultiLevelCacheService } from '../../core/cache/multi-level-cache.service';
import { ApiCode, BizError } from '../../core/http/api-code';
import { PrismaService } from '../../core/prisma/prisma.service';

const RUNTIME_CONFIG_CACHE_TTL_MS = 30_000;

@Injectable()
export class RuntimeConfigService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cache?: MultiLevelCacheService,
  ) {}

  async get(key: string): Promise<unknown> {
    if (this.cache) {
      return this.cache.getOrLoad(
        this.cacheKey(key),
        RUNTIME_CONFIG_CACHE_TTL_MS,
        () => this.load(key),
      );
    }
    return this.load(key);
  }

  async invalidate(key: string) {
    await this.cache?.invalidate(this.cacheKey(key));
  }

  envKeyFor(key: string) {
    return `CAINIAO_CONFIG_${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  }

  private async load(key: string) {
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
    return value;
  }

  private cacheKey(key: string) {
    return `runtime-config:${key}`;
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
