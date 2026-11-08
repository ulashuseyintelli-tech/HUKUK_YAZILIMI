import {
  CLIENT_STATEMENT_SOURCE_LABELS,
  type ClientStatementCurrencyReason,
  type ClientStatementCurrencySource,
} from './client-statement-currency-guard';
import { Prisma } from '@prisma/client';
import { identifyMonthlyStatementPeriod } from './client-statement-monthly-period';

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

export type MonthlyStatementSkipResolution = { outcome: 'NO_MATCH' | 'RESOLVED' | 'FAILED'; completed: number };

/** Called after generation commit and on monthly reuse; never generates or sends a statement. */
export async function resolveMonthlyStatementSkipTasks(
  prisma: { $transaction: <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T> },
  tenantId: string,
  statementId: string,
): Promise<MonthlyStatementSkipResolution> {
  return prisma.$transaction<MonthlyStatementSkipResolution>(async (tx) => {
    const statement = await tx.clientStatement.findFirst({
      where: { id: statementId, tenantId, caseId: null, status: 'ACTIVE', currency: 'TRY' },
      select: { clientId: true, periodStart: true, periodEnd: true, createdAt: true },
    });
    if (!statement) return { outcome: 'NO_MATCH', completed: 0 };
    const period = identifyMonthlyStatementPeriod(statement.periodStart, statement.periodEnd);
    if (!period) return { outcome: 'NO_MATCH', completed: 0 };
    const tasks = await tx.task.findMany({
      where: {
        tenantId, clientId: statement.clientId, createdById: null,
        status: { in: ['PENDING', 'IN_PROGRESS'] }, createdAt: { lte: statement.createdAt },
        dedupeKey: { in: ['NON_TRY_SOURCE', 'CURRENCY_UNDETERMINED'].map(reason =>
          buildMonthlyStatementSkipDedupeKey(tenantId, statement.clientId, period.periodKey, reason)) },
      },
      select: { id: true, status: true, createdAt: true, dedupeKey: true },
    });
    let completed = 0;
    for (const task of tasks) {
      // Historical snapshot presence is not generation proof. Only a committed, source-checked
      // generation/supersession after this task and carrying the server marker qualifies.
      const generation = await tx.auditLog.findFirst({
        where: {
          tenantId, entityType: 'ClientStatement', createdAt: { gte: task.createdAt },
          AND: [{ metadata: { path: ['currencySkipResolutionEligible'], equals: true } }],
          OR: [
            { action: 'CLIENT_STATEMENT_GENERATED', entityId: statementId },
            { action: 'CLIENT_STATEMENT_SUPERSEDED', metadata: { path: ['newStatementId'], equals: statementId } },
          ],
        }, select: { id: true },
      });
      if (!generation) continue;
      const changed = await tx.task.updateMany({
        where: { id: task.id, tenantId, clientId: statement.clientId, dedupeKey: task.dedupeKey, status: { in: ['PENDING', 'IN_PROGRESS'] } },
        data: { status: 'COMPLETED', completedAt: new Date(), completedByUserId: null, resolutionType: 'AUTO_SYSTEM' },
      });
      if (changed.count !== 1) continue;
      await tx.auditLog.create({ data: {
        tenantId, action: 'MONTHLY_STATEMENT_SKIP_RESOLVED', entityType: 'Task', entityId: task.id,
        userId: null, actorType: 'SYSTEM', decisionResult: 'SUCCESS', reasonCode: 'STATEMENT_GENERATED',
        oldValues: { status: task.status }, newValues: { status: 'COMPLETED', resolutionType: 'AUTO_SYSTEM' },
        metadata: { statementId, generationAuditId: generation.id, periodKey: period.periodKey, reasonCode: task.dedupeKey!.split(':').pop(), deliveryProven: false },
      } });
      completed++;
    }
    return { outcome: completed ? 'RESOLVED' : 'NO_MATCH', completed };
  });
}

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
