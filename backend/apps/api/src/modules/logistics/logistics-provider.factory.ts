import { Injectable } from '@nestjs/common';
import { IntegrationConfigService } from '../config/integration-config.service';
import { KuaiDi100Provider } from './kuaidi100.provider';
import { LogisticsProvider } from './logistics-provider.interface';
import { MockLogisticsProvider } from './mock-logistics.provider';

@Injectable()
export class LogisticsProviderFactory {
  constructor(
    private readonly integrations: IntegrationConfigService,
    private readonly mock: MockLogisticsProvider,
    private readonly kuaidi100: KuaiDi100Provider,
  ) {}

  async get(): Promise<LogisticsProvider> {
    const resolved = await this.integrations.resolve('logistics');
    if (resolved.provider === 'kuaidi100' && !resolved.degraded) {
      return this.kuaidi100;
    }
    return this.mock;
  }
}
