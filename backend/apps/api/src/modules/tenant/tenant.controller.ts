import { Body, Controller, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
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

@Controller('platform/tenants')
export class TenantController {
  constructor(private readonly tenant: TenantService) {}

  @RequirePermission('tenant:create')
  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenant.createTenant(dto);
  }
}
