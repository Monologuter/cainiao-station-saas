import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class CreatePlanDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsInt()
  @Min(0)
  monthlyPrice: number;

  @IsObject()
  quotas: Record<string, number>;

  @IsObject()
  overagePrices: Record<string, number>;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyPrice?: number;

  @IsOptional()
  @IsObject()
  quotas?: Record<string, number>;

  @IsOptional()
  @IsObject()
  overagePrices?: Record<string, number>;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
