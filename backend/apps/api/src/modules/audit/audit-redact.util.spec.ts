import { redactAuditValue } from './audit-redact.util';

describe('redactAuditValue', () => {
  it('redacts credential-like fields recursively while keeping safe fields readable', () => {
    expect(
      redactAuditValue({
        username: 'station-boss',
        contactPhone: '13912345678',
        password: 'pw123456',
        token: 'jwt-token',
        nested: {
          accessKey: 'ak-test',
          secretKey: 'sk-test',
          idCardNo: '310101199001011234',
        },
        list: [{ receiverPhone: '13800001111', label: '小件' }],
      }),
    ).toEqual({
      username: 'station-boss',
      contactPhone: '139****5678',
      password: '[REDACTED]',
      token: '[REDACTED]',
      nested: {
        accessKey: '[REDACTED]',
        secretKey: '[REDACTED]',
        idCardNo: '310***********1234',
      },
      list: [{ receiverPhone: '138****1111', label: '小件' }],
    });
  });

  it('redacts standalone sensitive primitive values when field name is supplied', () => {
    expect(redactAuditValue('wx-secret', 'wechatSecret')).toBe('[REDACTED]');
    expect(redactAuditValue('13700002222', 'ownerPhone')).toBe('137****2222');
  });
});
