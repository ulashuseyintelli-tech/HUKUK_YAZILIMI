import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

/** FR-7 A: admission only. Never relabel a source or convert an amount. */
export function assertCaseClaimCurrency(caseCurrency: unknown, currency: unknown): void {
  if (typeof caseCurrency !== 'string' || !/^[A-Z]{3}$/.test(caseCurrency)
    || typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)
    || currency !== caseCurrency) {
    throw new BadRequestException({
      code: 'CASE_CLAIM_CURRENCY_MISMATCH',
      message: 'Alacak kaleminin para birimi dosya para birimiyle aynı olmalıdır. Tutar veya para birimi çevrilmedi.',
    });
  }
}

const currencyLabel = (value: unknown): string => (typeof value === 'string' && value.trim() ? value.trim() : 'belirsiz');

/**
 * The caller supplies its current transaction; historical reads and replay never call this admission gate.
 * `finalizing`: onay YÜRÜTMESİ (kalem değişikliği onayı, açılış kalemi oluşturma onayı). Uyuşmazlık 409 olur ve ileti
 * nedeni + mevcut kurtarma yolunu söyler (owner E4 kararı 19.11.2026); çağıranın işlemi geri alınır, hiçbir alan yazılmaz.
 */
export async function assertStoredCaseClaimCurrency(
  database: { case: { findFirst: (...args: any[]) => Promise<any> } },
  tenantId: string,
  caseId: string,
  currency: unknown,
  finalizing = false,
): Promise<void> {
  const row = await database.case.findFirst({ where: { id: caseId, tenantId }, select: { id: true, currency: true } });
  if (!row) throw new NotFoundException('Dosya bulunamadı');
  try {
    assertCaseClaimCurrency(row.currency, currency);
  } catch (error) {
    if (!finalizing || !(error instanceof BadRequestException)) throw error;
    throw new ConflictException({
      code: 'CASE_CLAIM_CURRENCY_MISMATCH',
      message:
        `Bu onay uygulanamaz: alacak kaleminin para birimi (${currencyLabel(currency)}) dosyanın para birimiyle ` +
        `(${currencyLabel(row.currency)}) aynı değil. Hiçbir değişiklik uygulanmadı; tutar veya para birimi çevrilmedi. ` +
        'Talebi reddedip kalemi dosyanın para biriminde yeniden talep edin.',
      caseCurrency: typeof row.currency === 'string' ? row.currency : null,
      claimItemCurrency: typeof currency === 'string' ? currency : null,
    });
  }
}
