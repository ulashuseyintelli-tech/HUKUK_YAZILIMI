import { ClaimItemType, InterestType as PrismaInterestType, Prisma } from '@prisma/client';
import { DueType, DueDto } from './dto/case.dto';

/**
 * G1 KÖPRÜSÜ — DueType → ClaimItemType eşlemesi.
 *
 * Kanonik alacak modeli = ClaimItem (legal-kernel B kararı, 2026-06-13).
 * Dosya açılış sihirbazı Due üretmeye devam eder (legacy/transition + nafaka
 * takvimi); bakiye motorunun göreceği KANONİK ClaimItem'lar bu köprüyle üretilir.
 *
 * EXHAUSTIVE eşleme — `Record<DueType, ...>` sayesinde her DueType için açık karar
 * ZORUNLU (silent default YASAK, doc-24 deseni). Yeni bir DueType eklenirse derleme
 * hatası verir. `null` = bu DueType için ClaimItem ÜRETİLMEZ (Due-only takvim kalemi).
 *
 * Hukuki kararlar (tbk100-legal-decisions-ledger, R1/R2):
 *   KOMISYON→EXPENSE · KIRA/AIDAT/PRIM→PRINCIPAL · TAZMINAT→PENALTY · NAFAKA→null.
 */
const DUE_TO_CLAIM_ITEM: Record<DueType, ClaimItemType | null> = {
  [DueType.PRINCIPAL]: ClaimItemType.PRINCIPAL,
  [DueType.INTEREST]: ClaimItemType.INTEREST,
  [DueType.EXPENSE]: ClaimItemType.EXPENSE,
  [DueType.VEKALET_UCRETI]: ClaimItemType.ATTORNEY_FEE,
  [DueType.HARC]: ClaimItemType.FEE,
  [DueType.TAZMINAT]: ClaimItemType.PENALTY,
  [DueType.CEZAI_SART]: ClaimItemType.CONTRACTUAL_PENALTY,
  [DueType.KIRA]: ClaimItemType.PRINCIPAL,
  [DueType.AIDAT]: ClaimItemType.PRINCIPAL,
  [DueType.KOMISYON]: ClaimItemType.EXPENSE,
  [DueType.PRIM]: ClaimItemType.PRINCIPAL,
  [DueType.OTHER]: ClaimItemType.OTHER,
  // NAFAKA: alacak muhasebesi otoritesi değil → yalnız Due (taksit takvimi) kalır.
  [DueType.NAFAKA]: null,
};

/**
 * DueType'ı kanonik ClaimItemType'a çevirir.
 * `null` dönerse çağıran ClaimItem ÜRETMEMELİDİR (Due-only takvim kalemi).
 *
 * Çağrıldığı yerler:
 * - CaseService.createClaimItemsFromDues() → POST /cases (dosya açılışı, dues→ClaimItem)
 * - CaseService.createDue() → POST /cases/:id/dues (dosya açıldıktan sonra Due→ClaimItem sync)
 * - CaseService.syncMarkedClaimItemFromDue() → PATCH /cases/:id/dues/:dueId (marker'lı ClaimItem sync)
 * - planBackfillForCase() → scripts/backfill-due-to-claimitem.ts (eski Due kayıtları için plan)
 */
export function mapDueTypeToClaimItemType(dueType: DueType): ClaimItemType | null {
  if (!(dueType in DUE_TO_CLAIM_ITEM)) {
    // Runtime güvenlik ağı (geçersiz string vb.); derleme zamanı zaten exhaustive.
    throw new Error(
      `Eşlenmemiş DueType: "${dueType}" — DueType→ClaimItemType eşlemesi eksik (silent default yasak).`,
    );
  }
  return DUE_TO_CLAIM_ITEM[dueType];
}

function toPrismaInterestType(value?: string | null): PrismaInterestType | undefined {
  return value ? (value as PrismaInterestType) : undefined;
}

function toDate(value?: string | Date | null): Date | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value : new Date(value);
}

function buildDueInterestMetadata(interestAmount?: number | null): Prisma.InputJsonObject | undefined {
  if (interestAmount === undefined || interestAmount === null) return undefined;
  return {
    dueInterest: {
      interestAmount,
    },
  };
}

/**
 * DueDto'dan ClaimItem create verisi kurar (G1 köprüsü).
 * Üç-tutar sistemi açılışta eşitlenir: originalAmount = demandedAmount = amount = due.amount.
 * tenantId ZORUNLU (multitenant; Due'da tenantId yok, ClaimItem tenant-scoped).
 *
 * Çağrıldığı yerler:
 * - CaseService.createClaimItemsFromDues() → POST /cases (dosya açılışı, dues→ClaimItem)
 * - CaseService.createDue() → POST /cases/:id/dues (dosya açıldıktan sonra Due→ClaimItem sync)
 * - planBackfillForCase() → scripts/backfill-due-to-claimitem.ts (eski Due kayıtları için plan)
 */
export function buildClaimItemData(
  tenantId: string,
  caseId: string,
  due: DueDto,
  itemType: ClaimItemType,
): Prisma.ClaimItemUncheckedCreateInput {
  const amount = due.amount;
  const metadata = buildDueInterestMetadata(due.interestAmount);
  return {
    tenantId,
    caseId,
    itemType,
    originalAmount: amount,
    demandedAmount: amount,
    amount,
    currency: 'TRY',
    description: due.description,
    dueDate: due.dueDate ? new Date(due.dueDate) : null,
    interestType: toPrismaInterestType(due.interestType),
    interestRate: due.interestRate,
    interestStartDate: toDate(due.interestStartDate),
    interestEndDate: toDate(due.interestEndDate),
    ...(metadata ? { metadata } : {}),
  };
}
