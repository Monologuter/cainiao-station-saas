export interface AssistantContext {
  tenantId: string;
  actorType: 'CONSUMER' | 'STAFF';
  consumerId?: string;
  staffUserId?: string;
  channel: 'USER_APP' | 'STATION_WEB';
  conversationId?: string;
}

export interface AssistantCitation {
  id: string;
  category: string;
  question: string;
  source?: string;
  score?: number;
}

export interface AssistantAnswer {
  conversationId?: string;
  text: string;
  citations: AssistantCitation[];
  toolCalls: Array<Record<string, unknown>>;
  degraded: boolean;
  mode: 'MOCK' | 'REAL';
}
