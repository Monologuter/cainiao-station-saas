const PUBLIC_JWT_SECRET = 'dev-secret-change-me';
const PUBLIC_AI_SERVICE_TOKEN = 'dev-service-token';

export function validateSecurityEnv(config: Record<string, unknown>) {
  const jwtSecret = String(config.JWT_SECRET ?? '').trim();
  const aiServiceToken = String(config.AI_SERVICE_TOKEN ?? '').trim();

  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }
  if (jwtSecret === PUBLIC_JWT_SECRET) {
    throw new Error('JWT_SECRET must not use the public default value');
  }
  if (!aiServiceToken) {
    throw new Error('AI_SERVICE_TOKEN is required');
  }
  if (aiServiceToken === PUBLIC_AI_SERVICE_TOKEN) {
    throw new Error('AI_SERVICE_TOKEN must not use the public default value');
  }

  return config;
}

export function requireJwtSecret() {
  return requireSecret('JWT_SECRET', PUBLIC_JWT_SECRET);
}

export function requireAiServiceToken() {
  return requireSecret('AI_SERVICE_TOKEN', PUBLIC_AI_SERVICE_TOKEN);
}

function requireSecret(name: string, publicDefault: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  if (value === publicDefault) {
    throw new Error(`${name} must not use the public default value`);
  }
  return value;
}
