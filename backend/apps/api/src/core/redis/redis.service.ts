import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client = new Redis(
    process.env.REDIS_URL ?? 'redis://localhost:16379',
    { lazyConnect: true },
  );

  getClient(): Redis {
    return this.client;
  }

  async onModuleDestroy() {
    this.client.disconnect();
  }
}
