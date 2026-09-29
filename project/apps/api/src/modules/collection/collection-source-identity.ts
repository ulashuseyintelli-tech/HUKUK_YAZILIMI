import { BadRequestException } from '@nestjs/common';

/**
 * K3-L Faz 1e — tahsilat kaynak kimliği metinleri (gönderen / ileten icra dairesi) ve isteğe bağlı borçlu kimliği için
 * GİRİŞ normalizasyonu. class-validator'dan geçmeyen uçlarda (satır içi gövde tipi kullanan controller'lar) aynı
 * kural elle uygulanır: string olmayan değer 400; boş/boşluk → alan YOK (anahtar yazılmaz → parmak izi korunur).
 */
export const SOURCE_IDENTITY_TEXT_MAX_LENGTH = 200;

/**
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CaseService.createCollection() → POST /cases/:id/collections (payerName / forwardingOfficeName)
 * /// </remarks>
 */
export function normalizeSourceIdentityText(value: unknown, field: 'payerName' | 'forwardingOfficeName'): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new BadRequestException({ code: 'COLLECTION_SOURCE_IDENTITY_INVALID', field, message: `${field} metin olmalıdır.` });
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > SOURCE_IDENTITY_TEXT_MAX_LENGTH) {
    throw new BadRequestException({
      code: 'COLLECTION_SOURCE_IDENTITY_TOO_LONG',
      field,
      message: `${field} en fazla ${SOURCE_IDENTITY_TEXT_MAX_LENGTH} karakter olabilir.`,
    });
  }
  return trimmed;
}

/**
 * İsteğe bağlı "hesabına ödeme yapılan borçlu" kimliği: string olmayan değer 400 (işlem içinde TypeError/500 yerine);
 * boş → alan yok. Dönen değer hem onay jetonu bağlamasına hem servise AYNEN verilir.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - BankController.matchTransaction() → POST /bank/transactions/:id/match
 * /// </remarks>
 */
export function normalizeOptionalCaseDebtorId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new BadRequestException({ code: 'BANK_RECEIPT_CASE_DEBTOR_INVALID', message: 'caseDebtorId metin olmalıdır.' });
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
