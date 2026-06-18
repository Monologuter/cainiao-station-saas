import { Injectable } from '@nestjs/common';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  coolDownMs: number;
  timeoutMs: number;
}

interface CircuitState {
  state: CircuitBreakerState;
  failures: number;
  openedAt?: number;
}

export class CircuitBreakerOpenError extends Error {
  constructor(public readonly nameKey: string) {
    super(`Circuit breaker is open: ${nameKey}`);
  }
}

@Injectable()
export class CircuitBreakerService {
  private readonly states = new Map<string, CircuitState>();
  private now: () => number = () => Date.now();

  useClock(now: () => number) {
    this.now = now;
  }

  async execute<T>(
    name: string,
    options: CircuitBreakerOptions,
    action: () => Promise<T>,
    fallback?: (error: Error) => Promise<T> | T,
  ): Promise<T> {
    const state = this.current(name);
    if (state.state === 'OPEN') {
      if (this.now() - (state.openedAt ?? 0) < options.coolDownMs) {
        const error = new CircuitBreakerOpenError(name);
        if (fallback) return fallback(error);
        throw error;
      }
      state.state = 'HALF_OPEN';
    }

    try {
      const result = await this.withTimeout(action(), options.timeoutMs, name);
      state.failures = 0;
      state.state = 'CLOSED';
      state.openedAt = undefined;
      return result;
    } catch (error) {
      this.recordFailure(state, options);
      throw error;
    }
  }

  snapshot(name: string): CircuitState | undefined {
    const state = this.states.get(name);
    return state ? { ...state } : undefined;
  }

  async forceOpen(name: string) {
    this.states.set(name, {
      state: 'OPEN',
      failures: 1,
      openedAt: this.now(),
    });
  }

  private current(name: string): CircuitState {
    const state =
      this.states.get(name) ??
      ({
        state: 'CLOSED',
        failures: 0,
      } satisfies CircuitState);
    this.states.set(name, state);
    return state;
  }

  private recordFailure(state: CircuitState, options: CircuitBreakerOptions) {
    state.failures += 1;
    if (
      state.state === 'HALF_OPEN' ||
      state.failures >= options.failureThreshold
    ) {
      state.state = 'OPEN';
      state.openedAt = this.now();
    }
  }

  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    name: string,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Circuit breaker action timed out: ${name}`)),
        timeoutMs,
      );
      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer));
    });
  }
}
