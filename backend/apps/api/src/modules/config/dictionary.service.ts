import { Injectable, Optional } from '@nestjs/common';
import { MultiLevelCacheService } from '../../core/cache/multi-level-cache.service';
import { ApiCode, BizError } from '../../core/http/api-code';
import { PrismaService } from '../../core/prisma/prisma.service';

export type CreateDictItemInput = {
  code: string;
  label: string;
  value?: unknown;
  sort?: number;
  remark?: string;
};

export type UpdateDictItemInput = {
  label?: string;
  value?: unknown;
  enabled?: boolean;
  sort?: number;
  remark?: string;
};

@Injectable()
export class DictionaryService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cache?: MultiLevelCacheService,
  ) {}

  listDictionaries() {
    return this.withBypass((tx) =>
      tx.dictionary.findMany({
        orderBy: [{ sort: 'asc' }, { type: 'asc' }],
        include: { _count: { select: { items: true } } },
      }),
    );
  }

  async listItems(type: string, enabledOnly = false) {
    return this.cachedItems(type, enabledOnly, () =>
      this.withBypass(async (tx) => {
        const dictionary = await this.findDictionaryOrThrow(tx, type);
        return tx.dictItem.findMany({
          where: {
            dictionaryId: dictionary.id,
            enabled: enabledOnly ? true : undefined,
          },
          orderBy: [{ sort: 'asc' }, { code: 'asc' }],
        });
      }),
    );
  }

  async createItem(type: string, input: CreateDictItemInput) {
    const created = await this.withBypass(async (tx) => {
      const dictionary = await this.findDictionaryOrThrow(tx, type);
      const exists = await tx.dictItem.findUnique({
        where: {
          dictionaryId_code: {
            dictionaryId: dictionary.id,
            code: input.code,
          },
        },
      });
      if (exists) {
        throw new BizError(ApiCode.BAD_REQUEST, '字典项 code 已存在');
      }

      return tx.dictItem.create({
        data: {
          dictionaryId: dictionary.id,
          code: input.code,
          label: input.label,
          value: input.value as any,
          sort: input.sort ?? 0,
          remark: input.remark,
        },
      });
    });
    await this.invalidateItems(type);
    return created;
  }

  async updateItem(id: string, input: UpdateDictItemInput) {
    const updated = await this.withBypass(async (tx) => {
      const current = await tx.dictItem.findUnique({
        where: { id },
        include: { dictionary: { select: { type: true } } },
      });
      if (!current) {
        throw new BizError(ApiCode.NOT_FOUND, '字典项不存在');
      }

      const item = await tx.dictItem.update({
        where: { id },
        data: {
          label: input.label,
          value: input.value as any,
          enabled: input.enabled,
          sort: input.sort,
          remark: input.remark,
        },
      });
      return { item, type: current.dictionary.type };
    });
    await this.invalidateItems(updated.type);
    return updated.item;
  }

  private cachedItems<T>(
    type: string,
    enabledOnly: boolean,
    loader: () => Promise<T>,
  ) {
    const key = this.itemCacheKey(type, enabledOnly);
    return this.cache?.getOrLoad(key, 60_000, loader, 5000) ?? loader();
  }

  private async invalidateItems(type: string) {
    await Promise.all([
      this.cache?.invalidate(this.itemCacheKey(type, false)),
      this.cache?.invalidate(this.itemCacheKey(type, true)),
    ]);
  }

  private itemCacheKey(type: string, enabledOnly: boolean) {
    return `dict:${type}:${enabledOnly ? 'enabled' : 'all'}`;
  }

  private async findDictionaryOrThrow(tx: any, type: string) {
    const dictionary = await tx.dictionary.findUnique({ where: { type } });
    if (!dictionary) {
      throw new BizError(ApiCode.NOT_FOUND, '字典不存在');
    }
    return dictionary;
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
