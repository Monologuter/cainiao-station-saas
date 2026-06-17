import { Injectable } from '@nestjs/common';
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
  constructor(private readonly prisma: PrismaService) {}

  listDictionaries() {
    return this.withBypass((tx) =>
      tx.dictionary.findMany({
        orderBy: [{ sort: 'asc' }, { type: 'asc' }],
        include: { _count: { select: { items: true } } },
      }),
    );
  }

  async listItems(type: string, enabledOnly = false) {
    return this.withBypass(async (tx) => {
      const dictionary = await this.findDictionaryOrThrow(tx, type);
      return tx.dictItem.findMany({
        where: {
          dictionaryId: dictionary.id,
          enabled: enabledOnly ? true : undefined,
        },
        orderBy: [{ sort: 'asc' }, { code: 'asc' }],
      });
    });
  }

  async createItem(type: string, input: CreateDictItemInput) {
    return this.withBypass(async (tx) => {
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
  }

  async updateItem(id: string, input: UpdateDictItemInput) {
    return this.withBypass(async (tx) => {
      const current = await tx.dictItem.findUnique({ where: { id } });
      if (!current) {
        throw new BizError(ApiCode.NOT_FOUND, '字典项不存在');
      }

      return tx.dictItem.update({
        where: { id },
        data: {
          label: input.label,
          value: input.value as any,
          enabled: input.enabled,
          sort: input.sort,
          remark: input.remark,
        },
      });
    });
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
