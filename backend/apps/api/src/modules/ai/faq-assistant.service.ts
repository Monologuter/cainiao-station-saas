import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { AssistantAnswer, AssistantContext } from './assistant.types';

@Injectable()
export class FaqAssistantService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async ask(
    question: string,
    _ctx: AssistantContext,
  ): Promise<AssistantAnswer> {
    const entries = await this.tenantPrisma.withTenant<any[]>((tx) =>
      tx.faqEntry.findMany({
        where: {
          enabled: true,
          deletedAt: null,
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      }),
    );
    const hit = this.bestHit(question, entries);
    if (!hit) {
      return {
        text: '我现在可以回答「我的包裹到了吗 / 怎么寄件 / 取件码在哪」等问题，也可以帮您联系门店处理更复杂的问题。',
        citations: [],
        toolCalls: [],
        degraded: true,
        mode: 'MOCK',
      };
    }

    return {
      text: hit.answer,
      citations: [
        {
          id: hit.id,
          category: hit.category,
          question: hit.question,
          source: hit.source,
          score: this.score(question, hit),
        },
      ],
      toolCalls: [],
      degraded: true,
      mode: 'MOCK',
    };
  }

  private bestHit(question: string, entries: any[]) {
    return entries
      .map((entry) => ({ entry, score: this.score(question, entry) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.priority - a.entry.priority)
      .map((item) => item.entry)[0];
  }

  private score(question: string, entry: any) {
    const normalized = question.toLowerCase();
    let score = 0;
    for (const keyword of entry.keywords ?? []) {
      if (keyword && normalized.includes(String(keyword).toLowerCase())) {
        score += 10;
      }
    }
    if (normalized.includes(String(entry.question).toLowerCase())) {
      score += 5;
    }
    return score + (entry.priority ?? 0) / 1000;
  }
}
