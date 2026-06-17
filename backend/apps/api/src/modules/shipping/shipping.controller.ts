import { Body, Controller, Post } from '@nestjs/common';
import { RequirePermission } from '../identity/decorators';
import { QuoteDto } from './dto/quote.dto';
import { ShippingService } from './shipping.service';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @RequirePermission('shipping:quote')
  @Post('quote')
  quote(@Body() dto: QuoteDto) {
    return this.shipping.quote(dto);
  }
}
