import { Injectable } from '@nestjs/common';
import { CourierSelectorService } from './courier-selector.service';
import { QuoteDto } from './dto/quote.dto';

@Injectable()
export class ShippingService {
  constructor(private readonly courierSelector: CourierSelectorService) {}

  quote(input: QuoteDto) {
    return this.courierSelector.rank({
      sender: input.sender,
      receiver: input.receiver,
      weightGram: input.weightGram,
      preference: input.preference,
    });
  }
}
