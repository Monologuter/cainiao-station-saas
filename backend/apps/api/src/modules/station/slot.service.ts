import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { TenantContext } from '../../core/tenant-context/tenant-context';

type SlotStatus = 'FREE' | 'OCCUPIED' | 'DISABLED';

interface MatrixBatchSlotSpec {
  rows: number;
  levels: number;
  cols: number;
}

interface ExplicitBatchSlotSpec {
  codes: string[];
}

export type BatchSlotSpec = MatrixBatchSlotSpec | ExplicitBatchSlotSpec;

@Injectable()
export class SlotService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async batchCreate(shelfId: string, spec: BatchSlotSpec) {
    const ctx = TenantContext.get();
    if (!ctx?.tenantId) {
      throw new BizError(ApiCode.BAD_REQUEST, '缺少租户上下文');
    }

    return this.tenantPrisma.withTenant(async (tx) => {
      const shelf = await tx.shelf.findFirstOrThrow({
        where: { id: shelfId, deletedAt: null },
      });
      const slots = this.buildSlots(shelf, spec, ctx.userId);
      if (slots.length === 0) return { created: 0 };

      const result = await tx.slot.createMany({
        data: slots,
        skipDuplicates: true,
      });
      return { created: result.count };
    });
  }

  async listByShelf(shelfId: string, status?: SlotStatus) {
    return this.tenantPrisma.withTenant((tx) =>
      tx.slot.findMany({
        where: { shelfId, status, deletedAt: null },
        orderBy: [
          { rowNo: 'asc' },
          { levelNo: 'asc' },
          { colNo: 'asc' },
          { code: 'asc' },
        ],
      }),
    );
  }

  async listFree(stationId: string, limit = 20) {
    return this.tenantPrisma.withTenant((tx) =>
      tx.slot.findMany({
        where: {
          stationId,
          status: 'FREE',
          deletedAt: null,
          shelf: { status: 'ACTIVE', deletedAt: null },
        },
        take: limit,
        orderBy: [
          { rowNo: 'asc' },
          { levelNo: 'asc' },
          { colNo: 'asc' },
          { code: 'asc' },
        ],
      }),
    );
  }

  private buildSlots(shelf: any, spec: BatchSlotSpec, createdBy: string) {
    const common = {
      tenantId: shelf.tenantId,
      stationId: shelf.stationId,
      shelfId: shelf.id,
      createdBy,
    };

    if ('codes' in spec) {
      const uniqueCodes = [...new Set(spec.codes.filter(Boolean))];
      return uniqueCodes.map((code) => ({ ...common, code }));
    }

    const prefix = shelf.zone ?? shelf.code;
    const slots: Array<Record<string, unknown>> = [];
    for (let row = 1; row <= spec.rows; row += 1) {
      for (let level = 1; level <= spec.levels; level += 1) {
        for (let col = 1; col <= spec.cols; col += 1) {
          slots.push({
            ...common,
            code: `${prefix}-${this.pad(row)}-${this.pad(level)}-${this.pad(col)}`,
            rowNo: row,
            levelNo: level,
            colNo: col,
          });
        }
      }
    }
    return slots;
  }

  private pad(value: number) {
    return value.toString().padStart(2, '0');
  }
}
