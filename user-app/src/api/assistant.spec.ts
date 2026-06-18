import { describe, expect, it } from 'vitest';
import { parseAssistantSse } from './assistant';

describe('assistant api helpers', () => {
  it('parses assistant SSE delta, citation, tool and done events', () => {
    const events = parseAssistantSse(
      [
        'event: delta',
        'data: {"text":"您好"}',
        '',
        'event: tool',
        'data: {"name":"query_my_parcels","result":{"isError":false}}',
        '',
        'event: citation',
        'data: {"id":"faq-1","question":"怎么取件？"}',
        '',
        'event: done',
        'data: {"conversationId":"conv-1","degraded":true}',
        '',
      ].join('\n'),
    );

    expect(events).toEqual([
      { event: 'delta', data: { text: '您好' } },
      {
        event: 'tool',
        data: { name: 'query_my_parcels', result: { isError: false } },
      },
      { event: 'citation', data: { id: 'faq-1', question: '怎么取件？' } },
      { event: 'done', data: { conversationId: 'conv-1', degraded: true } },
    ]);
  });
});
