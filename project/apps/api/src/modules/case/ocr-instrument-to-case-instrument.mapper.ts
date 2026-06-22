import { InstrumentType, ClaimItemType, Prisma } from '@prisma/client';
import { CaseInstrumentInputDto, OcrInstrumentInputType } from './dto/case.dto';
import {
  EndorsersJsonShape,
  InstrumentPartyNode,
  ChainProvenance,
} from '../case-instrument/instrument-chain.contract';
import { inferPartyType, isValidVkn, isValidTckn } from '../../common/identity-validation.util';

/**
 * PR-N3 — OCR kambiyo enstrümanı → CaseInstrument / bağlı ClaimItem SAF dönüşümleri.
 *
 * Kanonik tasarım (docs/case-instrument-canonical-design.md):
 *   CaseInstrument = hukuki dayanak evrakı (KANONİK) · ClaimItem = parasal yansıma.
 *   Bağ = ClaimItem.instrumentId (N2 FK). Toplamlar YALNIZ ClaimItem'dan; CaseInstrument.amount
 *   yapısaldır, bakiye toplamına EKLENMEZ (çift-sayım yasağı, Corollary-1).
 *
 * Bu dosya SAF: prisma client TİPLERİ hariç DB/tx bağımlılığı yok. createCase tx wiring
 * N3-wire'da yapılacak; burada yalnız eşleme + create-data kurulumu (izole unit test edilir).
 */

/**
 * D4 — OCR giriş tipini kanonik CaseInstrument türüne çevirir.
 * EXHAUSTIVE (Record): yeni OcrInstrumentInputType eklenirse DERLEME hatası (silent default YASAK).
 * `null` = kambiyo DEĞİL (FATURA/DIGER) → CaseInstrument ÜRETİLMEZ (yalnız Due/ClaimItem yolu).
 * NOT: OCR BONO üretmez (giriş enum'unda yok); BONO yalnız manuel InstrumentForm yoluyla gelir.
 */
const OCR_TO_CASE_INSTRUMENT: Record<OcrInstrumentInputType, InstrumentType | null> = {
  [OcrInstrumentInputType.CEK]: InstrumentType.CEK,
  [OcrInstrumentInputType.SENET]: InstrumentType.SENET,
  [OcrInstrumentInputType.POLICE]: InstrumentType.POLICE,
  [OcrInstrumentInputType.FATURA]: null,
  [OcrInstrumentInputType.DIGER]: null,
};

/**
 * `null` dönerse çağıran CaseInstrument ÜRETMEMELİDİR (kambiyo-dışı kalem).
 *
 * Çağrıldığı yerler:
 * - (N3-wire) CaseService.create() → POST /cases (kambiyo instrument → CaseInstrument), flag-gated.
 */
export function mapOcrInstrumentTypeToCaseInstrumentType(
  type: OcrInstrumentInputType,
): InstrumentType | null {
  if (!(type in OCR_TO_CASE_INSTRUMENT)) {
    // Runtime güvenlik ağı (geçersiz string vb.); derleme zamanı zaten exhaustive.
    throw new Error(
      `Eşlenmemiş OcrInstrumentInputType: "${type}" — eşleme eksik (silent default yasak).`,
    );
  }
  return OCR_TO_CASE_INSTRUMENT[type];
}

/**
 * INVARIANT GUARD (Ulaş): CaseInstrument SESSİZ create YOK. Üretilebilmesi için:
 *   type kambiyo (CEK/SENET/POLICE) · documentNo (→serialNo) · amount (>0) · currency · issueDate.
 * Biri eksikse `null` → çağıran CaseInstrument ÜRETMEZ (kambiyo-dışı/eksik = atla, sessiz create yok).
 * DTO validation da boundary'de reddeder (çift kemer); bu saf guard tx-wiring + unit içindir.
 *
 * Çağrıldığı yerler:
 * - (N3-wire) CaseService.create() → her instrument için: null→atla, değilse buildCaseInstrumentData.
 */
export function resolveCaseInstrumentType(
  input: CaseInstrumentInputDto,
): InstrumentType | null {
  const mapped = mapOcrInstrumentTypeToCaseInstrumentType(input.type);
  if (mapped === null) return null; // FATURA/DIGER → kambiyo değil
  if (!input.documentNo || input.documentNo.trim() === '') return null; // serialNo şart
  if (input.amount == null || input.amount <= 0) return null; // amount şart (>0)
  if (!input.currency) return null; // currency şart (sessiz TRY yok)
  if (!input.issueDate) return null; // issueDate şart (şema-zorunlu)
  return mapped;
}

/**
 * Faz 1 (A1 Kambiyo İlişki Motoru) — OCR girişinden CaseInstrument.endorsers JSON'unu
 * (InstrumentChain {nodes, endorsements}) kurar. Faz 0 kontratı: instrument-chain.contract.ts.
 *
 * KURALLAR (ulas kararı 2026-06-22):
 *  - PAYEE node ATLANIR (payee OCR güvenilmez; #296 park → Faz 3/A1-V1b'ye bırakıldı).
 *  - endorsementNames → ENDORSER nodes; position = null (sıra bilinmiyor; A1-d HOLD).
 *  - endorsements = [] (sıra yokken kenar = sahte güven; A1-d HOLD).
 *  - aval BU FAZDA yok (Faz 3).
 *  - Köken = OCR (aday; otoriter DEĞİL). Ciranta yoksa undefined → endorsers YAZILMAZ (davranış-nötr).
 *
 * Çağrıldığı yerler:
 * - buildCaseInstrumentData() (aynı dosya) → CaseInstrument.endorsers JSON.
 * - ocr-instrument-to-case-instrument.mapper.spec.ts → birim test.
 */
