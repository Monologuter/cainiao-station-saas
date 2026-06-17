import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantContext } from '../tenant-context/tenant-context';

@Injectable()
export class TenantPrismaService {
  constructor(private readonly base: PrismaService) {}

  async withTenant<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const ctx = TenantContext.get();
    const tenantId = ctx?.tenantId ?? null;
    const bypass = ctx?.isPlatform ? 'on' : 'off';

    return this.base.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', $1, true)`,
        bypass,
      );
      if (tenantId) {
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.tenant_id', $1, true)`,
          tenantId,
        );
      }
      return fn(tx);
    });
  }
}
