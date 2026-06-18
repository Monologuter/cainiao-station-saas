export type StoreHealthInput = {
  online: boolean;
  subscriptionStatus?: string | null;
  exceptionCount: number;
  exceptionWarnThreshold: number;
};

export type StoreHealth = {
  status: 'healthy' | 'warning' | 'critical';
  reasons: string[];
};

export function calculateStoreHealth(input: StoreHealthInput): StoreHealth {
  const reasons: string[] = [];

  if (input.subscriptionStatus === 'SUSPENDED') {
    reasons.push('subscription_suspended');
  }
  if (!input.online) {
    reasons.push('offline');
  }
  if (input.subscriptionStatus === 'PAST_DUE') {
    reasons.push('subscription_past_due');
  }
  if (input.exceptionCount >= input.exceptionWarnThreshold) {
    reasons.push('exception_high');
  }

  if (reasons.includes('subscription_suspended')) {
    return { status: 'critical', reasons };
  }
  if (reasons.length > 0) {
    return { status: 'warning', reasons };
  }
  return { status: 'healthy', reasons };
}
