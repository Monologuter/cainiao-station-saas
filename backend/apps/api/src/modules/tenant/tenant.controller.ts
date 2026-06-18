import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { RequirePermission } from '../identity/decorators';
import { TenantService } from './tenant.service';

class CreateTenantDto {
  @IsString()
  name: string;

  @IsString()
  ownerName: string;

  @IsString()
  ownerPhone: string;

  @IsString()
  @MinLength(6)
  ownerPassword: string;
}

class ListTenantQuery {
  @IsOptional()
  @IsString()
  status?: string;
}

class UpdateTenantStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED', 'CLOSED'])
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
}

@Controller('platform/tenants')
export class TenantController {
  constructor(private readonly tenant: TenantService) {}

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

  @RequirePermission('tenant:read')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.tenant.updateStatus(id, dto.status);
  }
}
