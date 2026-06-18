/**
 * PR-2a-1 — Deterministik borç enstrümanı gruplama motoru (AI YOK, saf fonksiyon).
 *
 * ASIL SORU: "N sayfa → kaç fiziksel evrak?" Bu motor cevabı deterministik verir.
 *
 * KRİTİK İLKE: Yanlışlıkla 2 evrak üretmek, review istemekten DAHA KÖTÜ.
 *   → Varsayılan: temkinli gruplama + needsReview. Agresif ayrıştırma DEĞİL.
 *
 * RULE-1 (yüz sinyali güç-kademeli — "amount var" tek başına yeni belge DEĞİL,
 *   çünkü arka yüzde de tutar/ciro/teminat/aval olabilir):
 *     • yeni documentNo            → GÜÇLÜ (yeni belge)
 *     • amount + dueDate           → GÜÇLÜ (yeni belge)
 *     • amount + drawer/debtor      → ORTA  (yeni belge + needsReview)
 *     • yalnız amount               → ZAYIF (yeni belge SAYMA; açık belgeye bağla + review)
 * RULE-2 (tip sınırı kesin bölme DEĞİL, sinyal): TYPE_BOUNDARY yeni belge açabilir
 *   ama düşük/orta groupConfidence + needsReview (OCR çek/senet tipini yanlış sınıflayabilir).
 * SENET: documentNo zayıf → yüz = amount+dueDate(+drawer/debtor); arka/ciro/aval tek
 *   başına yeni senet değil; şüphede yeni kalem yerine needsReview.
 */

import { Instrument, PageCandidate, GroupingMethod } from "./debt-instrument.types";

type FaceSignal =
  | "STRONG_DOCNO"
  | "STRONG_AMOUNT_DUEDATE"
  | "MEDIUM_AMOUNT_PARTY"
  | "WEAK_AMOUNT_ONLY"
  | "NONE";

interface WorkInstrument extends Instrument {
  sourcePages: number[];
}

function appendReason(existing: string | undefined, add: string): string {
  return existing ? `${existing}; ${add}` : add;
}

function hasNewDocNo(page: PageCandidate, current: WorkInstrument | null): boolean {
  return !!page.documentNo && (!current || current.documentNo !== page.documentNo);
}

/**
 * Sayfanın "yüz" sinyal gücünü sınıflar (RULE-1).
 */
function classifyFace(page: PageCandidate, current: WorkInstrument | null): FaceSignal {
  if (hasNewDocNo(page, current)) return "STRONG_DOCNO";
  const hasAmount = page.amount != null;
  if (hasAmount && page.dueDate) return "STRONG_AMOUNT_DUEDATE";
  if (hasAmount && (page.drawerName || (page.debtorCandidates && page.debtorCandidates.length > 0)))
    return "MEDIUM_AMOUNT_PARTY";
  if (hasAmount) return "WEAK_AMOUNT_ONLY";
  return "NONE";
}

function isBackish(page: PageCandidate): boolean {
  return page.back === true || page.endorsementMarkers === true;
}

function buildInstrument(
  page: PageCandidate,
  method: GroupingMethod,
  groupConfidence: number,
  needsReview: boolean,
  reason?: string,
): WorkInstrument {
  return {
    type: page.documentType ?? "DIGER",
    documentNo: page.documentNo,
    amount: page.amount,
    currency: page.currency ?? "TRY",
    issueDate: page.issueDate,
    dueDate: page.dueDate,
    bankName: page.bankName,
    branchName: page.branchName,
    iban: page.iban,
    drawerName: page.drawerName,
    debtorCandidates: page.debtorCandidates,
    confidence: page.confidence ?? 0,
    sourcePages: [page.pageIndex],
    needsReview,
    duplicateCandidateReason: reason,
    groupingMethod: method,
    groupConfidence,
  };
}

/**
 * Açık enstrümana bir sayfa bağlar (yeni enstrüman AÇMAZ). Tamamlayıcı alanları
 * eksikse arka sayfadan doldurur (mevcut değeri EZMEZ).
 */
function attach(
  inst: WorkInstrument,
  page: PageCandidate,
  opts: { lowerConfidence?: boolean; needsReview?: boolean; reason?: string } = {},
): void {
  inst.sourcePages.push(page.pageIndex);
  inst.bankName = inst.bankName ?? page.bankName;
  inst.iban = inst.iban ?? page.iban;
  if (page.drawerName && !inst.drawerName) inst.drawerName = page.drawerName;
  if (opts.lowerConfidence) {
    inst.groupConfidence = Math.min(inst.groupConfidence ?? 1, 0.55);
  }
  if (opts.needsReview) inst.needsReview = true;
  if (opts.reason) inst.duplicateCandidateReason = appendReason(inst.duplicateCandidateReason, opts.reason);
}

