import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import { RequirePermission } from './decorators';
import { PlatformUserService } from './platform-user.service';

class CreatePlatformUserDto {
  @IsString()
  username: string;

  @IsString()
  @MinLength(6)
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

  @Post()
  create(@Body() dto: CreatePlatformUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlatformUserDto) {
    return this.users.update(id, dto);
  }

  @Delete(':id')
  deactivate(@Param('id') id: string) {
    return this.users.deactivate(id);
  }
}
