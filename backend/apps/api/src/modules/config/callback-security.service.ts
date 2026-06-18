import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';

type VerifyFailureReason =
  | 'STALE_TIMESTAMP'
  | 'REPLAYED_NONCE'
  | 'BAD_SIGNATURE';

interface HmacInput {
  payload: string;
  timestamp: string;
  nonce: string;
  secret: string;
}

export const CALLBACK_SECURITY_CLOCK = Symbol('CALLBACK_SECURITY_CLOCK');
export const CALLBACK_SECURITY_WINDOW_MS = Symbol(
  'CALLBACK_SECURITY_WINDOW_MS',
);

@Injectable()
export class CallbackSecurityService {
  private readonly seenNonces = new Map<string, number>();
  private readonly now: () => number;
  private readonly timestampWindowMs: number;

  constructor(
    @Optional()
    @Inject(CALLBACK_SECURITY_CLOCK)
    now?: () => number,
    @Optional()
    @Inject(CALLBACK_SECURITY_WINDOW_MS)
    timestampWindowMs?: number,
  ) {
    this.now = now ?? (() => Date.now());
    this.timestampWindowMs = timestampWindowMs ?? 5 * 60 * 1000;
  }

  signHmac(input: HmacInput) {
    return createHmac('sha256', input.secret)
      .update(this.signingPayload(input))
      .digest('hex');
  }

  verifyHmac(
    input: HmacInput & { signature: string },
  ): { ok: true } | { ok: false; reason: VerifyFailureReason } {
    const timestampMs = Number(input.timestamp) * 1000;
    if (
      !Number.isFinite(timestampMs) ||
      Math.abs(this.now() - timestampMs) > this.timestampWindowMs
    ) {
      return { ok: false, reason: 'STALE_TIMESTAMP' };
    }

    this.pruneNonces();
    if (this.seenNonces.has(input.nonce)) {
      return { ok: false, reason: 'REPLAYED_NONCE' };
    }

    const expected = this.signHmac(input);
    if (!this.safeEqual(expected, input.signature)) {
      return { ok: false, reason: 'BAD_SIGNATURE' };
    }

    this.seenNonces.set(input.nonce, this.now() + this.timestampWindowMs);
    return { ok: true };
  }

  private signingPayload(input: HmacInput) {
    return `${input.timestamp}\n${input.nonce}\n${input.payload}`;
  }

  private pruneNonces() {
    const now = this.now();
    for (const [nonce, expiresAt] of this.seenNonces.entries()) {
      if (expiresAt <= now) {
        this.seenNonces.delete(nonce);
      }
    }
  }

  private safeEqual(expected: string, actual: string) {
    const left = Buffer.from(expected);
    const right = Buffer.from(actual);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
