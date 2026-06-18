import { Module } from '@nestjs/common';
import { CircuitBreakerService } from '../../core/circuit-breaker/circuit-breaker.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { LogisticsModule } from '../logistics/logistics.module';
import { MemberModule } from '../member/member.module';
import { ParcelModule } from '../parcel/parcel.module';
import { ShippingModule } from '../shipping/shipping.module';
import { AssistantClient } from './assistant.client';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { ConversationService } from './conversation.service';
import { FaqAssistantService } from './faq-assistant.service';
import { LlmAssistantService } from './llm-assistant.service';
import { OcrClient } from './ocr.client';
import { AssistantToolRegistry } from './tools/assistant-tool-registry';
import { QueryLogisticsTool } from './tools/query-logistics.tool';
import { QueryMyParcelsTool } from './tools/query-my-parcels.tool';

@Module({
  imports: [ParcelModule, ShippingModule, LogisticsModule, MemberModule],
  controllers: [AssistantController],
  providers: [
    AssistantClient,
    AssistantService,
    AssistantToolRegistry,
    CircuitBreakerService,
    ConversationService,
    FaqAssistantService,
    LlmAssistantService,
    OcrClient,
    PrismaService,
    QueryLogisticsTool,
    QueryMyParcelsTool,
    TenantPrismaService,
  ],
  exports: [
    AssistantClient,
    AssistantService,
    AssistantToolRegistry,
    ConversationService,
    FaqAssistantService,
    LlmAssistantService,
    OcrClient,
  ],
})
export class AiModule {}
