import { Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import { OVERDUE_SCAN_QUEUE, OVERDUE_SCAN_QUEUE_NAME } from './queue.constants';
import { RepeatableRegistrar } from './repeatable.registrar';

const overdueScanQueueProvider = {
  provide: OVERDUE_SCAN_QUEUE,
  useFactory: () =>
    new Queue(OVERDUE_SCAN_QUEUE_NAME, {
      connection: queueRedisConnectionOptions(),
    }),
};

function queueRedisConnectionOptions() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:16379');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname ? Number(url.pathname.slice(1) || 0) : 0,
  };
}

@Injectable()
class QueueShutdown implements OnModuleDestroy {
  constructor(@Inject(OVERDUE_SCAN_QUEUE) private readonly queue: Queue) {}

  async onModuleDestroy() {
    await this.queue.close();
  }
}

@Module({
  providers: [
    RedisService,
    overdueScanQueueProvider,
    RepeatableRegistrar,
    QueueShutdown,
  ],
  exports: [RedisService, overdueScanQueueProvider, RepeatableRegistrar],
})
export class QueueModule {}
