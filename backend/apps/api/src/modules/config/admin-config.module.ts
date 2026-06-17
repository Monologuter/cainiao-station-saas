import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  AdminDictionaryController,
  PublicDictionaryController,
} from './dictionary.controller';
import { DictionaryService } from './dictionary.service';

@Module({
  controllers: [AdminDictionaryController, PublicDictionaryController],
  providers: [DictionaryService, PrismaService],
  exports: [DictionaryService],
})
export class AdminConfigModule {}
