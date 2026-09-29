import { createHash } from 'crypto';
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
