const FULL_REDACTED = '[REDACTED]';

const fullRedactFieldPattern =
  /(password|passwd|token|secret|accesskey|secretkey|privatekey|apikey|appkey)/i;
const phoneFieldPattern = /(phone|mobile|tel)/i;
const idFieldPattern = /(idcard|identity|credential|idno)/i;

export function redactAuditValue(value: unknown, fieldName = ''): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactAuditValue(item, fieldName));
  }

  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        redactAuditValue(nestedValue, key),
      ]),
    );
  }

  if (typeof value !== 'string') {
    return value;
  }

  if (fullRedactFieldPattern.test(fieldName)) {
    return FULL_REDACTED;
  }

  if (phoneFieldPattern.test(fieldName)) {
    return maskPhone(value);
  }

  if (idFieldPattern.test(fieldName)) {
    return maskId(value);
  }

  return value;
}

function maskPhone(value: string) {
  const normalized = value.trim();
  if (normalized.length < 7) {
    return '****';
  }
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

function maskId(value: string) {
  const normalized = value.trim();
  if (normalized.length < 8) {
    return '****';
  }
  return `${normalized.slice(0, 3)}***********${normalized.slice(-4)}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}
