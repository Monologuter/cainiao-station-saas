import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { NotifyChannelType } from './notify-channel';

@Injectable()
export class TemplateRenderer {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async render(
    code: string,
    channel: NotifyChannelType,
    vars: Record<string, string>,
  ) {
    const template = await this.tenantPrisma.withTenant(async (tx) => {
      const tenantTemplate = await tx.notifyTemplate.findFirst({
        where: { code, channel, tenantId: { not: null }, enabled: true },
        orderBy: { createdAt: 'desc' },
      });
      if (tenantTemplate) return tenantTemplate;

      return tx.notifyTemplate.findFirst({
        where: { code, channel, tenantId: null, enabled: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    if (!template) {
      throw new BizError(ApiCode.NOT_FOUND, '通知模板不存在');
    }

    return {
      content: Object.entries(vars).reduce(
        (content, [key, value]) => content.replaceAll(`{${key}}`, value ?? ''),
        template.content,
      ),
    };
  }
}
