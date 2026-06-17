export type NotifyChannelType = 'IN_APP' | 'SMS';

export interface RenderedMessage {
  channel: NotifyChannelType;
  content: string;
}

export interface NotifyChannel {
  readonly channel: NotifyChannelType;
  send(message: RenderedMessage): Promise<{ ok: boolean; error?: string }>;
}
