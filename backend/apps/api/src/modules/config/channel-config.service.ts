import { Injectable, Optional } from '@nestjs/common';
import { MultiLevelCacheService } from '../../core/cache/multi-level-cache.service';
import { ApiCode, BizError } from '../../core/http/api-code';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ProviderRegistry } from './provider-registry';

export type UpdateChannelConfigInput = {
  provider?: string;
  enabled?: boolean;
  fallbackProvider?: string;
  config?: unknown;
};

@Injectable()
export class ChannelConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
    @Optional() private readonly cache?: MultiLevelCacheService,
  ) {}

  async list() {
    const records = (await this.withBypass((tx) =>
      tx.channelConfig.findMany({ orderBy: { channel: 'asc' } }),
    )) as any[];
    return records.map((record) => this.present(record));
  }

  async get(channel: string) {
    return (
      this.cache?.getOrLoad(this.cacheKey(channel), 30_000, () =>
        this.loadChannel(channel),
      ) ?? this.loadChannel(channel)
    );
  }

  async update(
    channel: string,
    input: UpdateChannelConfigInput,
    userId?: string,
  ) {
    const updated = (await this.withBypass(async (tx) => {
      const current = await tx.channelConfig.findUnique({ where: { channel } });
      if (!current) {
        throw new BizError(ApiCode.NOT_FOUND, '渠道配置不存在');
      }

      const provider = input.provider ?? current.provider;
      const fallbackProvider =
        input.fallbackProvider === undefined
          ? current.fallbackProvider
          : input.fallbackProvider;
      this.assertRegistered(channel, provider);
      if (fallbackProvider) {
        this.assertRegistered(channel, fallbackProvider);
      }

      return tx.channelConfig.update({
        where: { channel },
        data: {
          provider,
          enabled: input.enabled ?? current.enabled,
          fallbackProvider,
          config:
            input.config === undefined ? current.config : (input.config as any),
          updatedBy: userId,
        },
      });
    })) as any;

    await this.cache?.invalidate(this.cacheKey(channel));
    return this.present(updated);
  }

  private async loadChannel(channel: string) {
    const record = (await this.withBypass((tx) =>
      tx.channelConfig.findUnique({ where: { channel } }),
    )) as any;
    if (!record) {
      throw new BizError(ApiCode.NOT_FOUND, '渠道配置不存在');
    }
    return this.present(record);
  }

  private cacheKey(channel: string) {
    return `channel:${channel}`;
  }

  private present(record: any) {
    return {
      ...record,
      registeredProviders: this.registry.providersFor(record.channel),
    };
  }

  private assertRegistered(channel: string, provider: string) {
    if (!this.registry.isRegistered(channel, provider)) {
      throw new BizError(ApiCode.BAD_REQUEST, '渠道 provider 未注册');
    }
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
