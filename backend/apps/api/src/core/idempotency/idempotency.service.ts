import { Injectable } from '@nestjs/common';

@Injectable()
export class IdempotencyService {
  private readonly completed = new Map<string, unknown>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  async runOnce<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.completed.has(key)) {
      return this.completed.get(key) as T;
    }
    if (this.inflight.has(key)) {
      return this.inflight.get(key) as Promise<T>;
    }

    const promise = Promise.resolve(fn()).then((result) => {
      this.completed.set(key, result);
      return result;
    });
    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }
}
