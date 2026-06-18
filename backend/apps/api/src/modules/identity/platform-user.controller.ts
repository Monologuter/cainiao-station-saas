import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { Audit } from '../audit/audit.decorator';
import { RequirePermission } from './decorators';
import { PlatformUserService } from './platform-user.service';
import { StrongPassword } from './password.validator';

class CreatePlatformUserDto {
  @IsString()
  username: string;

  @IsString()
  @StrongPassword()
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsArray()
  roleCodes?: string[];
}

class UpdatePlatformUserDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  roleCodes?: string[];
}

@Controller('admin/platform-users')
@RequirePermission('platform:user:manage')
export class PlatformUserController {
  constructor(private readonly users: PlatformUserService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Audit({
    action: 'platform.user.create',
    resourceType: 'platform_user',
    summary: '新增平台用户',
  })
  @Post()
  create(@Body() dto: CreatePlatformUserDto) {
    return this.users.create(dto);
  }

  @Audit({
    action: 'platform.user.update',
    resourceType: 'platform_user',
    summary: '更新平台用户',
  })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlatformUserDto) {
    return this.users.update(id, dto);
  }

  @Audit({
    action: 'platform.user.deactivate',
    resourceType: 'platform_user',
    summary: '停用平台用户',
  })
  @Delete(':id')
  deactivate(@Param('id') id: string) {
    return this.users.deactivate(id);
  }
}
