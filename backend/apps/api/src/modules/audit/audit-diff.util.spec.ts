import { diffAuditObjects } from './audit-diff.util';

describe('diffAuditObjects', () => {
  it('returns field-level added changed and removed entries', () => {
    expect(
      diffAuditObjects(
        {
          name: '旧模板',
          enabled: true,
          config: { retry: 1, provider: 'mock' },
          stale: 'remove-me',
        },
        {
          name: '新模板',
          enabled: true,
          config: { retry: 2, provider: 'mock' },
          added: 'new-value',
        },
      ),
    ).toEqual({
      name: { type: 'changed', before: '旧模板', after: '新模板' },
      'config.retry': { type: 'changed', before: 1, after: 2 },
      stale: { type: 'removed', before: 'remove-me', after: undefined },
      added: { type: 'added', before: undefined, after: 'new-value' },
    });
  });

  it('redacts sensitive values in nested diffs', () => {
    expect(
      diffAuditObjects(
        {
          contactPhone: '13912345678',
          config: { accessKey: 'old-ak', secret: 'old-secret' },
        },
        {
          contactPhone: '13987654321',
          config: { accessKey: 'new-ak', secret: 'new-secret' },
        },
      ),
    ).toEqual({
      contactPhone: {
        type: 'changed',
        before: '139****5678',
        after: '139****4321',
      },
      'config.accessKey': {
        type: 'changed',
        before: '[REDACTED]',
        after: '[REDACTED]',
      },
      'config.secret': {
        type: 'changed',
        before: '[REDACTED]',
        after: '[REDACTED]',
      },
    });
  });
});
