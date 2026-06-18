import { Module } from '@nestjs/common';
import { MultiLevelCacheService } from '../../core/cache/multi-level-cache.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { ChannelConfigService } from './channel-config.service';
import { ChannelResolver } from './channel-resolver';
import { CallbackSecurityService } from './callback-security.service';
import {
  AdminChannelConfigController,
  AdminDictionaryController,
  AdminNotifyTemplateController,
  AdminSystemConfigController,
  PublicDictionaryController,
} from './dictionary.controller';
import { DictionaryService } from './dictionary.service';
import { NotifyTemplateService } from './notify-template.service';
import { ProviderRegistry } from './provider-registry';
import { IntegrationConfigService } from './integration-config.service';
import { RuntimeConfigService } from './runtime-config.service';
import { SystemConfigService } from './system-config.service';

@Module({
  controllers: [
    AdminChannelConfigController,
    AdminDictionaryController,
    AdminNotifyTemplateController,
    AdminSystemConfigController,
    PublicDictionaryController,
  ],
  providers: [
    ChannelConfigService,
    ChannelResolver,
    CallbackSecurityService,
    DictionaryService,
    IntegrationConfigService,
    NotifyTemplateService,
    ProviderRegistry,
    RuntimeConfigService,
    SystemConfigService,
    PrismaService,
    RedisService,
    MultiLevelCacheService,
  ],
  exports: [
    ChannelConfigService,
    ChannelResolver,
    CallbackSecurityService,
    DictionaryService,
    IntegrationConfigService,
    NotifyTemplateService,
    RuntimeConfigService,
    SystemConfigService,
  ],
})
export class AdminConfigModule {}
