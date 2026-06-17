import { Injectable, Logger } from '@nestjs/common';
import { NotifyChannel, RenderedMessage } from './notify-channel';

@Injectable()
export class MockSmsChannel implements NotifyChannel {
  private readonly logger = new Logger(MockSmsChannel.name);
  readonly channel = 'SMS' as const;

  async send(message: RenderedMessage) {
    this.logger.log(`[mock-sms] ${message.content}`);
    return { ok: true };
  }
}
