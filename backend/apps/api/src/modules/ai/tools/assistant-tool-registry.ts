import { Injectable } from '@nestjs/common';
import {
  AssistantTool,
  AssistantToolContext,
  AssistantToolName,
  AssistantToolResult,
} from './assistant-tool.types';
import { QueryLogisticsTool } from './query-logistics.tool';
import { QueryMyParcelsTool } from './query-my-parcels.tool';

@Injectable()
export class AssistantToolRegistry {
  private readonly tools: Map<AssistantToolName, AssistantTool>;

  constructor(
    queryMyParcels: QueryMyParcelsTool,
    queryLogistics: QueryLogisticsTool,
  ) {
    this.tools = new Map<AssistantToolName, AssistantTool>([
      [queryMyParcels.name, queryMyParcels],
      [queryLogistics.name, queryLogistics],
    ]);
  }

  async execute(
    name: AssistantToolName,
    args: Record<string, unknown>,
    ctx: AssistantToolContext,
  ): Promise<AssistantToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        isError: true,
        code: 'TOOL_NOT_ALLOWED',
        message: '该助手工具未开放。',
      };
    }
    return tool.execute(args, ctx);
  }
}
