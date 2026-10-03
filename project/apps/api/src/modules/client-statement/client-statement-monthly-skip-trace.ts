import {
  CLIENT_STATEMENT_SOURCE_LABELS,
  type ClientStatementCurrencyReason,
  type ClientStatementCurrencySource,
} from './client-statement-currency-guard';

/**
 * AYLIK EKSTRE — ATLANAN EKSTRENİN KALICI İZİ (owner kararı 2026-10-03, "7 — ATLANAN AYLIK EKSTRE: B").
 *
 * Sorun: ekstreye girecek kaynaklarda TL dışı / belirlenemeyen para birimi varsa aylık koşu ekstreyi üretmez (E1, #2893). Bu atlama
 * yalnız koşu sonucunda ve günlük satırında ("atlandı=N") görünüyordu; müvekkil, dönem ve neden bakımından KALICI iz yoktu.
 *
 * Karar: mevcut kalıcı görev mekanizması kullanılır (yeni tablo / migration YOK). `Task.dedupeKey` UNIQUE olduğu için aynı
 * (büro, müvekkil, dönem, neden) için ikinci kayıt veritabanı düzeyinde yazılamaz → yeniden koşu ve eşzamanlı koşu mükerrer iz
 * üretmez; tamamlanmış görev yeniden diriltilmez. `ClientStatementDeliveryLedger` kullanılmaz: `statementId` zorunlu FK'dır ve atlanan
 * ekstrenin ekstresi yoktur; atlama hiçbir koşulda "gönderildi" / "başarı" sayılmaz ve defter kaydı OLUŞTURULMAZ.
 *
 * Görev tutar ya da kayıt kimliği taşımaz; yalnız müvekkil adı, dönem, neden kodu ve para birimi kodları yazılır.
 */

export const MONTHLY_STATEMENT_SKIP_TRACE_PREFIX = 'MONTHLY_STATEMENT_SKIPPED';

/** İzin yazım sonucu: yeni kayıt / bu (müvekkil, dönem, neden) için zaten kayıtlı / yazılamadı (gizlenmez). */
export type MonthlyStatementSkipTraceResult = 'CREATED' | 'ALREADY_RECORDED' | 'WRITE_FAILED';

export interface MonthlyStatementSkipTraceInput {
  tenantId: string;
  clientId: string;
  clientName: string;
  periodKey: string;
  reasonCode: ClientStatementCurrencyReason | string;
  /** TL dışı, belirli para birimi kodları (tutar değil). */
  currencies: readonly string[];
  sources: readonly ClientStatementCurrencySource[];
}

/**
 * (büro, müvekkil, dönem, neden) başına TEK izin kimliği. `Task.dedupeKey` UNIQUE.
 *
 * Cagrildigi yerler:
 * - ClientStatementMonthlyDeliveryService.recordSkippedStatementTrace() -> görev yazımı
 */
export function buildMonthlyStatementSkipDedupeKey(
  tenantId: string,
  clientId: string,
  periodKey: string,
  reasonCode: string,
): string {
  return [MONTHLY_STATEMENT_SKIP_TRACE_PREFIX, tenantId, clientId, periodKey, reasonCode].join(':');
}

function describeReason(reasonCode: string, currencies: readonly string[]): string {
  if (reasonCode === 'CURRENCY_UNDETERMINED') return 'para birimi belirlenemeyen kayıt var';
  return currencies.length > 0 ? `TL dışı para biriminde kayıt var (${currencies.join(', ')})` : 'TL dışı para biriminde kayıt var';
}

/**
 * Görev kaydının içeriği (Prisma `task.create` verisi). Tutar / kayıt kimliği YOK.
 *
 * Cagrildigi yerler:
 * - ClientStatementMonthlyDeliveryService.recordSkippedStatementTrace()
 */
export function buildMonthlyStatementSkipTask(input: MonthlyStatementSkipTraceInput) {
  const reason = describeReason(String(input.reasonCode), input.currencies);
  const where = input.sources.map((source) => CLIENT_STATEMENT_SOURCE_LABELS[source]).join(', ');
  return {
    tenantId: input.tenantId,
    clientId: input.clientId,
    title: `Aylık ekstre üretilemedi: ${input.clientName} (${input.periodKey})`,
    description:
      `Müvekkil: ${input.clientName}\n` +
      `Dönem: ${input.periodKey}\n` +
      `Neden: ekstreye girecek kayıtlar arasında ${reason}${where ? ` — ${where}` : ''}.\n\n` +
      'Bu dönem için otomatik aylık ekstre ÜRETİLMEDİ ve GÖNDERİLMEDİ; gönderilmiş sayılmaz. Farklı para birimleri tek ekstrede ' +
      'toplanamaz ve döviz ekstresi henüz desteklenmiyor. Müvekkile ekstre gerekiyorsa elle değerlendirilmelidir. ' +
      'Aynı müvekkil, dönem ve neden için yeniden koşu bu görevi tekrarlamaz.',
    status: 'PENDING' as const,
    priority: 'MEDIUM' as const,
    dedupeKey: buildMonthlyStatementSkipDedupeKey(input.tenantId, input.clientId, input.periodKey, String(input.reasonCode)),
    createdById: null,
  };
}
