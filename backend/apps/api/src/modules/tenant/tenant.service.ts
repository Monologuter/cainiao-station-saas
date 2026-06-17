import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../core/prisma/prisma.service';

interface CreateTenantInput {
  name: string;
  ownerName: string;
  ownerPhone: string;
  ownerPassword: string;
}

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async createTenant(input: CreateTenantInput) {
    const passwordHash = await argon2.hash(input.ownerPassword);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const tenant = await tx.tenant.create({
        data: {
          name: input.name,
          ownerName: input.ownerName,
          contactPhone: input.ownerPhone,
        },
      });
      const station = await tx.station.create({
        data: { tenantId: tenant.id, name: input.name, code: 'S001' },
      });
      const ownerRole = await tx.role.create({
        data: {
          tenantId: tenant.id,
          code: '店长',
          name: '店长',
          scope: 'TENANT',
          isBuiltin: true,
        },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          type: 'STAFF',
          username: input.ownerPhone,
          passwordHash,
          phone: input.ownerPhone,
        },
      });
      await tx.userRole.create({
        data: { userId: user.id, roleId: ownerRole.id },
      });

      return {
        tenantId: tenant.id,
        stationId: station.id,
        ownerUserId: user.id,
      };
    });
  }
}
