import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { Audit } from '../audit/audit.decorator';
import { RequirePermission } from '../identity/decorators';
import { StrongPassword } from '../identity/password.validator';
import { TenantService } from './tenant.service';

class CreateTenantDto {
  @IsString()
  name: string;

  @IsString()
  ownerName: string;

  @IsString()
  ownerPhone: string;

  @IsString()
  @StrongPassword()
  ownerPassword: string;
}

class ListTenantQuery {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  size?: string;
}

class UpdateTenantStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED', 'CLOSED'])
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
}

@Controller('platform/tenants')
export class TenantController {
  constructor(private readonly tenant: TenantService) {}

  @Audit({
    action: 'platform.tenant.create',
    resourceType: 'tenant',
    summary: '开通租户',
  })
  @RequirePermission('tenant:create')
  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenant.createTenant(dto);
  }

  @RequirePermission('tenant:read')
  @Get()
  list(@Query() query: ListTenantQuery) {
    return this.tenant.listTenants(query);
  }

  @Audit({
    action: 'platform.tenant.status.update',
    resourceType: 'tenant',
    summary: '变更租户启停状态',
  })
  @RequirePermission('tenant:manage')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.tenant.updateStatus(id, dto.status);
  }
}