const OCR_NODE_CONFIDENCE = 0.5; // DTO bu katmanda alan-başı güven taşımaz; OCR aday için varsayılan.
const ocrProvenance = (): ChainProvenance => ({ source: 'OCR', confidence: OCR_NODE_CONFIDENCE });

export function buildEndorsersJson(
  input: CaseInstrumentInputDto,
): EndorsersJsonShape | undefined {
  const endorserNames = (input.endorsementNames ?? [])
    .map((n) => (n ?? '').trim())
    .filter((n) => n.length > 0);
  if (endorserNames.length === 0) return undefined; // ciranta yok → endorsers YAZILMAZ (davranış-nötr)

  const nodes: InstrumentPartyNode[] = [];

  // DRAWER (keşideci) = zincir başı (position 0). drawerIdentityNo yalnız checksum-geçerliyse.
  if (input.drawerName && input.drawerName.trim().length > 0) {
    const rawId = (input.drawerIdentityNo ?? '').replace(/\D/g, '');
    const validId = rawId && (isValidVkn(rawId) || isValidTckn(rawId)) ? rawId : undefined;
    nodes.push({
      role: 'DRAWER',
      party: {
        name: input.drawerName.trim(),
        ...(validId ? { identityNo: validId } : {}),
        type: inferPartyType(input.drawerName, validId),
      },
      position: 0,
      provenance: ocrProvenance(),
    });
  }

  // ENDORSER (ciranta) nodes — position null (A1-d HOLD: sıra çıkarılmaz). PAYEE node EKLENMEZ.
  for (const name of endorserNames) {
    nodes.push({
      role: 'ENDORSER',
      party: { name, type: inferPartyType(name, null) },
      position: null,
      provenance: ocrProvenance(),
    });
  }

  return { nodes, endorsements: [] };
}

/**
 * OCR enstrüman girişinden CaseInstrument create-data kurar (tx-aware caller tx.caseInstrument.create'e verir).
 * Tarih eşleme (K2): issueDate→issueDate; CEK→presentmentDate, SENET/BONO/POLICE→maturityDate.
 * Currency KORUNUR (Corollary-2): input.currency ?? 'TRY'.
 * Faz 1: ciranta varsa endorsers JSON (buildEndorsersJson) eklenir; yoksa alan YAZILMAZ (davranış-nötr).
 *
 * @param instrumentType önceden map'lenmiş (non-null) kanonik tür (mapOcr... çıktısı).
 *
 * Çağrıldığı yerler:
 * - (N3-wire) CaseService.create() → POST /cases (createCase tx içinde tx.caseInstrument.create).
 */
export function buildCaseInstrumentData(
  tenantId: string,
  caseId: string,
  input: CaseInstrumentInputDto,
  instrumentType: InstrumentType,
): Prisma.CaseInstrumentUncheckedCreateInput {
  const due = input.dueDate ? new Date(input.dueDate) : null;
  const isCek = instrumentType === InstrumentType.CEK;
  const endorsers = buildEndorsersJson(input); // Faz 1: ciranta varsa InstrumentChain JSON; yoksa undefined
  return {
    tenantId,
    caseId,
    instrumentType,
    serialNo: input.documentNo, // ZORUNLU (resolveCaseInstrumentType + DTO garanti eder; sessiz '' YOK)
    amount: input.amount,
    currency: input.currency, // KORUNUR (Corollary-2; sessiz TRY-default YOK)
    issueDate: new Date(input.issueDate),
    maturityDate: isCek ? null : due,
    presentmentDate: isCek ? due : null,
    bankName: input.bankName ?? null,
    bankBranch: input.branchName ?? null,
    drawerName: input.drawerName ?? null,
    payeeName: input.payeeName ?? null,
    ...(endorsers ? { endorsers: endorsers as unknown as Prisma.InputJsonValue } : {}),
  };
}

/**
 * Enstrümandan türeyen PRINCIPAL ClaimItem create-data (KANONİK BAĞ: instrumentId).
 * Üç-tutar açılışta eşit (buildClaimItemData deseni). Currency KORUNUR (Corollary-2).
 * K1: bir çekin PRINCIPAL'ı YALNIZ buradan üretilir (dues[]'da tekrarlanmaz) → çift-sayım yok.
 *
 * @param instrumentId N2 FK — bu kalemin türediği CaseInstrument.id (tx'te create edilmiş).
 *
 * Çağrıldığı yerler:
 * - (N3-wire) CaseService.create() → POST /cases (createCase tx içinde tx.claimItem.create).
 */
export function buildInstrumentPrincipalClaimItemData(
  tenantId: string,
  caseId: string,
  instrumentId: string,
  input: CaseInstrumentInputDto,
): Prisma.ClaimItemUncheckedCreateInput {
  const amount = input.amount;
  return {
    tenantId,
    caseId,
    itemType: ClaimItemType.PRINCIPAL,
    originalAmount: amount,
    demandedAmount: amount,
    amount,
    currency: input.currency, // KORUNUR (Corollary-2; sessiz TRY-default YOK — genel hardcode AYRI=N3b)
    instrumentId,
    description: `${input.documentNo} numaralı kambiyo (asıl alacak)`,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
  };
}
