import { EventBus } from '../../core/event-bus/event-bus';
import { MemberService } from './member.service';
import { ParcelPickedUpListener } from './listeners/parcel-picked-up.listener';
import { ShipOrderPaidListener } from './listeners/ship-order-paid.listener';
import { PointService } from './point.service';

describe('member point listeners', () => {
  it('awards pickup points by looking up parcel phone and dedups by parcel id', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn(),
      parcel: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'p1',
          tenantId: 't1',
          receiverPhone: '13800000000',
        }),
      },
      consumer: {
        upsert: jest.fn().mockResolvedValue({ id: 'c1', phone: '13800000000' }),
      },
    };
    const prisma = { $transaction: (fn: any) => fn(tx) } as any;
    const member = {
      ensureMember: jest.fn().mockResolvedValue({ id: 'm1' }),
    } as unknown as jest.Mocked<MemberService>;
    const points = { earn: jest.fn() } as unknown as jest.Mocked<PointService>;
    const listener = new ParcelPickedUpListener(
      {} as EventBus,
      prisma,
      member,
      points,
    );

    await listener.onParcelPickedUp({
      name: 'ParcelPickedUp',
      eventId: 'e1',
      occurredAt: new Date(),
      payload: { parcelId: 'p1', tenantId: 't1', stationId: 's1' },
    });

    expect(member.ensureMember).toHaveBeenCalledWith('c1', '13800000000');
    expect(points.earn).toHaveBeenCalledWith('m1', 2, 'PICKUP', {
      sourceTenantId: 't1',
      refType: 'parcel',
      refId: 'p1',
      idempotencyKey: 'pickup:p1',
      remark: '取件积分',
    });
  });

  it('awards ship points from paid order amount and consumer id', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn(),
      shipOrder: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'so1',
          tenantId: 't1',
          stationId: 's1',
          consumerId: 'c1',
          quoteAmount: 1234,
        }),
      },
      consumer: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'c1',
          phone: '13800000000',
        }),
      },
    };
    const prisma = { $transaction: (fn: any) => fn(tx) } as any;
    const member = {
      ensureMember: jest.fn().mockResolvedValue({ id: 'm1' }),
    } as unknown as jest.Mocked<MemberService>;
    const points = { earn: jest.fn() } as unknown as jest.Mocked<PointService>;
    const listener = new ShipOrderPaidListener(
      {} as EventBus,
      prisma,
      member,
      points,
    );

    await listener.onShipOrderPaid({
      name: 'ShipOrderPaid',
      eventId: 'e1',
      occurredAt: new Date(),
      payload: { shipOrderId: 'so1', tenantId: 't1', amount: 1234 },
    });

    expect(member.ensureMember).toHaveBeenCalledWith('c1', '13800000000');
    expect(points.earn).toHaveBeenCalledWith('m1', 12, 'SHIP', {
      sourceTenantId: 't1',
      refType: 'ship_order',
      refId: 'so1',
      idempotencyKey: 'ship:so1',
      remark: '寄件积分',
    });
  });
});
