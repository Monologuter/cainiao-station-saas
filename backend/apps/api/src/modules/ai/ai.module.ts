import { Module } from '@nestjs/common';
import { CircuitBreakerService } from '../../core/circuit-breaker/circuit-breaker.service';
import { LogisticsModule } from '../logistics/logistics.module';
import { ParcelModule } from '../parcel/parcel.module';
import { ShippingModule } from '../shipping/shipping.module';
import { AssistantClient } from './assistant.client';
import { ConversationService } from './conversation.service';
import { FaqAssistantService } from './faq-assistant.service';
import { LlmAssistantService } from './llm-assistant.service';
import { OcrClient } from './ocr.client';
import { AssistantToolRegistry } from './tools/assistant-tool-registry';
import { QueryLogisticsTool } from './tools/query-logistics.tool';
import { QueryMyParcelsTool } from './tools/query-my-parcels.tool';

@Module({
  imports: [ParcelModule, ShippingModule, LogisticsModule],
  providers: [
    AssistantClient,
    AssistantToolRegistry,
    CircuitBreakerService,
    ConversationService,
    FaqAssistantService,
    LlmAssistantService,
    OcrClient,
    QueryLogisticsTool,
    QueryMyParcelsTool,
  ],
  exports: [
    AssistantClient,
    AssistantToolRegistry,
    ConversationService,
    FaqAssistantService,
    LlmAssistantService,
    OcrClient,
  ],
})
export class AiModule {}
