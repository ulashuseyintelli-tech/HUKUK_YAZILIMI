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

/** The caller supplies its current transaction; historical reads and replay never call this admission gate. */
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
    throw new ConflictException(error.getResponse());
  }
}
