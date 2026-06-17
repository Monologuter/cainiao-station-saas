import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
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
  constructor(private readonly shipping: ShippingService) {}

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
}
