import { AssistantContext } from '../assistant.types';

export type AssistantToolName = 'query_my_parcels' | 'query_logistics';

export interface AssistantToolContext extends AssistantContext {
  verifiedPhone?: string;
}

export interface AssistantToolResult {
  isError: boolean;
  code?: string;
  message?: string;
  [key: string]: unknown;
}

export interface AssistantTool {
  readonly name: AssistantToolName;
  execute(
    args: Record<string, unknown>,
    ctx: AssistantToolContext,
  ): Promise<AssistantToolResult>;
}
