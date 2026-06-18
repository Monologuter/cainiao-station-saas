export type NotifyChannelType = 'IN_APP' | 'SMS';

export interface RenderedMessage {
  channel: NotifyChannelType;
  content: string;
  receiverPhone?: string;
  templateCode?: string;
  variables?: string[];
}

export interface NotifyChannel {
  readonly channel: NotifyChannelType;
  send(message: RenderedMessage): Promise<{
    ok: boolean;
    error?: string;
    retryable?: boolean;
    billingUnits?: number;
    providerRequestId?: string;
  }>;
}
