import { Injectable } from '@nestjs/common';
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
  private readonly cache = new Map<string, any>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
  ) {}

  async list() {
    const records = (await this.withBypass((tx) =>
      tx.channelConfig.findMany({ orderBy: { channel: 'asc' } }),
    )) as any[];
    return records.map((record) => this.present(record));
  }

  async get(channel: string) {
    if (this.cache.has(channel)) {
      return this.cache.get(channel);
    }

    const record = (await this.withBypass((tx) =>
      tx.channelConfig.findUnique({ where: { channel } }),
    )) as any;
    if (!record) {
      throw new BizError(ApiCode.NOT_FOUND, '渠道配置不存在');
    }
    const presented = this.present(record);
    this.cache.set(channel, presented);
    return presented;
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

    this.cache.delete(channel);
    return this.present(updated);
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
