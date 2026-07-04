// Approval Inbox — savedIntent/replacementSavedIntent özet katmanı, ortak tipler.
// İlke: projector'lar yalnız payload'da VAR OLAN alanları çıkarır; eksik alan tahmin edilmez.
import type { OfficeApprovalDetail } from "@/lib/api/office-approval";

export interface ApprovalSummaryField {
  label: string;
  value: string;
  tone?: "default" | "warning" | "danger";
}

export interface ApprovalSummaryResult {
  kind: "summary" | "unsafe";
  /** kind="summary" ise dolu; "unsafe" ise boş dizi. */
  fields: ApprovalSummaryField[];
  /** kind="unsafe" ise kullanıcıya gösterilecek gerekçe. */
  reason?: string;
  /**
   * "Onaylanırsa ne değişir?" — actionCode behavior catalog'dan (sabit domain bilgisi).
   * Projector'lar bunu KENDİLERİ doldurmaz; registry, action-behavior-catalog.ts'ten ekler.
   */
  impactNotes?: string[];
}

export interface ApprovalSummaryContext {
  financeVisibility?: OfficeApprovalDetail["financeVisibility"];
}

export type ApprovalSummaryProjector = (
  savedIntent: unknown,
  ctx: ApprovalSummaryContext,
) => ApprovalSummaryResult;

export const UNSAFE_SUMMARY_REASON =
  "Bu işlem türü için güvenli özet üretilemiyor; ham veriyi inceleyin.";
