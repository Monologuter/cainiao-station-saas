import { Injectable, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { QueryService } from './query.service';
import { RankingService } from './ranking.service';
import { RealtimePublisher } from './realtime.publisher';

interface SocketUser {
  userId: string;
  tenantId: string | null;
  roles: string[];
  isPlatform: boolean;
  perms: string[];
}

@Injectable()
@WebSocketGateway({ namespace: 'analytics', cors: { origin: '*' } })
export class AnalyticsGateway implements OnGatewayConnection, OnModuleInit {
  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly queries: QueryService,
    private readonly rankings: RankingService,
    private readonly publisher: RealtimePublisher,
  ) {}

  onModuleInit() {
    this.publisher.registerSink((type, payload) => {
      if (payload?.tenantId) {
        this.server.to(`tenant:${payload.tenantId}`).emit(type, payload);
      }
      if (payload?.stationId) {
        this.server.to(`station:${payload.stationId}`).emit(type, payload);
      }
    });
  }

  async handleConnection(socket: Socket) {
    try {
      const user = await this.authenticate(socket);
      socket.data.user = user;
      if (user.isPlatform) {
        socket.join('platform');
      } else if (user.tenantId) {
        socket.join(`tenant:${user.tenantId}`);
        await this.emitTenantSnapshot(socket, user);
      } else {
        socket.disconnect(true);
      }
    } catch {
      socket.disconnect(true);
    }
  }

  @SubscribeMessage('subscribe:station')
  async subscribeStation(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { stationId?: string },
  ) {
    const user = socket.data.user as SocketUser | undefined;
    if (!user?.tenantId || !body?.stationId) {
      return;
    }
    if (await this.canAccessStation(user.tenantId, body.stationId)) {
      socket.join(`station:${body.stationId}`);
    }
  }

  @SubscribeMessage('unsubscribe:station')
  unsubscribeStation(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { stationId?: string },
  ) {
    if (body?.stationId) {
      socket.leave(`station:${body.stationId}`);
    }
  }

  private async authenticate(socket: Socket): Promise<SocketUser> {
    const token = this.extractToken(socket);
    const payload = await this.jwt.verifyAsync<any>(token);
    const perms = await this.loadPermissions(payload);
    const isPlatform = !!payload.isPlatform;
    const hasPermission = isPlatform
      ? perms.includes('analytics:platform:read') ||
        perms.includes('analytics:read')
      : perms.includes('analytics:read');
    if (!hasPermission) {
      throw new Error('analytics permission required');
    }

    return {
      userId: payload.sub,
      tenantId: payload.tenantId ?? null,
      roles: payload.roles ?? [],
      isPlatform,
      perms,
    };
  }

  private extractToken(socket: Socket) {
    const raw =
      socket.handshake.auth?.token ??
      socket.handshake.headers.authorization ??
      '';
    const token = Array.isArray(raw) ? raw[0] : raw;
    return String(token).replace(/^Bearer\s+/i, '');
  }

  private async loadPermissions(payload: any) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const rows = await tx.rolePermission.findMany({
        where: {
          role: {
            code: { in: payload.roles ?? [] },
            tenantId: payload.isPlatform ? null : payload.tenantId,
          },
        },
        include: { permission: true },
      });
      return [...new Set(rows.map((item) => item.permission.code))];
    });
  }

  private async emitTenantSnapshot(socket: Socket, user: SocketUser) {
    const stationId = await this.queries.resolveStationId(user.tenantId!);
    if (!stationId) {
      socket.emit('snapshot:init', { overview: {}, ranking: { items: [] } });
      return;
    }
    const [overview, ranking] = await Promise.all([
      this.queries.overview({ tenantId: user.tenantId!, stationId }),
      this.rankings.overdueTop({
        tenantId: user.tenantId!,
        stationId,
        limit: 10,
      }),
    ]);
    socket.emit('snapshot:init', { overview, ranking });
  }

  private async canAccessStation(tenantId: string, stationId: string) {
    const station = await this.tenantPrisma.withTenant<{ id: string } | null>(
      (tx) =>
        tx.station.findFirst({
          where: { tenantId, id: stationId },
          select: { id: true },
        }),
    );
    return !!station;
  }
}
