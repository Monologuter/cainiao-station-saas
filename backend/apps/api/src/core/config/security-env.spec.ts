import { validateSecurityEnv } from './security-env';

describe('validateSecurityEnv', () => {
  it('rejects missing or public default secrets', () => {
    expect(() => validateSecurityEnv({})).toThrow('JWT_SECRET is required');
    expect(() =>
      validateSecurityEnv({
        JWT_SECRET: 'dev-secret-change-me',
        AI_SERVICE_TOKEN: 'service-token-for-tests',
      }),
    ).toThrow('JWT_SECRET must not use the public default value');
    expect(() =>
      validateSecurityEnv({
        JWT_SECRET: 'jwt-secret-for-tests',
        AI_SERVICE_TOKEN: 'dev-service-token',
      }),
    ).toThrow('AI_SERVICE_TOKEN must not use the public default value');
  });

  it('passes explicit non-default secrets through', () => {
    expect(
      validateSecurityEnv({
        JWT_SECRET: 'jwt-secret-for-tests',
        AI_SERVICE_TOKEN: 'service-token-for-tests',
      }),
    ).toMatchObject({
      JWT_SECRET: 'jwt-secret-for-tests',
      AI_SERVICE_TOKEN: 'service-token-for-tests',
    });
  });
});
