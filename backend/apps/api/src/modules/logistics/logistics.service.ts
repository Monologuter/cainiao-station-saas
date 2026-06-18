import { Inject, Injectable, Optional } from '@nestjs/common';
import { CircuitBreakerService } from '../../core/circuit-breaker/circuit-breaker.service';
import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import {
  ShipOrderAggregate,
  ShipOrderStatus,
} from '../shipping/ship-order.aggregate';
import {
  LOGISTICS_PROVIDER,
  LogisticsProvider,
} from './logistics-provider.interface';

interface RequestUser {
  userId?: string;
  tenantId?: string | null;
  roles?: string[];
  isPlatform?: boolean;
}
const ADAPTER_BREAKER_OPTIONS = {
  failureThreshold: 3,
  coolDownMs: 30_000,
  timeoutMs: 3000,
};

@Injectable()
export class LogisticsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(LOGISTICS_PROVIDER) private readonly provider: LogisticsProvider,
    @Optional() private readonly breaker?: CircuitBreakerService,
  ) {}

  async collectShipOrder(orderId: string, user?: RequestUser) {
    if (user?.tenantId && !TenantContext.get()?.tenantId) {
      return TenantContext.run(
        {
          userId: user.userId ?? 'consumer',
          tenantId: user.tenantId,
          roles: user.roles ?? [],
          isPlatform: !!user.isPlatform,
        },
        () => this.collectShipOrder(orderId, user),
      );
    }
    const ctx = this.requireContext(user);

    return this.tenantPrisma.withTenant(async (tx) => {
      const before = await tx.shipOrder.findFirst({
        where: { id: orderId, tenantId: ctx.tenantId, deletedAt: null },
      });
      if (!before) {
        throw new BizError(ApiCode.NOT_FOUND, '寄件订单不存在');
      }
      if (before.status === 'COLLECTED' && before.waybillNo) {
        return before;
      }

      ShipOrderAggregate.assertTransit(
        before.status as ShipOrderStatus,
        'COLLECTED',
      );

      const waybill = await this.withBreaker(
        `logistics.${this.provider.code}.create-waybill`,
        () =>
          this.provider.createWaybill({
            shipOrderId: before.id,
            courierCode: before.courierCode,
            sender: before.senderJson,
            receiver: before.receiverJson,
            weightGram: before.weightGram,
          }),
      );
      const collectedAt = new Date();
      const order = await tx.shipOrder.update({
        where: { id: before.id },
        data: {
          status: 'COLLECTED',
          waybillNo: waybill.waybillNo,
          collectedAt,
          version: { increment: 1 },
        },
      });
      await tx.logisticsTrack.create({
        data: {
          tenantId: ctx.tenantId,
          shipOrderId: before.id,
          waybillNo: waybill.waybillNo,
          seq: 1,
          nodeStatus: 'COLLECTED',
          location: '始发驿站',
          description: '【揽收】快件已由驿站揽收',
          happenedAt: collectedAt,
          source: 'MOCK',
        },
      });

      return order;
    });
  }

  async getTracks(orderId: string, user?: RequestUser) {
    if (user?.tenantId && !TenantContext.get()?.tenantId) {
      return TenantContext.run(
        {
          userId: user.userId ?? 'consumer',
          tenantId: user.tenantId,
          roles: user.roles ?? [],
          isPlatform: !!user.isPlatform,
        },
        () => this.getTracks(orderId, user),
      );
    }
    const ctx = this.requireContext(user);

    return this.tenantPrisma.withTenant(async (tx) => {
      const order = await tx.shipOrder.findFirst({
        where: { id: orderId, tenantId: ctx.tenantId, deletedAt: null },
      });
      if (!order) {
        throw new BizError(ApiCode.NOT_FOUND, '寄件订单不存在');
      }

      let tracks = await tx.logisticsTrack.findMany({
        where: { tenantId: ctx.tenantId, shipOrderId: order.id },
        orderBy: { seq: 'asc' },
      });

      if (
        order.waybillNo &&
        (order.status === 'COLLECTED' || order.status === 'IN_TRANSIT')
      ) {
        const visibleNodes = await this.withBreaker(
          `logistics.${this.provider.code}.poll-tracks`,
          () => this.provider.pollTracks(order.waybillNo),
          () => [],
        );
        const materializedNodes = Math.max(tracks.length - 1, 0);
        const missing = visibleNodes.slice(materializedNodes);
        await this.materializeTrackNodes(tx, order, tracks, missing);

        tracks = await tx.logisticsTrack.findMany({
          where: { tenantId: ctx.tenantId, shipOrderId: order.id },
          orderBy: { seq: 'asc' },
        });
        await this.syncOrderStatus(tx, order, tracks);
      }

      return tracks;
    });
  }

  async handleProviderCallback(
    tenantId: string,
    waybillNo: string,
    input: { payload: string; sign: string },
  ) {
    if (!this.provider.verifyCallback?.(input)) {
      throw new BizError(ApiCode.BAD_REQUEST, '物流回调验签失败');
    }
    const nodes = this.provider.parseCallbackTracks?.(input.payload) ?? [];

    return TenantContext.run(
      {
        userId: 'logistics-callback',
        tenantId,
        roles: [],
        isPlatform: false,
      },
      () =>
        this.tenantPrisma.withTenant(async (tx) => {
          const order = await tx.shipOrder.findFirst({
            where: { tenantId, waybillNo, deletedAt: null },
          });
          if (!order) {
            throw new BizError(ApiCode.NOT_FOUND, '寄件订单不存在');
          }

          const tracks = await tx.logisticsTrack.findMany({
            where: { tenantId, shipOrderId: order.id },
            orderBy: { seq: 'asc' },
          });
          await this.materializeTrackNodes(
            tx,
            order,
            tracks,
            nodes,
            'PROVIDER',
          );

          const updatedTracks = await tx.logisticsTrack.findMany({
            where: { tenantId, shipOrderId: order.id },
            orderBy: { seq: 'asc' },
          });
          await this.syncOrderStatus(tx, order, updatedTracks);
          return order;
        }),
    );
  }

  private requireContext(user?: RequestUser) {
    if (user?.tenantId) {
      return {
        userId: user.userId,
        tenantId: user.tenantId,
        roles: user.roles ?? [],
        isPlatform: !!user.isPlatform,
      };
    }
    const ctx = TenantContext.get();
    if (!ctx?.tenantId) {
      throw new BizError(ApiCode.UNAUTHORIZED, '缺少租户上下文');
    }
    return ctx;
  }

  private async syncOrderStatus(tx: any, order: any, tracks: any[]) {
    const latest = tracks[tracks.length - 1];
    if (!latest) {
      return;
    }
    if (latest.nodeStatus === 'DELIVERED' && order.status !== 'DELIVERED') {
      if (order.status === 'COLLECTED') {
        ShipOrderAggregate.assertTransit(
          order.status as ShipOrderStatus,
          'IN_TRANSIT',
        );
        order.status = 'IN_TRANSIT';
      }
      ShipOrderAggregate.assertTransit(
        order.status as ShipOrderStatus,
        'DELIVERED',
      );
      await tx.shipOrder.update({
        where: { id: order.id },
        data: {
          status: 'DELIVERED',
          deliveredAt: latest.happenedAt,
          version: { increment: 1 },
        },
      });
      order.status = 'DELIVERED';
      order.deliveredAt = latest.happenedAt;
      return;
    }
    if (
      ['IN_TRANSIT', 'ARRIVED', 'OUT_FOR_DELIVERY'].includes(
        latest.nodeStatus,
      ) &&
      order.status === 'COLLECTED'
    ) {
      ShipOrderAggregate.assertTransit(
        order.status as ShipOrderStatus,
        'IN_TRANSIT',
      );
      await tx.shipOrder.update({
        where: { id: order.id },
        data: { status: 'IN_TRANSIT', version: { increment: 1 } },
      });
      order.status = 'IN_TRANSIT';
    }
  }

  private async materializeTrackNodes(
    tx: any,
    order: any,
    existingTracks: any[],
    nodes: any[],
    source: 'MOCK' | 'PROVIDER' = this.provider.code === 'mock'
      ? 'MOCK'
      : 'PROVIDER',
  ) {
    const seen = new Set(
      existingTracks.map((track) => this.trackFingerprint(track)),
    );
    let nextSeq = existingTracks.length + 1;
    for (const node of nodes) {
      const fingerprint = this.trackFingerprint(node);
      if (seen.has(fingerprint)) {
        continue;
      }
      seen.add(fingerprint);
      await tx.logisticsTrack.create({
        data: {
          tenantId: order.tenantId,
          shipOrderId: order.id,
          waybillNo: order.waybillNo,
          seq: nextSeq++,
          nodeStatus: node.nodeStatus,
          location: node.location,
          description: node.description,
          happenedAt: node.happenedAt,
          source,
        },
      });
    }
  }

  private trackFingerprint(track: any) {
    const happenedAt =
      track.happenedAt instanceof Date
        ? track.happenedAt.toISOString()
        : String(track.happenedAt ?? '');
    return `${happenedAt}|${track.description ?? ''}`;
  }

  private withBreaker<T>(
    name: string,
    action: () => Promise<T>,
    fallback?: () => Promise<T> | T,
  ) {
    if (!this.breaker) return action();
    return this.breaker.execute(
      name,
      ADAPTER_BREAKER_OPTIONS,
      action,
      fallback,
    );
  }
}
