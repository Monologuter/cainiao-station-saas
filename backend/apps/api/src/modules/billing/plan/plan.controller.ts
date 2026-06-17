import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentUser, RequirePermission } from '../../identity/decorators';
import { PlanService } from './plan.service';

@Controller('billing/plans')
export class PlanController {
  constructor(private readonly plans: PlanService) {}

  @RequirePermission('plan:read')
  @Get()
  listActivePlans() {
    return this.plans.listActivePlans();
  }

  @RequirePermission('plan:write')
  @Post()
  async createPlan(@CurrentUser() user: any, @Body() body: any) {
    await this.plans.assertPlatform(user);
    return this.plans.createPlan(body);
  }

  @RequirePermission('plan:write')
  @Put(':id')
  async updatePlan(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    await this.plans.assertPlatform(user);
    return this.plans.updatePlan(id, body);
  }

  @RequirePermission('plan:write')
  @Post(':id/archive')
  async archivePlan(@CurrentUser() user: any, @Param('id') id: string) {
    await this.plans.assertPlatform(user);
    return this.plans.archivePlan(id);
  }
}
