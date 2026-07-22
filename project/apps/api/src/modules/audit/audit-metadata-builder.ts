/**
 * CAP-09A Audit Attribution Foundation — strict write-time metadata helper.
 *
 * Yalnız bu helper'ı çağıran YENİ CAP-09 consumer'ları için geçerlidir; mevcut
 * `AuditService.log()`/`logInTransaction()` çağıranları (legacy serbest-biçimli
 * `metadata`) buna zorunlu tabi DEĞİLDİR ve değişmeden çalışmaya devam eder.
 *
 * Kural (owner GO-DECIDE madde 4, PII/secret-safe): değer yalnız string/number/
 * boolean/null olabilir — nested object/array reddedilir; anahtar adı
 * (case-insensitive) yasaklı-anahtar listesiyle eşleşirse reddedilir; girdi
 * mutate edilmez, temiz bir kopya döner.
 */

const FORBIDDEN_METADATA_KEYS = [
  'password',
  'passwordhash',
  'token',
  'resettoken',
  'jwt',
  'refreshtoken',
  'authorization',
  'cookie',
  'smtppassword',
  'apikey',
  'tckn',
  'iban',
  'requestbody',
  'documentcontent',
  'freetext',
] as const;

export type AuditMetadataScalar = string | number | boolean | null;

export class AuditMetadataRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditMetadataRejectedError';
  }
}

export function buildAuditMetadata(
  input: Record<string, unknown> | undefined | null,
): Record<string, AuditMetadataScalar> {
  if (input === undefined || input === null) return {};

  const result: Record<string, AuditMetadataScalar> = {};

  for (const key of Object.keys(input)) {
    const normalizedKey = key.toLowerCase();
    if ((FORBIDDEN_METADATA_KEYS as readonly string[]).includes(normalizedKey)) {
      throw new AuditMetadataRejectedError(
        `audit-metadata-builder: forbidden key "${key}" is not allowed in CAP-09 audit metadata`,
      );
    }

    const value = input[key];
    if (value === undefined) continue;

    if (value !== null && typeof value === 'object') {
      throw new AuditMetadataRejectedError(
        `audit-metadata-builder: key "${key}" has a nested object/array value, which is not allowed in CAP-09 audit metadata`,
      );
    }

    const valueType = typeof value;
    if (value !== null && valueType !== 'string' && valueType !== 'number' && valueType !== 'boolean') {
      throw new AuditMetadataRejectedError(
        `audit-metadata-builder: key "${key}" has an unsupported value type ("${valueType}")`,
      );
    }

    result[key] = value as AuditMetadataScalar;
  }

  return result;
}
