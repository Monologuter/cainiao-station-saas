import { Module } from '@nestjs/common';
import { CircuitBreakerService } from '../../core/circuit-breaker/circuit-breaker.service';
import { OcrClient } from './ocr.client';

@Module({
  providers: [CircuitBreakerService, OcrClient],
  exports: [OcrClient],
})
export class AiModule {}
