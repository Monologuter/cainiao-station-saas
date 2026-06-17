import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  AdminDictionaryController,
  AdminSystemConfigController,
  PublicDictionaryController,
} from './dictionary.controller';
import { DictionaryService } from './dictionary.service';
import { RuntimeConfigService } from './runtime-config.service';
import { SystemConfigService } from './system-config.service';

@Module({
  controllers: [
    AdminDictionaryController,
    AdminSystemConfigController,
    PublicDictionaryController,
  ],
  providers: [
    DictionaryService,
    RuntimeConfigService,
    SystemConfigService,
    PrismaService,
  ],
  exports: [DictionaryService, RuntimeConfigService, SystemConfigService],
})
export class AdminConfigModule {}
