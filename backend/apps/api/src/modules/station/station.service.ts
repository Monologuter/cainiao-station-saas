import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { TenantContext } from '../../core/tenant-context/tenant-context';

interface CreateShelfInput {
  code: string;
  name: string;
  zone?: string;
}

@Injectable()
export class StationService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async createShelf(stationId: string, input: CreateShelfInput) {
    const ctx = TenantContext.get();
    if (!ctx?.tenantId) {
      throw new BizError(ApiCode.BAD_REQUEST, '缺少租户上下文');
    }

    return this.tenantPrisma.withTenant((tx) =>
      tx.shelf.create({
        data: {
          tenantId: ctx.tenantId,
          stationId,
          code: input.code,
          name: input.name,
          zone: input.zone,
          createdBy: ctx.userId,
        },
      }),
    );
  }

  async listShelves(stationId: string) {
    const shelves: any[] = await this.tenantPrisma.withTenant((tx) =>
      tx.shelf.findMany({
        where: { stationId, deletedAt: null },
        orderBy: { code: 'asc' },
        include: { slots: { where: { deletedAt: null } } },
      }),
    );

    return shelves.map((shelf) => {
      const totalSlots = shelf.slots.length;
      const occupiedSlots = shelf.slots.filter(
        (slot) => slot.status === 'OCCUPIED',
      ).length;

      return {
        ...shelf,
        totalSlots,
        occupiedSlots,
        usageRate: totalSlots === 0 ? 0 : occupiedSlots / totalSlots,
      };
    });
  }
}
