import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import {
  OVERDUE_SCAN_JOB,
  OVERDUE_SCAN_QUEUE,
  OVERDUE_SCAN_QUEUE_NAME,
} from './queue.constants';
import { QueueModule } from './queue.module';
import { RepeatableRegistrar } from './repeatable.registrar';

describe('QueueModule', () => {
  it('provides the overdue scan queue with a stable name', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [QueueModule],
    }).compile();

    const queue = moduleRef.get<Queue>(OVERDUE_SCAN_QUEUE);

    expect(queue.name).toBe(OVERDUE_SCAN_QUEUE_NAME);
    await moduleRef.close();
  });
});

describe('RepeatableRegistrar', () => {
  it('registers overdue scan with a stable repeatable job id', async () => {
    const queue = {
      add: jest.fn().mockResolvedValue(undefined),
    } as unknown as Queue;
    const registrar = new RepeatableRegistrar(queue);

    await registrar.register();
    await registrar.register();

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      OVERDUE_SCAN_JOB,
      {},
      expect.objectContaining({
        jobId: OVERDUE_SCAN_JOB,
        repeat: expect.objectContaining({ pattern: expect.any(String) }),
      }),
    );
  });
});