/**
 * Sayfa adaylarını fiziksel enstrümanlara gruplar (deterministik).
 * Girdi sırası PDF sayfa sırasıdır. Çıktı: Instrument[] (sourcePages/needsReview/
 * groupingMethod/groupConfidence dolu).
 */
export function groupPageCandidatesIntoInstruments(pages: PageCandidate[]): Instrument[] {
  const out: WorkInstrument[] = [];
  let current: WorkInstrument | null = null;

  for (const page of pages) {
    // Aynı documentNo ardışık → aynı fiziksel belge (ön/arka ya da mükerrer tarama) → MERGE
    if (current && page.documentNo && current.documentNo === page.documentNo) {
      attach(current, page, {
        reason: `sayfa ${page.pageIndex}: documentNo ${page.documentNo} önceki belgeyle aynı (aynı evrak/mükerrer tarama)`,
      });
      current.groupingMethod = "DOCUMENT_NO_MATCH";
      current.groupConfidence = Math.max(current.groupConfidence ?? 0, 0.95);
      continue;
    }

    const sig = classifyFace(page, current);

    switch (sig) {
      case "STRONG_DOCNO":
        current = buildInstrument(page, "DOCUMENT_NO_MATCH", 0.9, false);
        out.push(current);
        break;

      case "STRONG_AMOUNT_DUEDATE": {
        // RULE-2: tip değişimi varsa böl AMA düşük güven + review (OCR yanlış sınıflayabilir)
        if (current && page.documentType && current.type !== page.documentType) {
          current = buildInstrument(
            page,
            "TYPE_BOUNDARY",
            0.6,
            true,
            `sayfa ${page.pageIndex}: tip değişimi (${current.type}→${page.documentType}) — OCR yanlış sınıflamış olabilir, kontrol edin`,
          );
        } else {
          current = buildInstrument(page, "FACE_SIGNAL", 0.8, false);
        }
        out.push(current);
        break;
      }

      case "MEDIUM_AMOUNT_PARTY":
        // amount + taraf ama vade yok → yeni belge AMA review
        current = buildInstrument(
          page,
          "FACE_SIGNAL",
          0.6,
          true,
          `sayfa ${page.pageIndex}: tutar + taraf var ama vade yok — yeni belge olduğundan emin değil`,
        );
        out.push(current);
        break;

      case "WEAK_AMOUNT_ONLY":
        // RULE-1 KRİTİK: yalnız tutar kesin yeni belge DEĞİL (arka/aval/teminat olabilir)
        if (current) {
          attach(current, page, {
            lowerConfidence: true,
            needsReview: true,
            reason: `sayfa ${page.pageIndex}: yalnız tutar — önceki belgenin arkası/aval/teminatı olabilir`,
          });
        } else {
          current = buildInstrument(
            page,
            "WEAK_AMOUNT_ONLY",
            0.4,
            true,
            `sayfa ${page.pageIndex}: yalnız tutar, öncesinde belge yok — belirsiz`,
          );
          out.push(current);
        }
        break;

      case "NONE":
      default:
        // arka/ciro/imza/aval veya boş sayfa
        if (current) {
          if (isBackish(page)) {
            attach(current, page, { lowerConfidence: true });
          } else {
            // işaret yok, içerik belirsiz → bağla ama review (sessizce atma)
            attach(current, page, {
              lowerConfidence: true,
              needsReview: true,
              reason: `sayfa ${page.pageIndex}: içerik belirsiz (yüz/arka kalıbı yok)`,
            });
          }
        } else {
          // baştan arka/boş sayfa, açık belge yok → belirsiz öksüz (sessizce atma)
          current = buildInstrument(
            page,
            "AMBIGUOUS",
            0.3,
            true,
            `sayfa ${page.pageIndex}: yüz bulunamadı (öncesinde belge yok) — belirsiz`,
          );
          out.push(current);
        }
        break;
    }
  }

  // pageRange'i sourcePages'ten türet (from..to)
  for (const inst of out) {
    if (inst.sourcePages && inst.sourcePages.length > 0) {
      inst.pageRange = [Math.min(...inst.sourcePages), Math.max(...inst.sourcePages)];
    }
  }

  return out;
}
