import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {
  CurrentUser,
  Public,
  RequirePermission,
} from '../../identity/decorators';
import { FileStorageService } from '../../file/file-storage.service';
import { ApplicationService } from './application.service';

class QualificationDto {
  @IsString()
  type: string;

  @IsString()
  fileKey: string;

  @IsString()
  fileName: string;
}

class SubmitApplicationDto {
  @IsString()
  entityType: 'INDIVIDUAL' | 'COMPANY';

  @IsString()
  entityName: string;

  @IsOptional()
  @IsString()
  unifiedCreditCode?: string;

  @IsString()
  regionCode: string;

  @IsString()
  contactName: string;

  @IsString()
  contactPhone: string;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsString()
  stationName: string;

  @IsString()
  stationAddress: string;

  @IsOptional()
  @IsString()
  proposedPlanCode?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QualificationDto)
  qualifications: QualificationDto[];
}

class UploadUrlDto {
  @IsString()
  fileType: string;

  @IsString()
  contentType: string;
}

class ApproveDto {
  @IsOptional()
  @IsString()
  planCode?: string;

  @IsOptional()
  @IsString()
  stationName?: string;
}

class RejectDto {
  @IsString()
  rejectReason: string;
}

@Controller()
export class ApplicationController {
  constructor(
    private readonly applications: ApplicationService,
    private readonly files: FileStorageService,
  ) {}

  @Public()
  @Post('onboarding/qualifications/upload-url')
  uploadUrl(@Body() body: UploadUrlDto) {
    return this.files.createUploadUrl(body);
  }

  @Public()
  @Post('onboarding/applications')
  submit(@Body() body: SubmitApplicationDto) {
    return this.applications.submit(body);
  }

  @Public()
  @Get('onboarding/applications/track')
  track(
    @Query('applicationNo') applicationNo: string,
    @Query('contactPhone') contactPhone: string,
  ) {
    return this.applications.track(applicationNo, contactPhone);
  }

  @RequirePermission('tenant:read')
  @Get('admin/applications')
  list(@Query() query: any) {
    return this.applications.list(query);
  }

  @RequirePermission('tenant:read')
  @Get('admin/applications/:id')
  detail(@Param('id') id: string) {
    return this.applications.detail(id);
  }

  @RequirePermission('tenant:review')
  @Post('admin/applications/:id/approve')
  approve(
    @Param('id') id: string,
    @Body() body: ApproveDto,
    @CurrentUser() user: any,
  ) {
    return this.applications.approve(id, user.userId, body);
  }

  @RequirePermission('tenant:review')
  @Post('admin/applications/:id/reject')
  reject(
    @Param('id') id: string,
    @Body() body: RejectDto,
    @CurrentUser() user: any,
  ) {
    return this.applications.reject(id, user.userId, body.rejectReason);
  }
}
