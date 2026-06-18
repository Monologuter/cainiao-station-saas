import helmet from 'helmet';
import { INestApplication } from '@nestjs/common';

export function applyHttpSecurity(app: INestApplication) {
  app.use(
    helmet({
      frameguard: { action: 'sameorigin' },
      hsts: { maxAge: 15552000, includeSubDomains: true },
    }),
  );
  app.enableCors({
    origin: resolveCorsOrigins(),
    credentials: true,
  });
}

function resolveCorsOrigins() {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) {
    return false;
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
