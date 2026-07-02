import type { OfficeApprovalStatusValue } from "@/lib/api/office-approval";

// Sayfa + drawer arasında PAYLAŞILAN Türkçe etiket haritası (tek kaynak, tekrar yok).
export const STATUS_LABELS: Record<OfficeApprovalStatusValue, string> = {
  PENDING_APPROVAL: "Onay Bekliyor",
  APPROVED: "Onaylandı",
  APPROVED_WITH_CHANGES: "Değişiklikle Onaylandı",
  REVISION_REQUESTED: "Revizyon İstendi",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal Edildi",
  EXPIRED: "Süresi Doldu",
};

export const STATUS_OPTIONS: { value: OfficeApprovalStatusValue | ""; label: string }[] = [
  { value: "PENDING_APPROVAL", label: "Onay Bekliyor" },
  { value: "APPROVED", label: "Onaylandı" },
  { value: "APPROVED_WITH_CHANGES", label: "Değişiklikle Onaylandı" },
  { value: "REVISION_REQUESTED", label: "Revizyon İstendi" },
  { value: "REJECTED", label: "Reddedildi" },
  { value: "CANCELLED", label: "İptal Edildi" },
  { value: "EXPIRED", label: "Süresi Doldu" },
  { value: "", label: "Tüm Durumlar" },
];
