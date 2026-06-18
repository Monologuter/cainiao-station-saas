import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';

export interface PriceBreakdown {
  firstPrice: number;
  addWeightUnits: number;
  addPrice: number;
  subtotal: number;
  zoneFactor: number;
  total: number;
}

export interface ShippingPriceQuote {
  courierCode: string;
  courierName: string;
  zone: string;
  amount: number;
  estHours: number;
  breakdown: PriceBreakdown;
  ruleId: string;
}

interface PriceRuleRecord {
  id?: string;
  courierCode: string;
  courierName: string;
  zone: string;
  firstWeightGram: number;
  firstPrice: number;
  addUnitGram: number;
  addPrice: number;
  zoneFactor: { toString(): string } | number | string;
  estHours: number;
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: TenantPrismaService) {}

  async quote(
    courierCode: string,
    zone: string,
    weightGram: number,
  ): Promise<ShippingPriceQuote> {
    const rule = await this.prisma.withTenant<PriceRuleRecord | null>((tx) =>
      tx.priceRule.findFirst({
        where: { courierCode, zone, enabled: true },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      }),
    );

    if (!rule) {
      throw new BizError(
        ApiCode.SHIPPING_NO_PRICE_RULE,
        '当前线路暂无可用寄件报价',
      );
    }

    if (!Number.isFinite(weightGram) || weightGram <= 0) {
      throw new BizError(ApiCode.BAD_REQUEST, '寄件重量必须为有限正数');
    }
    this.assertPositiveFinite(rule.addUnitGram, '续重计费单位');
    this.assertNonNegativeFinite(rule.firstWeightGram, '首重克数');
    this.assertNonNegativeFinite(rule.firstPrice, '首重价格');
    this.assertNonNegativeFinite(rule.addPrice, '续重价格');
    const zoneFactorValue = Number(rule.zoneFactor);
    this.assertPositiveFinite(zoneFactorValue, '区域系数');

    const addWeight = Math.max(weightGram - rule.firstWeightGram, 0);
    const addWeightUnits = Math.ceil(addWeight / rule.addUnitGram);
    const addPrice = addWeightUnits * rule.addPrice;
    const subtotal = rule.firstPrice + addPrice;
    const zoneFactor = zoneFactorValue;
    const total = Math.round(subtotal * zoneFactor);

    return {
      courierCode: rule.courierCode,
      courierName: rule.courierName,
      zone: rule.zone,
      amount: total,
      estHours: rule.estHours,
      ruleId: rule.id ?? '',
      breakdown: {
        firstPrice: rule.firstPrice,
        addWeightUnits,
        addPrice,
        subtotal,
        zoneFactor,
        total,
      },
    };
  }

  private assertPositiveFinite(value: number, label: string): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new BizError(
        ApiCode.BAD_REQUEST,
        `定价参数非法：${label}必须为正数`,
      );
    }
  }

  private assertNonNegativeFinite(value: number, label: string): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new BizError(
        ApiCode.BAD_REQUEST,
        `定价参数非法：${label}必须为非负数`,
      );
    }
  }
}
