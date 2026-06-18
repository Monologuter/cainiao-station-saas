import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../core/prisma/prisma.service';

interface CreatePlatformUserInput {
  username: string;
  password: string;
  phone?: string;
  roleCodes?: string[];
}

interface UpdatePlatformUserInput {
  status?: string;
  roleCodes?: string[];
}

@Injectable()
export class PlatformUserService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.withBypass(async (tx) => {
      const list = await tx.user.findMany({
        where: { type: 'PLATFORM' },
        orderBy: { createdAt: 'desc' },
        include: { roles: { include: { role: true } } },
      });
      return {
        list: list.map((user) => this.toDto(user)),
        total: list.length,
      };
    });
  }

  async create(input: CreatePlatformUserInput) {
    const passwordHash = await argon2.hash(input.password);
    return this.withBypass(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId: null,
          type: 'PLATFORM',
          username: input.username,
          phone: input.phone,
          passwordHash,
        },
      });
      await this.replaceRoles(tx, user.id, input.roleCodes ?? []);
      return this.findDto(tx, user.id);
    });
  }

  update(id: string, input: UpdatePlatformUserInput) {
    return this.withBypass(async (tx) => {
      if (input.status) {
        await tx.user.update({ where: { id }, data: { status: input.status } });
      }
      if (input.roleCodes) {
        await this.replaceRoles(tx, id, input.roleCodes);
      }
      return this.findDto(tx, id);
    });
  }

  deactivate(id: string) {
    return this.update(id, { status: 'inactive' });
  }

  private async replaceRoles(tx: any, userId: string, roleCodes: string[]) {
    await tx.userRole.deleteMany({ where: { userId } });
    if (roleCodes.length === 0) {
      return;
    }
    const roles = await tx.role.findMany({
      where: { tenantId: null, code: { in: roleCodes } },
    });
    await tx.userRole.createMany({
      data: roles.map((role: any) => ({ userId, roleId: role.id })),
      skipDuplicates: true,
    });
  }

  private findDto(tx: any, id: string) {
    return tx.user
      .findUniqueOrThrow({
        where: { id },
        include: { roles: { include: { role: true } } },
      })
      .then((user: any) => this.toDto(user));
  }

  private toDto(user: any) {
    return {
      id: user.id,
      username: user.username,
      phone: user.phone,
      status: user.status,
      roles: user.roles.map((item: any) => item.role.code),
      createdAt: user.createdAt,
    };
  }

  private withBypass<T>(fn: (tx: any) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return fn(tx);
    });
  }
}
