import { Controller, Get, Header } from '@nestjs/common';
import { RawResponse } from '../http/response.interceptor';
import { Public } from '../../modules/identity/decorators';
import { MetricsService } from './metrics.service';

@Public()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  scrape() {
    return new RawResponse(this.metrics.render());
  }
}
