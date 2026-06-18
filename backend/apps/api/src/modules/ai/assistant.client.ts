import { Injectable } from '@nestjs/common';
import { AssistantAnswer, AssistantContext } from './assistant.types';

@Injectable()
export class AssistantClient {
  async ask(
    _question: string,
    _ctx: AssistantContext,
  ): Promise<AssistantAnswer> {
    throw new Error('assistant client is not configured');
  }
}
