import {
  Inject,
  Injectable,
  OnModuleDestroy,
  type Provider,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { NOTIFY_QUEUE, NOTIFY_QUEUE_NAME } from './notify-queue.constants';

/**
 * Resolve BullMQ Redis connection options from REDIS_URL, matching the
 * conventions used by core/queue/queue.module.ts so the notify queue shares
 * the same broker configuration as the rest of the platform.
 */
export function notifyQueueRedisConnectionOptions() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:16379');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname ? Number(url.pathname.slice(1) || 0) : 0,
  };
}

export const notifyQueueProvider: Provider = {
  provide: NOTIFY_QUEUE,
  useFactory: () =>
    new Queue(NOTIFY_QUEUE_NAME, {
      connection: notifyQueueRedisConnectionOptions(),
    }),
};

@Injectable()
export class NotifyQueueShutdown implements OnModuleDestroy {
  constructor(@Inject(NOTIFY_QUEUE) private readonly queue: Queue) {}

  async onModuleDestroy() {
    await this.queue.close();
  }
}
