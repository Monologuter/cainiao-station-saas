import { Controller, Get } from '@nestjs/common';
import { RequirePermission } from '../identity/decorators';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @RequirePermission('parcel:read')
  @Get('overview')
  overview() {
    return this.analytics.overview();
  }
}
