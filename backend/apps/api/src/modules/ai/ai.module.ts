import { Module } from '@nestjs/common';
import { CircuitBreakerService } from '../../core/circuit-breaker/circuit-breaker.service';
import { AssistantClient } from './assistant.client';
import { ConversationService } from './conversation.service';
import { FaqAssistantService } from './faq-assistant.service';
import { LlmAssistantService } from './llm-assistant.service';
import { OcrClient } from './ocr.client';

@Module({
  providers: [
    AssistantClient,
    CircuitBreakerService,
    ConversationService,
    FaqAssistantService,
    LlmAssistantService,
    OcrClient,
  ],
  exports: [
    AssistantClient,
    ConversationService,
    FaqAssistantService,
    LlmAssistantService,
    OcrClient,
  ],
})
export class AiModule {}
