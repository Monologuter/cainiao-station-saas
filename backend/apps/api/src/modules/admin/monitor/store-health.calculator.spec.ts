import { calculateStoreHealth } from './store-health.calculator';

describe('calculateStoreHealth', () => {
  it('marks suspended stores as critical', () => {
    expect(
      calculateStoreHealth({
        online: true,
        subscriptionStatus: 'SUSPENDED',
        exceptionCount: 0,
        exceptionWarnThreshold: 10,
      }),
    ).toEqual({
      status: 'critical',
      reasons: ['subscription_suspended'],
    });
  });

  it('marks high exception or offline stores as warning', () => {
    expect(
      calculateStoreHealth({
        online: false,
        subscriptionStatus: 'ACTIVE',
        exceptionCount: 12,
        exceptionWarnThreshold: 10,
      }),
    ).toEqual({
      status: 'warning',
      reasons: ['offline', 'exception_high'],
    });
  });

  it('marks normal active stores as healthy', () => {
    expect(
      calculateStoreHealth({
        online: true,
        subscriptionStatus: 'ACTIVE',
        exceptionCount: 1,
        exceptionWarnThreshold: 10,
      }),
    ).toEqual({ status: 'healthy', reasons: [] });
  });
});
