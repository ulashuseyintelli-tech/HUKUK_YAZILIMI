// COLLECTION_DISPOSITION_POST savedIntent -> insan-okur özet.
// Kaynak şekil (doğrulandı): finance-approval-intent.builder.ts (buildCollectionDispositionPostIntent).
// FE HESAPLAMAZ: totalAmount/line.amount Decimal-as-string; formatAmountWithCurrency SAF STRING işlemi
// (Number() round-trip YOK). Eksik alan tahmin edilmez — yoksa o alan atlanır.
//
// Maskeleme: BİRİNCİL KAYNAK ctx.financeVisibility.level (office-approval-detail.presenter.ts'in
// ürettiği, sunucu tarafında otoriter sinyal). `level==='MASKED'` ise satır detayı KESİN gizlenir.
// ctx.financeVisibility context'te YOKSA (ör. eski çağrı yeri) YALNIZ o zaman payload ŞEKLİNE
// (`lines` yok + `lineCount` var) düşülür — bu FALLBACK'tir, birincil sinyal DEĞİL.
import type { ApprovalSummaryField, ApprovalSummaryProjector, ApprovalSummaryResult } from "./types";
import { UNSAFE_SUMMARY_REASON } from "./types";
import { isRecord } from "./guards";
import { lineTypeLabel } from "./line-type-labels";
import { formatAmountWithCurrency } from "./format";

function riskDecisionTone(decision: string): "default" | "warning" | "danger" {
  if (decision === "BLOCK") return "danger";
  if (decision === "MANUAL_REVIEW" || decision === "REQUIRE_APPROVAL") return "warning";
  return "default"; // ALLOW_DIRECT veya bilinmeyen
}

function severityTone(severity: string): "default" | "warning" | "danger" {
  if (severity === "BLOCKER" || severity === "HIGH") return "danger";
  if (severity === "WARNING") return "warning";
  return "default"; // INFO veya bilinmeyen
}

const unsafe = (): ApprovalSummaryResult => ({ kind: "unsafe", fields: [], reason: UNSAFE_SUMMARY_REASON });

export const projectCollectionDispositionPost: ApprovalSummaryProjector = (savedIntent, ctx) => {
  if (!isRecord(savedIntent)) return unsafe();

  const { totalAmount, currency } = savedIntent;
  if (typeof totalAmount !== "string" || typeof currency !== "string") return unsafe();

  const fields: ApprovalSummaryField[] = [];

  if (typeof savedIntent.caseId === "string") {
    fields.push({ label: "Dosya", value: savedIntent.caseId });
  }
  if (typeof savedIntent.collectionId === "string") {
    fields.push({ label: "Tahsilat", value: savedIntent.collectionId });
  }
  fields.push({ label: "Toplam Tutar", value: formatAmountWithCurrency(totalAmount, currency) });

  const { lines, lineCount } = savedIntent;
  const visibilityLevel = ctx?.financeVisibility?.level;
  // Birincil sinyal: backend'in bildirdiği görünürlük seviyesi. Yalnız context'te level YOKSA
  // (fallback) payload şekline (lines yok + lineCount var) bakılır.
  const hideLineDetail =
    visibilityLevel !== undefined
      ? visibilityLevel === "MASKED"
      : !Array.isArray(lines) && typeof lineCount === "number";

  if (hideLineDetail) {
    const count = typeof lineCount === "number" ? lineCount : Array.isArray(lines) ? lines.length : undefined;
    if (typeof count === "number") {
      fields.push({ label: "Kalem Sayısı", value: `${count} (detay gizli)` });
    }
  } else if (Array.isArray(lines)) {
    fields.push({ label: "Kalem Sayısı", value: String(lines.length) });
    for (const line of lines) {
      if (!isRecord(line)) continue;
      const type = typeof line.type === "string" ? lineTypeLabel(line.type) : "Kalem";
      const amountValue = typeof line.amount === "string" ? formatAmountWithCurrency(line.amount, currency) : "—";
      const caseClientSuffix = typeof line.caseClientId === "string" ? ` (alacaklı: ${line.caseClientId})` : "";
      fields.push({ label: type, value: `${amountValue}${caseClientSuffix}` });
    }
  } else if (typeof lineCount === "number") {
    // Sinyal "maskeli değil" diyor ama satır dizisi yok (şekil tutarsızlığı) — best-effort, gizli-etiketi YOK.
    fields.push({ label: "Kalem Sayısı", value: String(lineCount) });
  }

  const risk = savedIntent.risk;
  if (isRecord(risk)) {
    if (typeof risk.decision === "string") {
      fields.push({ label: "Risk", value: risk.decision, tone: riskDecisionTone(risk.decision) });
    }
    if (Array.isArray(risk.reasons)) {
      for (const reasonEntry of risk.reasons) {
        if (!isRecord(reasonEntry) || typeof reasonEntry.publicMessage !== "string") continue;
        fields.push({
          label: "Gerekçe",
          value: reasonEntry.publicMessage,
          tone: typeof reasonEntry.severity === "string" ? severityTone(reasonEntry.severity) : "default",
        });
      }
    }
  }

  return { kind: "summary", fields };
};
