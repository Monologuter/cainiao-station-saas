import type { Job } from 'bullmq';
import {
  PARCEL_STORED_NOTIFY_JOB,
  type ParcelStoredNotifyJobData,
} from './notify-queue.constants';
import { NotifyProcessor } from './notify.processor';
import { NotifyService } from './notify.service';

const PAYLOAD: ParcelStoredNotifyJobData = {
  parcelId: 'p1',
  tenantId: 't1',
  stationId: 's1',
  stationName: '城南驿站',
  receiverPhone: '13800000000',
  pickupCode: '1234',
  slotCode: 'A-01',
};

function makeJob(
  data: ParcelStoredNotifyJobData = PAYLOAD,
  name = PARCEL_STORED_NOTIFY_JOB,
): Job<ParcelStoredNotifyJobData> {
  return { name, id: '1', data } as Job<ParcelStoredNotifyJobData>;
}

/**
 * Build a real NotifyService whose SMS channel throws on the first `failTimes`
 * sends and succeeds afterwards, so we can prove the queued worker surfaces the
 * error (triggering BullMQ retry) and eventually delivers.
 */
function buildNotifyService(failTimes: number) {
  const upserts: any[] = [];
  const tx = {
    notification: {
      upsert: jest.fn(async (args: any) => {
        upserts.push(args);
        return { ...args.create, sentAt: new Date() };
      }),
    },
  };
  const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
  const renderer = {
    render: jest.fn(async (_code, channel, vars) => ({
      content: `${channel}:${vars.code}`,
    })),
  } as any;
  const eventBus = { publish: jest.fn() };
  const channelResolver = {
    resolve: jest.fn().mockResolvedValue({ channel: 'sms', provider: 'mock' }),
  };

  let smsSends = 0;
  const smsChannel = {
    send: jest.fn(async () => {
      smsSends += 1;
      if (smsSends <= failTimes) {
        throw new Error(`SMS provider temporarily unavailable (#${smsSends})`);
      }
      return { ok: true, billingUnits: 1 };
    }),
  };
  const smsFactory = { get: jest.fn().mockResolvedValue(smsChannel) };

  const service = new NotifyService(
    tenantPrisma,
    renderer,
    eventBus as any,
    channelResolver as any,
    undefined,
    smsFactory as any,
  );

  return { service, upserts, smsChannel, tx };
}

describe('NotifyProcessor', () => {
  it('ignores unrelated job names', async () => {
    const notify = { notifyParcelStored: jest.fn() } as any;
    const processor = new NotifyProcessor(notify);

    await processor.process(makeJob(PAYLOAD, 'something-else'));

    expect(notify.notifyParcelStored).not.toHaveBeenCalled();
  });

  it('delivers in the event tenant context', async () => {
    const notify = {
      notifyParcelStored: jest.fn(async () => undefined),
    } as unknown as jest.Mocked<NotifyService>;
    const processor = new NotifyProcessor(notify);

    await processor.process(makeJob());

    expect(notify.notifyParcelStored).toHaveBeenCalledWith(
      expect.objectContaining({ parcelId: 'p1', tenantId: 't1' }),
    );
  });

  it('propagates a transient channel failure so BullMQ retries (job not silently dropped)', async () => {
    const { service } = buildNotifyService(1);
    const processor = new NotifyProcessor(service);

    // First attempt: SMS channel down -> error bubbles up to BullMQ for retry.
    await expect(processor.process(makeJob())).rejects.toThrow(
      /temporarily unavailable/,
    );
  });

  it('eventually succeeds on retry after the channel recovers', async () => {
    const { service, upserts } = buildNotifyService(2);
    const processor = new NotifyProcessor(service);

    // Simulate BullMQ re-running the same job until it stops throwing.
    let attempts = 0;
    let lastError: unknown;
    for (let i = 0; i < 5; i += 1) {
      attempts += 1;
      try {
        await processor.process(makeJob());
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    expect(lastError).toBeUndefined();
    expect(attempts).toBe(3); // failed twice, third attempt delivered

    // Idempotency preserved: every attempt upserts on tenantId_dedupKey with no-op update.
    const smsUpserts = upserts.filter(
      (u) => u.where.tenantId_dedupKey.dedupKey === 'p1:ParcelStored:SMS',
    );
    expect(smsUpserts.length).toBeGreaterThanOrEqual(1);
    for (const u of smsUpserts) {
      expect(u.where).toEqual({
        tenantId_dedupKey: { tenantId: 't1', dedupKey: 'p1:ParcelStored:SMS' },
      });
      expect(u.update).toEqual({});
    }
  });
});
