import { Inject, Injectable, Optional } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { RedisService } from '../../core/redis/redis.service';

const PICKUP_CODE_TTL_SECONDS = 60 * 60 * 24 * 14;
const MAX_RETRIES = 20;
export const PICKUP_CODE_RANDOM_SOURCE = 'PICKUP_CODE_RANDOM_SOURCE';

interface RandomSource {
  nextInt(maxExclusive: number): number;
}

class MathRandomSource implements RandomSource {
  nextInt(maxExclusive: number): number {
    return Math.floor(Math.random() * maxExclusive);
  }
}

@Injectable()
export class PickupCodeService {
  constructor(
    private readonly redis: RedisService,
    @Optional()
    @Inject(PICKUP_CODE_RANDOM_SOURCE)
    private readonly random: RandomSource = new MathRandomSource(),
  ) {}

  async generate(stationId: string): Promise<string> {
    const client = this.redis.getClient();
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const code = this.nextCode();
      const result = await client.set(
        this.key(stationId, code),
        '1',
        'EX',
        PICKUP_CODE_TTL_SECONDS,
        'NX',
      );
      if (result === 'OK') return code;
    }

    throw new BizError(ApiCode.PICKUP_CODE_CONFLICT, '取件码生成冲突，请重试');
  }

  async release(stationId: string, code: string): Promise<void> {
    await this.redis.getClient().del(this.key(stationId, code));
  }

  private nextCode() {
    return this.random.nextInt(10000).toString().padStart(4, '0');
  }

  private key(stationId: string, code: string) {
    return `pcode:${stationId}:${code}`;
  }
}
