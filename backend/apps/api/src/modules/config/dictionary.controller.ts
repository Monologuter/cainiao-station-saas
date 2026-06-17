import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { Audit } from '../audit/audit.decorator';
import { CurrentUser, Public, RequirePermission } from '../identity/decorators';
import {
  CreateDictItemInput,
  DictionaryService,
  UpdateDictItemInput,
} from './dictionary.service';

@Controller('admin/config')
export class AdminDictionaryController {
  constructor(private readonly dictionaries: DictionaryService) {}

  @RequirePermission('config:view')
  @Get('dictionaries')
  list(@CurrentUser() user: any) {
    this.requirePlatform(user);
    return this.dictionaries.listDictionaries();
  }

  @RequirePermission('config:view')
  @Get('dictionaries/:type/items')
  items(@CurrentUser() user: any, @Param('type') type: string) {
    this.requirePlatform(user);
    return this.dictionaries.listItems(type);
  }

  @Audit({
    action: 'config.dictionary.item.create',
    resourceType: 'dict_item',
    summary: '新增字典项',
  })
  @RequirePermission('config:manage')
  @Post('dictionaries/:type/items')
  createItem(
    @CurrentUser() user: any,
    @Param('type') type: string,
    @Body() body: CreateDictItemInput,
  ) {
    this.requirePlatform(user);
    return this.dictionaries.createItem(type, body);
  }

  @Audit({
    action: 'config.dictionary.item.update',
    resourceType: 'dict_item',
    summary: '更新字典项',
  })
  @RequirePermission('config:manage')
  @Patch('dict-items/:id')
  updateItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: UpdateDictItemInput,
  ) {
    this.requirePlatform(user);
    return this.dictionaries.updateItem(id, body);
  }

  private requirePlatform(user: any) {
    if (!user?.isPlatform) {
      throw new BizError(ApiCode.FORBIDDEN, '仅平台用户可管理系统配置');
    }
  }
}

@Controller('dict')
export class PublicDictionaryController {
  constructor(private readonly dictionaries: DictionaryService) {}

  @Public()
  @Get(':type')
  items(@Param('type') type: string) {
    return this.dictionaries.listItems(type, true);
  }
}
