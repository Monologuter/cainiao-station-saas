import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  userId: string;
  tenantId: string | null;
  roles: string[];
  isPlatform: boolean;
}

const als = new AsyncLocalStorage<RequestContext>();

export const TenantContext = {
  run<T>(ctx: RequestContext, fn: () => T): T {
    return als.run(ctx, fn);
  },

  get(): RequestContext | undefined {
    return als.getStore();
  },
};
