import { createHash } from 'crypto';

export type SourceHashAmountInput =
  | string
  | number
  | bigint
  | {
      toString(): string;
    };

export interface CanonicalSourceHashOptions {
  amountFieldNames?: ReadonlyArray<string>;
  nonAuthoritativeMetadataKeys?: ReadonlyArray<string>;
}

const DEFAULT_AMOUNT_FIELD_NAMES = ['amount', 'totalAmount', 'paidAmount', 'remainingAmount'] as const;

const DEFAULT_NON_AUTHORITATIVE_METADATA_KEYS = [
  'authorizationMode',
  'description',
  'displayName',
  'label',
  'note',
  'notes',
  'safeSummary',
  'sourceName',
] as const;

export function createCanonicalSourceHash(value: unknown, options: CanonicalSourceHashOptions = {}): string {
  return createHash('sha256').update(canonicalSourceHashJson(value, options)).digest('hex');
}

export function canonicalSourceHashJson(value: unknown, options: CanonicalSourceHashOptions = {}): string {
  return JSON.stringify(canonicalizeSourceHashValue(value, options, []));
}

export function normalizeSourceHashDate(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

export function normalizeSourceHashAmount(value: SourceHashAmountInput): string {
  const raw = String(value).trim();
  const match = raw.match(/^([+-])?(\d+)(?:\.(\d+))?$/);

  if (!match) {
    throw new Error(`Amount value cannot be normalized: ${raw}`);
  }

  const sign = match[1] === '-' ? '-' : '';
  const integer = stripLeadingZeros(match[2]);
  const fraction = match[3] ?? '';
  const extraFraction = fraction.slice(2);

  if (extraFraction.length > 0 && /[1-9]/.test(extraFraction)) {
    throw new Error(`Amount value exceeds 2 decimal places: ${raw}`);
  }

  const normalizedFraction = fraction.padEnd(2, '0').slice(0, 2);
  const normalized = `${sign}${integer}.${normalizedFraction}`;

  return normalized === '-0.00' ? '0.00' : normalized;
}

function canonicalizeSourceHashValue(
  value: unknown,
  options: CanonicalSourceHashOptions,
  path: ReadonlyArray<string>,
): unknown {
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (value instanceof Date) return normalizeSourceHashDate(value);

  if (isAmountField(path, options)) {
    return normalizeSourceHashAmount(value as SourceHashAmountInput);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const canonical = canonicalizeSourceHashValue(item, options, [...path, String(index)]);
      return canonical === undefined ? null : canonical;
    });
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(record).sort()) {
      if (isExcludedMetadataKey(path, key, options)) continue;

      const canonical = canonicalizeSourceHashValue(record[key], options, [...path, key]);
      if (canonical !== undefined) {
        result[key] = canonical;
      }
    }

    return result;
  }

  return value;
}

function isAmountField(path: ReadonlyArray<string>, options: CanonicalSourceHashOptions): boolean {
  const key = path[path.length - 1];
  if (!key) return false;

  const amountFieldNames = new Set([...(options.amountFieldNames ?? DEFAULT_AMOUNT_FIELD_NAMES)]);
  return amountFieldNames.has(key) || key.endsWith('Amount');
}

function isExcludedMetadataKey(
  path: ReadonlyArray<string>,
  key: string,
  options: CanonicalSourceHashOptions,
): boolean {
  if (path[path.length - 1] !== 'metadata') return false;

  const metadataKeys = new Set([
    ...(options.nonAuthoritativeMetadataKeys ?? DEFAULT_NON_AUTHORITATIVE_METADATA_KEYS),
  ]);
  return metadataKeys.has(key);
}

function stripLeadingZeros(value: string): string {
  const stripped = value.replace(/^0+(?=\d)/, '');
  return stripped.length === 0 ? '0' : stripped;
}