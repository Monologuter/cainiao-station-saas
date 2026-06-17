import { Injectable } from '@nestjs/common';
import { PricingService, ShippingPriceQuote } from './pricing.service';

export type ShippingZone =
  | 'SAME_CITY'
  | 'SAME_PROVINCE'
  | 'CROSS_PROVINCE'
  | 'REMOTE';

export type QuotePreference = 'balanced' | 'priceFirst' | 'speedFirst';

export interface AddressInput {
  province: string;
  city: string;
  district: string;
  address?: string;
  name?: string;
  phone?: string;
}

export interface CourierSelectorInput {
  sender: AddressInput;
  receiver: AddressInput;
  weightGram: number;
  preference?: QuotePreference;
  courierCodes?: string[];
}

export interface CourierQuote extends ShippingPriceQuote {
  recommended: boolean;
}

const DEFAULT_COURIERS = ['SF', 'YTO', 'ZTO', 'STO'];
const REMOTE_PROVINCES = [
  '新疆',
  '新疆维吾尔自治区',
  '西藏',
  '西藏自治区',
  '内蒙古',
  '内蒙古自治区',
  '青海',
  '青海省',
  '宁夏',
  '宁夏回族自治区',
  '甘肃',
  '甘肃省',
];

@Injectable()
export class CourierSelectorService {
  constructor(private readonly pricing: PricingService) {}

  resolveZone(sender: AddressInput, receiver: AddressInput): ShippingZone {
    if (this.isRemote(receiver.province)) {
      return 'REMOTE';
    }
    if (
      sender.province === receiver.province &&
      sender.city === receiver.city
    ) {
      return 'SAME_CITY';
    }
    if (sender.province === receiver.province) {
      return 'SAME_PROVINCE';
    }
    return 'CROSS_PROVINCE';
  }

  async rank(input: CourierSelectorInput): Promise<CourierQuote[]> {
    const zone = this.resolveZone(input.sender, input.receiver);
    const courierCodes = input.courierCodes ?? DEFAULT_COURIERS;
    const quotes = await this.collectQuotes(
      courierCodes,
      zone,
      input.weightGram,
    );

    const sorted = quotes.sort((a, b) => {
      if (input.preference === 'priceFirst') {
        return a.amount - b.amount || a.estHours - b.estHours;
      }
      if (input.preference === 'speedFirst') {
        return a.estHours - b.estHours || a.amount - b.amount;
      }
      return this.score(a, quotes) - this.score(b, quotes);
    });

    return sorted.map((quote, index) => ({
      ...quote,
      recommended: index === 0,
    }));
  }

  private async collectQuotes(
    courierCodes: string[],
    zone: ShippingZone,
    weightGram: number,
  ): Promise<ShippingPriceQuote[]> {
    const quotes = await Promise.all(
      courierCodes.map(async (courierCode) => {
        try {
          return await this.pricing.quote(courierCode, zone, weightGram);
        } catch {
          return null;
        }
      }),
    );

    return quotes.filter((quote): quote is ShippingPriceQuote =>
      this.isUsableQuote(quote),
    );
  }

  private score(quote: ShippingPriceQuote, quotes: ShippingPriceQuote[]) {
    const amounts = quotes.map((item) => item.amount);
    const hours = quotes.map((item) => item.estHours);
    return (
      this.normalize(quote.amount, Math.min(...amounts), Math.max(...amounts)) *
        0.6 +
      this.normalize(quote.estHours, Math.min(...hours), Math.max(...hours)) *
        0.4
    );
  }

  private normalize(value: number, min: number, max: number) {
    if (max === min) {
      return 0;
    }
    return (value - min) / (max - min);
  }

  private isRemote(province: string) {
    return REMOTE_PROVINCES.some((remote) => province.includes(remote));
  }

  private isUsableQuote(
    quote: ShippingPriceQuote | null,
  ): quote is ShippingPriceQuote {
    return (
      Boolean(quote) &&
      Number.isFinite(quote?.amount) &&
      Number.isFinite(quote?.estHours)
    );
  }
}
