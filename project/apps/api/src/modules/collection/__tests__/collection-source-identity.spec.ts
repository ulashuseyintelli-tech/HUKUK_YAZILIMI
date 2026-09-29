/**
 * K3-L Faz 1e — class-validator'dan geçmeyen uçlar için kaynak kimliği giriş normalizasyonu.
 */
import { BadRequestException } from '@nestjs/common';
import {
  SOURCE_IDENTITY_TEXT_MAX_LENGTH,
  normalizeOptionalCaseDebtorId,
  normalizeSourceIdentityText,
} from '../collection-source-identity';

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequestException);
    return String(((err as BadRequestException).getResponse() as { code?: string }).code);
  }
  throw new Error('beklenen red gelmedi');
};

describe('kaynak kimliği giriş normalizasyonu', () => {
  it('boş / boşluk / null → alan yok (anahtar yazılmaz); metin kırpılır', () => {
    expect(normalizeSourceIdentityText(undefined, 'payerName')).toBeUndefined();
    expect(normalizeSourceIdentityText(null, 'payerName')).toBeUndefined();
    expect(normalizeSourceIdentityText('   ', 'forwardingOfficeName')).toBeUndefined();
    expect(normalizeSourceIdentityText('  Gönderen A.Ş. ', 'payerName')).toBe('Gönderen A.Ş.');
  });

  it('string olmayan ya da çok uzun değer 400', () => {
    expect(codeOf(() => normalizeSourceIdentityText(42, 'payerName'))).toBe('COLLECTION_SOURCE_IDENTITY_INVALID');
    expect(codeOf(() => normalizeSourceIdentityText(['a'], 'forwardingOfficeName'))).toBe('COLLECTION_SOURCE_IDENTITY_INVALID');
    expect(codeOf(() => normalizeSourceIdentityText('x'.repeat(SOURCE_IDENTITY_TEXT_MAX_LENGTH + 1), 'payerName'))).toBe(
      'COLLECTION_SOURCE_IDENTITY_TOO_LONG',
    );
    expect(normalizeSourceIdentityText('x'.repeat(SOURCE_IDENTITY_TEXT_MAX_LENGTH), 'payerName')).toHaveLength(SOURCE_IDENTITY_TEXT_MAX_LENGTH);
  });

  it('banka eşleştirme caseDebtorId: string olmayan 400 (işlem içinde 500 değil); boş → alan yok', () => {
    expect(normalizeOptionalCaseDebtorId(undefined)).toBeUndefined();
    expect(normalizeOptionalCaseDebtorId('  ')).toBeUndefined();
    expect(normalizeOptionalCaseDebtorId(' cd-1 ')).toBe('cd-1');
    expect(codeOf(() => normalizeOptionalCaseDebtorId(7))).toBe('BANK_RECEIPT_CASE_DEBTOR_INVALID');
    expect(codeOf(() => normalizeOptionalCaseDebtorId({ id: 'x' }))).toBe('BANK_RECEIPT_CASE_DEBTOR_INVALID');
    expect(codeOf(() => normalizeOptionalCaseDebtorId(['cd-1']))).toBe('BANK_RECEIPT_CASE_DEBTOR_INVALID');
  });
});
