import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { CurrentUser, RequirePermission } from '../identity/decorators';
import { ForecastService } from './forecast.service';
import { QueryService } from './query.service';
import { RankingService } from './ranking.service';
import { ReconcileService } from './reconcile.service';
import { ReportService } from './report.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly queries: QueryService,
    private readonly rankings: RankingService,
    private readonly reconcileService: ReconcileService,
    private readonly reports: ReportService,
    private readonly forecasts: ForecastService,
  ) {}

  @RequirePermission('analytics:read')
  @Get('overview')
  async overview(@CurrentUser() user: any, @Query() query: any) {
    const stationId = await this.requireStationId(
      user.tenantId,
      query.stationId,
    );
    return this.queries.overview({
      tenantId: user.tenantId,
      stationId,
      date: this.parseDate(query.date),
    });
  }

  @RequirePermission('analytics:read')
  @Get('trend')
  trend(@CurrentUser() user: any, @Query() query: any) {
    return this.queries.trend({
      tenantId: user.tenantId,
      stationId: query.stationId,
      metric: query.metric ?? 'inbound',
      from: this.parseRequiredDate(query.from, 'from'),
      to: this.parseRequiredDate(query.to, 'to'),
    });
  }

  @RequirePermission('analytics:read')
  @Get('ranking')
  async ranking(@CurrentUser() user: any, @Query() query: any) {
    const type = query.type ?? 'overdue';
    const limit = this.parseLimit(query.limit);
    if (type === 'station') {
      const compare = await this.rankings.stationCompare({
        tenantId: user.tenantId,
        metric: query.metric ?? 'inbound',
        date: this.parseDate(query.date) ?? new Date(),
        limit,
      });
      return {
        type,
        items: compare.rows.map((row) => ({
          key: row.stationId,
          label: row.name,
          value: row.value,
          extra: {},
        })),
      };
    }

    const stationId = await this.requireStationId(
      user.tenantId,
      query.stationId,
    );
    return this.rankings.overdueTop({
      tenantId: user.tenantId,
      stationId,
      limit,
    });
  }

  @RequirePermission('analytics:read')
  @Get('heatmap')
  async heatmap(@CurrentUser() user: any, @Query() query: any) {
    const stationId = await this.requireStationId(
      user.tenantId,
      query.stationId,
    );
    return this.queries.heatmap({ tenantId: user.tenantId, stationId });
  }

  @RequirePermission('analytics:read')
  @Post('forecast/run')
  async runForecast(@CurrentUser() user: any, @Body() body: any) {
    const stationId = await this.requireStationId(
      user.tenantId,
      body.stationId,
    );
    return this.forecasts.run({
      tenantId: user.tenantId,
      stationId,
      horizon: Number(body.horizon ?? 7),
      granularity: body.granularity ?? 'DAY',
    });
  }

  @RequirePermission('analytics:read')
  @Get('forecast/volume')
  async forecastVolume(@CurrentUser() user: any, @Query() query: any) {
    const stationId = await this.requireStationId(
      user.tenantId,
      query.stationId,
    );
    return this.forecasts.list({
      tenantId: user.tenantId,
      stationId,
      from: this.parseRequiredDate(query.from, 'from'),
      to: this.parseRequiredDate(query.to, 'to'),
      granularity: query.granularity ?? 'DAY',
    });
  }

  @RequirePermission('analytics:read')
  @Get('stations/compare')
  stationCompare(@CurrentUser() user: any, @Query() query: any) {
    return this.rankings.stationCompare({
      tenantId: user.tenantId,
      metric: query.metric ?? 'inbound',
      date: this.parseDate(query.date) ?? new Date(),
      limit: this.parseLimit(query.limit),
    });
  }

  @RequirePermission('analytics:reconcile')
  @Post('reconcile')
  async reconcile(@CurrentUser() user: any, @Body() body: any) {
    const stationId = await this.requireStationId(
      user.tenantId,
      body.stationId,
    );
    return this.reconcileService.recomputeDay({
      tenantId: user.tenantId,
      stationId,
      date: this.parseDate(body.date) ?? new Date(),
    });
  }

  @RequirePermission('analytics:export')
  @Post('reports')
  createReport(@CurrentUser() user: any, @Body() body: any) {
    return this.reports.create(body, {
      tenantId: user.tenantId,
      userId: user.userId,
    });
  }

  @RequirePermission('analytics:export')
  @Get('reports/:id')
  getReport(@CurrentUser() user: any, @Param('id') id: string) {
    return this.reports.get(user.tenantId, id);
  }

  private async requireStationId(tenantId: string, stationId?: string) {
    const resolved = await this.queries.resolveStationId(tenantId, stationId);
    if (!resolved) {
      throw new BadRequestException('stationId is required');
    }
    return resolved;
  }

  private parseRequiredDate(value: string | undefined, name: string) {
    const date = this.parseDate(value);
    if (!date) {
      throw new BadRequestException(`${name} is required`);
    }
    return date;
  }

  private parseDate(value?: string) {
    return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
  }

  private parseLimit(value?: string) {
    const parsed = Number(value ?? 10);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 10;
  }
}

@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly queries: QueryService) {}

  @RequirePermission('analytics:platform:read')
  @Get('overview')
  overview(@CurrentUser() user: any, @Query() query: any) {
    this.assertPlatform(user);
    return this.queries.platformOverview(this.parseDate(query.date));
  }

  @RequirePermission('analytics:platform:read')
  @Get('tenants/compare')
  tenantCompare(@CurrentUser() user: any, @Query() query: any) {
    this.assertPlatform(user);
    return this.queries.platformTenantCompare({
      metric: query.metric ?? 'inbound',
      date: this.parseDate(query.date),
      limit: this.parseLimit(query.limit),
    });
  }

  private assertPlatform(user: any) {
    if (!user?.isPlatform) {
      throw new BizError(ApiCode.FORBIDDEN, '无权限执行该操作');
    }
  }

  private parseDate(value?: string) {
    return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
  }

  private parseLimit(value?: string) {
    const parsed = Number(value ?? 10);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 10;
  }
}
