import { Injectable } from '@nestjs/common';
import { NotifyChannelType } from '@prisma/client';
import { ApiCode, BizError } from '../../core/http/api-code';
import { PrismaService } from '../../core/prisma/prisma.service';

export type CreateNotifyTemplateInput = {
  code: string;
  channel: keyof typeof NotifyChannelType;
  content: string;
  enabled?: boolean;
};

export type UpdateNotifyTemplateInput = {
  code?: string;
  channel?: keyof typeof NotifyChannelType;
  content?: string;
  enabled?: boolean;
};

@Injectable()
export class NotifyTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: { code?: string; channel?: keyof typeof NotifyChannelType }) {
    return this.withBypass((tx) =>
      tx.notifyTemplate.findMany({
        where: {
          tenantId: null,
          code: filter.code,
          channel: filter.channel,
        },
        orderBy: [{ code: 'asc' }, { channel: 'asc' }],
      }),
    );
  }

  async create(input: CreateNotifyTemplateInput) {
    return this.withBypass(async (tx) => {
      await this.assertScene(tx, input.code);
      await this.assertUnique(tx, input.code, input.channel);
      return tx.notifyTemplate.create({
        data: {
          tenantId: null,
          code: input.code,
          channel: input.channel,
          content: input.content,
          enabled: input.enabled ?? true,
        },
      });
    });
  }

  async update(id: string, input: UpdateNotifyTemplateInput) {
    return this.withBypass(async (tx) => {
      const current = await tx.notifyTemplate.findUnique({ where: { id } });
      if (!current || current.tenantId) {
        throw new BizError(ApiCode.NOT_FOUND, '通知模板不存在');
      }

      const nextCode = input.code ?? current.code;
      const nextChannel = input.channel ?? current.channel;
      await this.assertScene(tx, nextCode);
      if (nextCode !== current.code || nextChannel !== current.channel) {
        await this.assertUnique(tx, nextCode, nextChannel);
      }

      return tx.notifyTemplate.update({
        where: { id },
        data: {
          code: input.code,
          channel: input.channel,
          content: input.content,
          enabled: input.enabled,
        },
      });
    });
  }

  private async assertScene(tx: any, code: string) {
    const dictionary = await tx.dictionary.findUnique({
      where: { type: 'notify_scene' },
    });
    const item = dictionary
      ? await tx.dictItem.findUnique({
          where: {
            dictionaryId_code: {
              dictionaryId: dictionary.id,
              code,
            },
          },
        })
      : null;
    if (!item?.enabled) {
      throw new BizError(ApiCode.BAD_REQUEST, '通知场景未在字典中启用');
    }
  }

  private async assertUnique(
    tx: any,
    code: string,
    channel: keyof typeof NotifyChannelType,
  ) {
    const exists = await tx.notifyTemplate.findFirst({
      where: { tenantId: null, code, channel },
    });
    if (exists) {
      throw new BizError(ApiCode.BAD_REQUEST, '通知模板已存在');
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
