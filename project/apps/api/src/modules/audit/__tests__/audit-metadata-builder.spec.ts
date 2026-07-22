import { buildAuditMetadata, AuditMetadataRejectedError } from '../audit-metadata-builder';

describe('buildAuditMetadata (CAP-09A strict write-time helper)', () => {
  it('scalar (string/number/boolean/null) değerleri olduğu gibi döner', () => {
    const input = { reason: 'ok', count: 3, active: true, note: null };
    expect(buildAuditMetadata(input)).toEqual({ reason: 'ok', count: 3, active: true, note: null });
  });

  it('undefined/null girdi için boş obje döner', () => {
    expect(buildAuditMetadata(undefined)).toEqual({});
    expect(buildAuditMetadata(null)).toEqual({});
  });

  it('undefined değerli anahtarları atlar', () => {
    const input = { a: 'x', b: undefined as unknown };
    expect(buildAuditMetadata(input as Record<string, unknown>)).toEqual({ a: 'x' });
  });

  it('girdi objesini mutate etmez', () => {
    const input: Record<string, unknown> = { a: 'x' };
    buildAuditMetadata(input);
    expect(input).toEqual({ a: 'x' });
  });

  it.each([
    'password',
    'passwordHash',
    'token',
    'resetToken',
    'jwt',
    'refreshToken',
    'authorization',
    'cookie',
    'smtpPassword',
    'apiKey',
    'tckn',
    'iban',
    'requestBody',
    'documentContent',
    'freeText',
  ])('yasaklı anahtar "%s" reddedilir', (key) => {
    expect(() => buildAuditMetadata({ [key]: 'x' })).toThrow(AuditMetadataRejectedError);
  });

  it('yasaklı anahtar case-insensitive reddedilir', () => {
    expect(() => buildAuditMetadata({ PASSWORD: 'x' })).toThrow(AuditMetadataRejectedError);
    expect(() => buildAuditMetadata({ ApiKey: 'x' })).toThrow(AuditMetadataRejectedError);
  });

  it('nested object değeri reddedilir', () => {
    expect(() => buildAuditMetadata({ nested: { a: 1 } })).toThrow(AuditMetadataRejectedError);
  });

  it('array değeri reddedilir', () => {
    expect(() => buildAuditMetadata({ list: [1, 2, 3] })).toThrow(AuditMetadataRejectedError);
  });

  it('Date değeri reddedilir (nested object sayılır)', () => {
    expect(() => buildAuditMetadata({ when: new Date() })).toThrow(AuditMetadataRejectedError);
  });
});
