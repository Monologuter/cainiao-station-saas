import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export enum CouponTypeDto {
  DISCOUNT = 'DISCOUNT',
  RATE = 'RATE',
  EXEMPT = 'EXEMPT',
}

export enum CouponSceneDto {
  PICKUP = 'PICKUP',
  SHIP = 'SHIP',
  ALL = 'ALL',
}

export class CreateCouponTemplateDto {
  @IsString()
  name: string;

  @IsEnum(CouponTypeDto)
  type: CouponTypeDto;

  @IsInt()
  @Min(0)
  faceValue: number;

  @IsInt()
  @Min(0)
  threshold: number;

  @IsEnum(CouponSceneDto)
  scene: CouponSceneDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  costPoints?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalStock?: number;

  @IsInt()
  @Min(1)
  validDays: number;
}

export class IssueCouponsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  memberIds: string[];
}

export class RedeemCouponDto {
  @IsUUID()
  templateId: string;
}

export class VerifyCouponDto {
  @IsString()
  usedRefType: string;

  @IsString()
  usedRefId: string;

  @IsString()
  idempotencyKey: string;
}
