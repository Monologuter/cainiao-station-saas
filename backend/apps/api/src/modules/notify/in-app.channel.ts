import { Injectable } from '@nestjs/common';
import { NotifyChannel, RenderedMessage } from './notify-channel';

@Injectable()
export class InAppChannel implements NotifyChannel {
  readonly channel = 'IN_APP' as const;

  async send(_message: RenderedMessage) {
    return { ok: true };
  }
}
