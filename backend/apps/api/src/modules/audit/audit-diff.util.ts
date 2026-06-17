import { redactAuditValue } from './audit-redact.util';

export type AuditDiffEntry = {
  type: 'added' | 'changed' | 'removed';
  before: unknown;
  after: unknown;
};

export type AuditDiff = Record<string, AuditDiffEntry>;

export function diffAuditObjects(before: unknown, after: unknown): AuditDiff {
  const beforeFlat = flattenValue(before);
  const afterFlat = flattenValue(after);
  const paths = new Set([
    ...Object.keys(beforeFlat),
    ...Object.keys(afterFlat),
  ]);
  const diff: AuditDiff = {};

  for (const path of paths) {
    const beforeHas = Object.prototype.hasOwnProperty.call(beforeFlat, path);
    const afterHas = Object.prototype.hasOwnProperty.call(afterFlat, path);
    const beforeValue = beforeFlat[path];
    const afterValue = afterFlat[path];

    if (beforeHas && afterHas && sameValue(beforeValue, afterValue)) {
      continue;
    }

    diff[path] = {
      type: beforeHas ? (afterHas ? 'changed' : 'removed') : 'added',
      before: beforeHas ? redactAuditValue(beforeValue, path) : undefined,
      after: afterHas ? redactAuditValue(afterValue, path) : undefined,
    };
  }

  return diff;
}

function flattenValue(
  value: unknown,
  prefix = '',
  output: Record<string, unknown> = {},
) {
  if (!isPlainRecord(value)) {
    if (prefix) {
      output[prefix] = value;
    }
    return output;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainRecord(nestedValue)) {
      flattenValue(nestedValue, path, output);
    } else {
      output[path] = nestedValue;
    }
  }

  return output;
}

function sameValue(left: unknown, right: unknown) {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  if (!isPlainRecord(value)) {
    return JSON.stringify(value);
  }

  const sorted = Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = value[key];
      return acc;
    }, {});

  return JSON.stringify(sorted);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}
