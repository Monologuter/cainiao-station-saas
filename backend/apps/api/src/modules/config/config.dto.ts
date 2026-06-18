import {
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateDictItemDto {
  @IsString()
  code: string;

  @IsString()
  label: string;

  @IsOptional()
  value?: unknown;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateDictItemDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  value?: unknown;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateSystemConfigDto {
  @IsDefined()
  value: unknown;
}

export class UpdateChannelConfigDto {
  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  fallbackProvider?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

enum NotifyChannelDto {
  IN_APP = 'IN_APP',
  SMS = 'SMS',
  WECHAT = 'WECHAT',
}

export class CreateNotifyTemplateDto {
  @IsString()
  code: string;

  @IsEnum(NotifyChannelDto)
  channel: NotifyChannelDto;

  @IsString()
  content: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateNotifyTemplateDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsEnum(NotifyChannelDto)
  channel?: NotifyChannelDto;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
