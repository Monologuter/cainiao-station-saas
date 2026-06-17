import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, RequirePermission } from '../identity/decorators';
import { ExceptionService } from './exception.service';

@Controller()
export class ExceptionController {
  constructor(private readonly exceptions: ExceptionService) {}

  @RequirePermission('exception:create')
  @Post('parcels/:id/exception')
  createForParcel(@Param('id') parcelId: string, @Body() body: any) {
    return this.exceptions.createException({
      parcelId,
      stationId: body.stationId,
      type: body.type,
      description: body.description,
      severity: body.severity,
      evidenceUrls: body.evidenceUrls,
    });
  }

  @RequirePermission('exception:read')
  @Get('exceptions')
  list(@Query() query: any) {
    return this.exceptions.list(query);
  }

  @RequirePermission('exception:read')
  @Get('exceptions/:id')
  detail(@Param('id') id: string) {
    return this.exceptions.detail(id);
  }

  @RequirePermission('exception:handle')
  @Post('exceptions/:id/claim')
  claim(@Param('id') id: string, @CurrentUser() user: any) {
    return this.exceptions.claim(id, user.userId);
  }

  @RequirePermission('exception:handle')
  @Post('exceptions/:id/resolve')
  resolve(@Param('id') id: string, @Body() body: any) {
    return this.exceptions.resolve(id, {
      resolution: body.resolution,
      note: body.note,
    });
  }
}
