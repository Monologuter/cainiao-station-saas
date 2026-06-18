import { Module } from '@nestjs/common';
import { CircuitBreakerService } from '../../core/circuit-breaker/circuit-breaker.service';
import { ConversationService } from './conversation.service';
import { OcrClient } from './ocr.client';

@Module({
  providers: [CircuitBreakerService, ConversationService, OcrClient],
  exports: [ConversationService, OcrClient],
})
export class AiModule {}
