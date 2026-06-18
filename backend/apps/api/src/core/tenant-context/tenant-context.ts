import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  userId: string;
  tenantId: string | null;
  roles: string[];
  isPlatform: boolean;
  /**
   * 登录用户的「可见门店」标记。店长/平台用户为 true，不受门店限制；
   * 店员为 false，可见门店由 stations 列出。
   */
  allStations?: boolean;
  /** 店员被分配的可见门店 id 列表（allStations 为 true 时忽略）。 */
  stations?: string[];
  traceId?: string;
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
