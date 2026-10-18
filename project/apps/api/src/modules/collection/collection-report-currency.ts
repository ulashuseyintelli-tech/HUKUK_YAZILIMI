import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** Callers: ReportService.getCollectionHistoryReport; resolveCollectionReportScope. */
export function collectionReportCurrency(values: unknown[], requested?: string): string | null {
  // Collection.currency is a string, not Case.Currency's five-value enum.
  // Preserve uppercase three-letter codes without adding an admission policy or FX mapping.
  const valid = (value: unknown): value is string => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
  if (requested !== undefined && !valid(requested)) {
    throw new BadRequestException('Geçersiz tahsilat raporu para birimi');
  }
  if (values.some(value => !valid(value))) {
    throw new ConflictException({ code: 'COLLECTION_CURRENCY_UNKNOWN', message: 'Tahsilat para birimi doğrulanamadı; toplam hesaplanmadı' });
  }
  const currencies = [...new Set(values as string[])].sort();
  if (currencies.length > 1) {
    throw new ConflictException({ code: 'COLLECTION_CURRENCY_REQUIRED', message: 'Farklı para birimleri toplanamaz. Rapor için para birimi seçin.', currencies });
  }
  if (requested && currencies.some(currency => currency !== requested)) throw new ConflictException('Tahsilat raporu para birimi eşleşmiyor');
  return requested ?? currencies[0] ?? null;
}

/** Callers: CollectionService.getSummary; ReportService.getCollectionSummary.
 * Pin every aggregate query even after an empty or single-currency preflight:
 * another currency inserted concurrently must never enter an unqualified sum.
 */
export async function resolveCollectionReportScope(db: Pick<Prisma.TransactionClient, 'collection'>, where: Prisma.CollectionWhereInput, requested?: string) {
  collectionReportCurrency([], requested);
  const currencies = requested ? [] : await db.collection.findMany({ where, select: { currency: true }, distinct: ['currency'] });
  const currency = collectionReportCurrency(currencies.map(row => row.currency), requested);
  return { currency, where: { ...where, currency: currency ?? { in: [] } } satisfies Prisma.CollectionWhereInput };
}
