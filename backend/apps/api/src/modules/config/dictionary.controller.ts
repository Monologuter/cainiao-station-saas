import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { Audit } from '../audit/audit.decorator';
import { CurrentUser, Public, RequirePermission } from '../identity/decorators';
import {
  CreateDictItemDto,
  CreateNotifyTemplateDto,
  UpdateChannelConfigDto,
  UpdateDictItemDto,
  UpdateNotifyTemplateDto,
  UpdateSystemConfigDto,
} from './config.dto';
import { ChannelConfigService } from './channel-config.service';
import { DictionaryService } from './dictionary.service';
import { SystemConfigService } from './system-config.service';
import { NotifyTemplateService } from './notify-template.service';

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
    @Body() body: CreateDictItemDto,
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
    @Body() body: UpdateDictItemDto,
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

@Controller('admin/config/system')
export class AdminSystemConfigController {
  constructor(private readonly systemConfigs: SystemConfigService) {}

  @RequirePermission('config:view')
  @Get()
  list(@CurrentUser() user: any) {
    this.requirePlatform(user);
    return this.systemConfigs.list();
  }

  @Audit({
    action: 'config.system.update',
    resourceType: 'system_config',
    summary: '更新系统参数',
  })
  @RequirePermission('config:manage')
  @Patch(':key')
  update(
    @CurrentUser() user: any,
    @Param('key') key: string,
    @Body() body: UpdateSystemConfigDto,
  ) {
    this.requirePlatform(user);
    return this.systemConfigs.update(key, body, user.userId);
  }

  private requirePlatform(user: any) {
    if (!user?.isPlatform) {
      throw new BizError(ApiCode.FORBIDDEN, '仅平台用户可管理系统配置');
    }
  }
}

@Controller('admin/config/channels')
export class AdminChannelConfigController {
  constructor(private readonly channels: ChannelConfigService) {}

  @RequirePermission('config:view')
  @Get()
  list(@CurrentUser() user: any) {
    this.requirePlatform(user);
    return this.channels.list();
  }

  @Audit({
    action: 'config.channel.update',
    resourceType: 'channel_config',
    summary: '更新渠道开关',
  })
  @RequirePermission('config:manage')
  @Patch(':channel')
  update(
    @CurrentUser() user: any,
    @Param('channel') channel: string,
    @Body() body: UpdateChannelConfigDto,
  ) {
    this.requirePlatform(user);
    return this.channels.update(channel, body, user.userId);
  }

  private requirePlatform(user: any) {
    if (!user?.isPlatform) {
      throw new BizError(ApiCode.FORBIDDEN, '仅平台用户可管理系统配置');
    }
  }
}

@Controller('admin/config/notify-templates')
export class AdminNotifyTemplateController {
  constructor(private readonly templates: NotifyTemplateService) {}

  @RequirePermission('config:view')
  @Get()
  list(@CurrentUser() user: any, @Query() query: any) {
    this.requirePlatform(user);
    return this.templates.list({ code: query.code, channel: query.channel });
  }

  @Audit({
    action: 'config.notify_template.create',
    resourceType: 'notify_template',
    summary: '新增通知模板',
  })
  @RequirePermission('config:manage')
  @Post()
  create(@CurrentUser() user: any, @Body() body: CreateNotifyTemplateDto) {
    this.requirePlatform(user);
    return this.templates.create(body);
  }

  @Audit({
    action: 'config.notify_template.update',
    resourceType: 'notify_template',
    summary: '更新通知模板',
  })
  @RequirePermission('config:manage')
  @Patch(':id')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: UpdateNotifyTemplateDto,
  ) {
    this.requirePlatform(user);
    return this.templates.update(id, body);
  }

  private requirePlatform(user: any) {
    if (!user?.isPlatform) {
      throw new BizError(ApiCode.FORBIDDEN, '仅平台用户可管理系统配置');
    }
  }
}
