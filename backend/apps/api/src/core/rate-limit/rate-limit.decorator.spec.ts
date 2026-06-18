import { Reflector } from '@nestjs/core';
import { InboundController } from '../../modules/inbound/inbound.controller';
import { AuthController } from '../../modules/identity/auth.controller';
import { PickupController } from '../../modules/pickup/pickup.controller';
import { ShippingController } from '../../modules/shipping/shipping.controller';
import { RATE_LIMIT_META } from './rate-limit.decorator';

describe('RateLimit decorators', () => {
  const reflector = new Reflector();

  it('marks login with sliding window rate limiting', () => {
    expect(
      reflector.get(RATE_LIMIT_META, AuthController.prototype.login),
    ).toMatchObject({
      keyPrefix: 'login',
      strategy: 'sliding-window',
    });
  });

  it('marks operational write endpoints with token bucket rate limiting', () => {
    for (const handler of [
      InboundController.prototype.inbound,
      PickupController.prototype.pickup,
      ShippingController.prototype.payOrder,
      ShippingController.prototype.payConsumerOrder,
    ]) {
      expect(reflector.get(RATE_LIMIT_META, handler)).toMatchObject({
        strategy: 'token-bucket',
      });
    }
  });
});
