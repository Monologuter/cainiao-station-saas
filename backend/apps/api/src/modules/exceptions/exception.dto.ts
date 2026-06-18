import { IsArray, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export enum ExceptionTypeDto {
  DAMAGED = 'DAMAGED',
  MISDELIVERED = 'MISDELIVERED',
  UNCLAIMED = 'UNCLAIMED',
  REJECTED = 'REJECTED',
  OVERSIZED = 'OVERSIZED',
}

export enum SeverityDto {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum ExceptionResolutionDto {
  CONTACT_COURIER = 'CONTACT_COURIER',
  RETURN = 'RETURN',
  RESTOCK = 'RESTOCK',
  VOID = 'VOID',
}

export class CreateExceptionDto {
  @IsOptional()
  @IsUUID()
  stationId?: string;

  @IsEnum(ExceptionTypeDto)
  type: ExceptionTypeDto;

  @IsString()
  description: string;

  @IsOptional()
  @IsEnum(SeverityDto)
  severity?: SeverityDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceUrls?: string[];
}

export class ResolveExceptionDto {
  @IsEnum(ExceptionResolutionDto)
  resolution: ExceptionResolutionDto;

  @IsOptional()
  @IsString()
  note?: string;
}
