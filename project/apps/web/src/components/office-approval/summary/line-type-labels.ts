// CollectionDispositionLineType -> Türkçe etiket. status-labels.ts ile AYNI desen (tek kaynak, tekrar yok).
// FE @prisma/client'a bağımlı olmasın diye anahtar tipi string (backend enum'u ile senkron tutulur).
export const LINE_TYPE_LABELS: Record<string, string> = {
  CLIENT_PAYABLE: "Müvekkile Ödenecek",
  CONTRACTUAL_FEE_WITHHELD: "Kesilen Akdi Ücret",
  FIRM_EXPENSE_REIMBURSEMENT: "Büro Masraf İadesi",
  CLIENT_EXPENSE_REIMBURSEMENT: "Müvekkil Masraf İadesi",
  OFFSET_CLIENT_ADVANCE: "Avans Mahsubu",
  HELD_PENDING_DISTRIBUTION: "Dağıtım Bekliyor",
  OTHER: "Diğer",
};

/** Bilinmeyen tip için ham değeri döner (tahmin/uydurma YOK). */
export function lineTypeLabel(type: string): string {
  return LINE_TYPE_LABELS[type] ?? type;
}
