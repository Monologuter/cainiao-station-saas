import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ChannelConfigService } from './channel-config.service';
import { ChannelResolver } from './channel-resolver';
import {
  AdminChannelConfigController,
  AdminDictionaryController,
  AdminSystemConfigController,
  PublicDictionaryController,
} from './dictionary.controller';
import { DictionaryService } from './dictionary.service';
import { ProviderRegistry } from './provider-registry';
import { RuntimeConfigService } from './runtime-config.service';
import { SystemConfigService } from './system-config.service';

@Module({
  controllers: [
    AdminChannelConfigController,
    AdminDictionaryController,
    AdminSystemConfigController,
    PublicDictionaryController,
  ],
  providers: [
    ChannelConfigService,
    ChannelResolver,
    DictionaryService,
    ProviderRegistry,
    RuntimeConfigService,
    SystemConfigService,
    PrismaService,
  ],
  exports: [
    ChannelConfigService,
    ChannelResolver,
    DictionaryService,
    RuntimeConfigService,
    SystemConfigService,
  ],
})
export class AdminConfigModule {}
