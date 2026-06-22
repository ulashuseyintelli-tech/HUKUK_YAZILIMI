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
 * PR-2c — İLAM esas/karar numaralarını insan-okur tek referansa birleştirir.
 * "2024/123 E. / 2025/45 K." (yalnız biri varsa o kısım). Hepsi boşsa undefined.
 * Yapısal esas/karar AYRICA metadata.ilam'da tutulur (kayıp yok, sorgulanabilir).
 */
function composeIlamReference(esasNo?: string | null, kararNo?: string | null): string | undefined {
  const parts: string[] = [];
  if (esasNo) parts.push(`${esasNo} E.`);
  if (kararNo) parts.push(`${kararNo} K.`);
  return parts.length > 0 ? parts.join(' / ') : undefined;
}

/**
 * PR-2c — İLAM belge alanlarını metadata.ilam nesnesine toplar (yalnız dolu alanlar; hepsi boşsa undefined).
 */
function buildIlamMetadata(due: DueDto): Record<string, unknown> | undefined {
  const ilam: Record<string, unknown> = {};
  if (due.ilamMahkeme) ilam.mahkemeAdi = due.ilamMahkeme;
  if (due.ilamEsasNo) ilam.esasNo = due.ilamEsasNo;
  if (due.ilamKararNo) ilam.kararNo = due.ilamKararNo;
  if (due.davaTarihi) ilam.davaTarihi = due.davaTarihi;
  return Object.keys(ilam).length > 0 ? ilam : undefined;
}

/**
 * PR-2c — KİRA dönem alanlarını metadata.kira nesnesine toplar (yalnız dolu alanlar; hepsi boşsa undefined).
 * (Aynı tutarlı Ocak/Şubat/Mart kiraları açıklamayla değil dönemle ayrışır.)
 */
function buildKiraMetadata(due: DueDto): Record<string, unknown> | undefined {
  const kira: Record<string, unknown> = {};
  if (due.kiraDonemBaslangic) kira.donemBaslangic = due.kiraDonemBaslangic;
  if (due.kiraDonemBitis) kira.donemBitis = due.kiraDonemBitis;
  return Object.keys(kira).length > 0 ? kira : undefined;
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
  // FATURA (G2a) — KDV gömülü bilgi → metadata.kdv (ClaimItem'da hasKdv alanı YOK; O-1=A). Faiz
  // metadata'sı (dueInterest) ile BİRLEŞİR. PRINCIPAL=amount=KDV-dahil genel toplam (O-2=A; ayrı TAX_KDV YOK).
  const metadata: Record<string, unknown> = {};
  const interestMeta = buildDueInterestMetadata(due.interestAmount);
  if (interestMeta) Object.assign(metadata, interestMeta);
  if (due.hasKdv) {
    const kdv: Record<string, unknown> = { hasKdv: true };
    if (due.kdvRate != null) kdv.kdvRate = due.kdvRate;
    if (due.kdvAmount != null) kdv.kdvAmount = due.kdvAmount;
    metadata.kdv = kdv;
  }
  // PR-2c — İLAM yapısal alanları + KİRA dönemi → metadata (mevcut kdv/dueInterest ile BİRLEŞİR).
  const ilam = buildIlamMetadata(due);
  if (ilam) metadata.ilam = ilam;
  const kira = buildKiraMetadata(due);
  if (kira) metadata.kira = kira;
  const hasMetadata = Object.keys(metadata).length > 0;
  // PR-2c — referenceNo: İLAM ise "esasNo E. / kararNo K." birleşik; değilse belge no (FATURA faturaNo vb.).
  const referenceNo = composeIlamReference(due.ilamEsasNo, due.ilamKararNo) ?? due.sourceDocumentNo;
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
    // FATURA/İLAM (PR-2c): belge düzenleme tarihi → issueDate (fatura tarihi / ilam tarihi).
    ...(due.issueDate ? { issueDate: toDate(due.issueDate) } : {}),
    interestType: toPrismaInterestType(due.interestType),
    interestRate: due.interestRate,
    interestStartDate: toDate(due.interestStartDate),
    interestEndDate: toDate(due.interestEndDate),
    // FATURA (G2a) + İLAM (PR-2c): belge referansı → ClaimItem.referenceNo (faturaNo / "esasNo E. / kararNo K.").
    ...(referenceNo ? { referenceNo } : {}),
    ...(due.sourceDocumentType ? { sourceDocumentType: due.sourceDocumentType } : {}),
    ...(hasMetadata ? { metadata: metadata as Prisma.InputJsonObject } : {}),
  };
}
