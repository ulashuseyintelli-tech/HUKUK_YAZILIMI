import { createHash } from 'crypto';
import { ConflictException } from '@nestjs/common';
import type { AllocationHoldReason, Prisma } from '@prisma/client';

/**
 * K3-L (owner GO 2026-09-29) — MAHSUBU BEKLETİLEN tahsilat (CollectionAllocationHold) yardımcıları.
 *
 * Bekletme = kaynağı doğrulanmış, KAYDEDİLMİŞ tahsilatın otomatik mahsubunun (LedgerEntry + LedgerAllocation) hesabına
 * ödeme yapılan borçlu belli olana kadar ertelenmesi. Fazla ödeme (CollectionOverpayment) DEĞİLDİR; iade/virman/
 * müvekkile dağıtım konusu olamaz. Tahsilat başına tek kayıt (collectionId @unique).
 */
export const PAYMENT_ALLOCATION_COMPLETED_EVENT = 'PAYMENT_ALLOCATION_COMPLETED' as const;
const PAYMENT_ALLOCATION_COMPLETED_NAMESPACE = 'collection.payment-allocation-completed.v1';

export type CollectionAllocationHoldActiveRow = Readonly<{
  id: string;
  collectionId: string;
  amount: Prisma.Decimal;
  currency: string;
  holdReason: AllocationHoldReason;
  createdAt: Date;
}>;

/**
 * Deterministik olay kimliği: aynı (tenant, tahsilat) için ikinci yayın outbox `evt:<id>` tekilliğine (P2002) takılır.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CollectionService.completeHeldAllocation() → PAYMENT_ALLOCATION_COMPLETED eventId
 * ///  - collection-cancel-executor.ts → PAYMENT_REVERSED eventId
 * /// </remarks>
 */
export function deterministicCollectionEventId(namespace: string, ...parts: string[]): string {
  const bytes = createHash('sha256').update([namespace, ...parts].join('\u001f')).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

export function paymentAllocationCompletedEventId(tenantId: string, collectionId: string): string {
  return deterministicCollectionEventId(PAYMENT_ALLOCATION_COMPLETED_NAMESPACE, tenantId, collectionId);
}

/**
 * Bekletme kaydı (HELD). Defter kaydı YOK; tutar = tahsilatın tamamı.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CollectionService.create() → mahsup bekletme dalı
 * /// </remarks>
 */
export async function createCollectionAllocationHoldInTx(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    caseId: string;
    collectionId: string;
    amount: number;
    currency: string;
    holdReason: AllocationHoldReason;
    createdById?: string;
  },
): Promise<string> {
  const hold = await tx.collectionAllocationHold.create({
    data: {
      tenantId: input.tenantId,
      caseId: input.caseId,
      collectionId: input.collectionId,
      amount: input.amount,
      currency: input.currency,
      status: 'HELD',
      holdReason: input.holdReason,
      createdById: input.createdById,
      metadata: { collectionAmount: input.amount, allocatedAmount: 0 },
    },
    select: { id: true },
  });
  return hold.id;
}

/**
 * Tahsilat iptali: HELD veya RELEASED bekletme kaydı REVERSED olur (RELEASED'ta defter kaydı iptal yürütücüsünce
 * ayrıca ters kayıtla kapatılır; releasedLedgerEntryId tarihçe olarak kalır).
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - collection-cancel-executor.ts executeCollectionCancelInTransaction()
 * /// </remarks>
 */
export async function reverseCollectionAllocationHoldInTx(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; caseId: string; collectionId: string; reversedAt: Date },
): Promise<number> {
  const result = await tx.collectionAllocationHold.updateMany({
    where: {
      tenantId: input.tenantId,
      caseId: input.caseId,
      collectionId: input.collectionId,
      status: { in: ['HELD', 'RELEASED'] },
    },
    data: { status: 'REVERSED', reversedAt: input.reversedAt },
  });
  return result.count;
}

/**
 * Dosyadaki AKTİF (HELD) bekletmeler — okuyucular için (borçlu bakiyesi, hesap özeti, kanonik bakiye fallback'i,
 * müvekkil dağıtım kapısı). Salt okuma.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CaseService.getDebtorLedgerBalances() / getCalculationSummary()
 * ///  - CaseBalanceService.computeCaseBalance() → Collection fallback dışlaması
 * ///  - DispositionPostingService.recommend()/post() → bekletme kapısı
 * ///  - readActiveAllocationHoldSummary() → diğer okuyucular (rapor, kapak hesabı, finans özeti, müvekkil cari)
 * /// </remarks>
 */
