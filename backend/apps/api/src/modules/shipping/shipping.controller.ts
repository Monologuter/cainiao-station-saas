import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { ApiCode, BizError } from '../../core/http/api-code';
import { LogisticsService } from '../logistics/logistics.service';
import { PayService } from '../pay/pay.service';
import { CurrentUser, RequirePermission } from '../identity/decorators';
import { CreateShipOrderDto } from './dto/create-ship-order.dto';
import { QuoteDto } from './dto/quote.dto';
import { ShippingService } from './shipping.service';

class ListShipOrdersQuery {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  stationId?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  size?: string;
}

@Controller('shipping')
export class ShippingController {
  constructor(
    private readonly shipping: ShippingService,
    private readonly logistics: LogisticsService,
    private readonly pay: PayService,
  ) {}

  @RequirePermission('shipping:quote')
  @Post('quote')
  quote(@Body() dto: QuoteDto) {
    return this.shipping.quote(dto);
  }

  @RequirePermission('shipping:create')
  @Post('orders')
  createOrder(@Body() dto: CreateShipOrderDto, @CurrentUser() user: any) {
    return this.shipping.createOrder(dto, user);
  }

  @RequirePermission('shipping:read')
  @Get('orders')
  listOrders(@Query() query: ListShipOrdersQuery, @CurrentUser() user: any) {
    return this.shipping.listOrders(query, user);
  }

  @RequirePermission('shipping:read')
  @Get('orders/:id')
  getOrder(@Param('id') id: string, @CurrentUser() user: any) {
    return this.shipping.getOrder(id, user);
  }

  @RequirePermission('shipping:pay')
  @Post('orders/:id/pay')
  payOrder(
    @Param('id') id: string,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @CurrentUser() user: any,
  ) {
    if (!idempotencyKey) {
      throw new BizError(ApiCode.BAD_REQUEST, '缺少支付幂等键');
    }
    return this.pay.payShipOrder(id, idempotencyKey, user);
  }

  @RequirePermission('shipping:collect')
  @Post('orders/:id/collect')
  collectOrder(@Param('id') id: string, @CurrentUser() user: any) {
    return this.logistics.collectShipOrder(id, user);
  }
}
