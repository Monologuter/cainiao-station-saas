import {
  CircuitBreakerOpenError,
  CircuitBreakerService,
} from './circuit-breaker.service';

describe('CircuitBreakerService', () => {
  const options = {
    failureThreshold: 2,
    coolDownMs: 1000,
    timeoutMs: 100,
  };

  it('opens after the failure threshold and short-circuits to fallback', async () => {
    const now = 0;
    const breaker = new CircuitBreakerService();
    breaker.useClock(() => now);

    await expect(
      breaker.execute('sms.tencent', options, async () => {
        throw new Error('provider down');
      }),
    ).rejects.toThrow('provider down');
    await expect(
      breaker.execute('sms.tencent', options, async () => {
        throw new Error('provider down');
      }),
    ).rejects.toThrow('provider down');

    await expect(
      breaker.execute(
        'sms.tencent',
        options,
        async () => 'real',
        async () => 'fallback',
      ),
    ).resolves.toBe('fallback');
    expect(breaker.snapshot('sms.tencent')?.state).toBe('OPEN');
  });

  it('moves through half-open and closes after a successful probe', async () => {
    let now = 0;
    const breaker = new CircuitBreakerService();
    breaker.useClock(() => now);

    await expect(
      breaker.execute('pay.wechat', options, async () => {
        throw new Error('pay down');
      }),
    ).rejects.toThrow();
    await expect(
      breaker.execute('pay.wechat', options, async () => {
        throw new Error('pay down');
      }),
    ).rejects.toThrow();

    now = 1001;
    await expect(
      breaker.execute('pay.wechat', options, async () => 'ok'),
    ).resolves.toBe('ok');
    expect(breaker.snapshot('pay.wechat')?.state).toBe('CLOSED');
  });

  it('returns to open when a half-open probe fails', async () => {
    let now = 0;
    const breaker = new CircuitBreakerService();
    breaker.useClock(() => now);
    await breaker.forceOpen('logistics.kuaidi100');

    now = 1001;
    await expect(
      breaker.execute('logistics.kuaidi100', options, async () => {
        throw new Error('still down');
      }),
    ).rejects.toThrow('still down');
    expect(breaker.snapshot('logistics.kuaidi100')?.state).toBe('OPEN');
  });

  it('counts timeout as a failure', async () => {
    const breaker = new CircuitBreakerService();
    breaker.useClock(() => 0);

    await expect(
      breaker.execute(
        'ocr.mock',
        { ...options, failureThreshold: 1, timeoutMs: 1 },
        () => new Promise((resolve) => setTimeout(() => resolve('late'), 10)),
      ),
    ).rejects.toThrow('timed out');
    expect(breaker.snapshot('ocr.mock')?.state).toBe('OPEN');
  });
});
