import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { ApiCode, BizError } from '../../core/http/api-code';
import { Public } from '../identity/decorators';
import { MemberService } from '../member/member.service';
import { AssistantService } from './assistant.service';

class AssistantChatDto {
  @IsString()
  tenantId: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}

class AssistantTenantQuery {
  @IsString()
  tenantId: string;
}

@Public()
@Controller('assistant')
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly members: MemberService,
  ) {}

  @Post('chat')
  async chat(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: AssistantChatDto,
    @Res() res: any,
  ) {
    const consumer = await this.members.requireConsumer(authorization);
    const events = await this.assistant.chat(dto, consumer);

    res.status(201);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    for (const event of events) {
      res.write(this.formatSse(event.event, event.data));
    }
    res.end();
  }

  @Get('conversations')
  async conversations(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: AssistantTenantQuery,
  ) {
    this.requireTenant(query.tenantId);
    const consumer = await this.members.requireConsumer(authorization);
    return this.assistant.listConversations(query.tenantId, consumer);
  }

  @Get('conversations/:id/messages')
  async messages(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Query() query: AssistantTenantQuery,
  ) {
    this.requireTenant(query.tenantId);
    const consumer = await this.members.requireConsumer(authorization);
    return this.assistant.listMessages(query.tenantId, id, consumer);
  }

  private requireTenant(tenantId?: string) {
    if (!tenantId) {
      throw new BizError(ApiCode.BAD_REQUEST, '缺少租户');
    }
  }

  private formatSse(event: string, data: Record<string, unknown>) {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }
}