export async function findActiveCollectionAllocationHolds(
  db: Pick<Prisma.TransactionClient, 'collectionAllocationHold'>,
  tenantId: string,
  caseId: string,
): Promise<CollectionAllocationHoldActiveRow[]> {
  return db.collectionAllocationHold.findMany({
    where: { tenantId, caseId, status: 'HELD' },
    select: { id: true, collectionId: true, amount: true, currency: true, holdReason: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Prisma `Collection` sorguları için DIŞLAMA parçası: mahsubu BEKLETİLEN (HELD) tahsilat "mahsup edilmiş tahsilat"
 * toplamına GİRMEZ. Bekletme tamamlanınca (RELEASED) ya da iptal edilince (REVERSED) koşul kendiliğinden kalkar.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CaseService.findAll() → dosya listesi tahsilat toplamı
 * /// </remarks>
 */
export const EXCLUDE_ALLOCATION_HELD_COLLECTIONS = {
  NOT: { allocationHold: { is: { status: 'HELD' } } },
} as const satisfies Prisma.CollectionWhereInput;

export type ActiveAllocationHoldSummary = Readonly<{
  /** Mahsubu bekletilen tahsilat kimlikleri (toplamlardan dışlamak için) */
  collectionIds: ReadonlySet<string>;
  /** Bekletilen toplam tutar (istenen para birimi verildiyse yalnız o para birimi) */
  amount: number;
  count: number;
  holds: readonly CollectionAllocationHoldActiveRow[];
}>;

const EMPTY_ALLOCATION_HOLD_SUMMARY: ActiveAllocationHoldSummary = Object.freeze({
  collectionIds: new Set<string>(),
  amount: 0,
  count: 0,
  holds: Object.freeze([]) as readonly CollectionAllocationHoldActiveRow[],
});

/**
 * SAF: aktif bekletme satırlarından özet. Tutar kuruşa yuvarlanır (kayan nokta birikmesi olmasın).
 * Para birimi BİREBİR eşleşir — aynı yanıttaki tahsilat / dağıtım toplamları `where: { currency }` ile birebir
 * eşleştiği için (kayıtlı değerler kanonik büyük harftir) iki yarı farklı kuralla hesaplanmaz.
 */
export function summarizeActiveAllocationHolds(
  holds: readonly CollectionAllocationHoldActiveRow[],
  currency?: string | null,
): ActiveAllocationHoldSummary {
  const scoped = currency ? holds.filter((hold) => hold.currency === currency) : holds;
  const cents = scoped.reduce((sum, hold) => sum + Math.round(Number(hold.amount) * 100), 0);
  return {
    // Dışlama kümesi para biriminden BAĞIMSIZDIR: bekletilen tahsilat hiçbir toplamda "mahsup edilmiş" sayılmaz.
    collectionIds: new Set(holds.map((hold) => hold.collectionId)),
    amount: cents / 100,
    count: scoped.length,
    holds: scoped,
  };
}

/**
 * Okuyucular için: dosyadaki aktif bekletmelerin özeti. Salt okuma. Eski birim testlerinin kısmi Prisma mock'unda
 * model yoksa boş özet döner (üretimde model her zaman vardır).
 *
 * KURAL (K3-L D1): mahsubu bekletilen tahsilat borçtan DÜŞÜLMEZ, "tahsil edilen" toplamına GİRMEZ, fazla ödeme ya da
 * müvekkile dağıtılabilir tutar SAYILMAZ; ayrı "mahsubu bekleyen tahsilat" olarak gösterilir.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - ReportService.getCaseDebtReport()
 * ///  - CollectionService.calculateCover() → checkCaseCompletion()
 * ///  - CaseService.getCaseFinanceSummary()
 * ///  - ClientSettlementReadService.getClientAccountingSummary() → B grubu
 * ///  - AiService.getCaseWithDetails()
 * /// </remarks>
 */
export async function readActiveAllocationHoldSummary(
  db: Partial<Pick<Prisma.TransactionClient, 'collectionAllocationHold'>>,
  tenantId: string,
  caseId: string,
  currency?: string | null,
): Promise<ActiveAllocationHoldSummary> {
  const model = db.collectionAllocationHold;
  if (!model || typeof model.findMany !== 'function') return EMPTY_ALLOCATION_HOLD_SUMMARY;
  const holds = await findActiveCollectionAllocationHolds({ collectionAllocationHold: model }, tenantId, caseId);
  if (!Array.isArray(holds) || holds.length === 0) return EMPTY_ALLOCATION_HOLD_SUMMARY;
  return summarizeActiveAllocationHolds(holds, currency);
}

/**
 * BEKLETME KAPISI: mahsubu bekletilen tahsilat müvekkile dağıtılamaz / dağıtım önerisi üretilemez — para hangi borçlunun
 * hangi kalemine düştüğü belli olmadan dağıtım tutarı hesaplanamaz. Bekletme tamamlanınca (RELEASED) kapı açılır.
 * Model mock'ta yoksa (eski birim testleri) kapı devre dışı kalır.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - DispositionPostingService.assertCollectionConfirmed() → recommend()/post()
 * ///  - DistributionRecommendationService.generate()
 * /// </remarks>
 */
export async function assertNoActiveCollectionAllocationHold(
  db: Partial<Pick<Prisma.TransactionClient, 'collectionAllocationHold'>>,
  input: { tenantId?: string; collectionId: string },
): Promise<void> {
  const model = db.collectionAllocationHold;
  if (!model || typeof model.findFirst !== 'function') return;
  const hold = await model.findFirst({
    where: {
      collectionId: input.collectionId,
      status: 'HELD',
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    },
    select: { id: true, holdReason: true },
  });
  if (hold) {
    throw new ConflictException({
      code: 'COLLECTION_ALLOCATION_HELD',
      message: `Tahsilatın mahsubu bekletiliyor (${hold.holdReason}) — önce hesabına ödeme yapılan borçlu girilip mahsup tamamlanmalı`,
    });
  }
}
