/**
 * Dosya kalemi (Due) türünün kullanıcıya gösterilen adı — sunucu `DueType` enum'unun tamamı.
 * Tanınmayan değer ham haliyle döner (bilgi gizlenmez; yeni enum değeri burada eklenmelidir).
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - office-approval/summary/case-due-change.projector.ts (Onay Kutusu kalem talebi özeti)
 * - app/portal/cases/[id]/page.tsx (müvekkil portalı alacak kalemleri; F02 kabul UB-9)
 * </remarks>
 */
export const DUE_TYPE_LABELS: Record<string, string> = {
  PRINCIPAL: "Ana Para (Asıl Alacak)",
  INTEREST: "Faiz",
  EXPENSE: "Masraf",
  VEKALET_UCRETI: "Vekalet Ücreti",
  HARC: "Harç",
  TAZMINAT: "Tazminat",
  CEZAI_SART: "Cezai Şart",
  NAFAKA: "Nafaka",
  KIRA: "Kira Alacağı",
  AIDAT: "Aidat",
  KOMISYON: "Komisyon",
  PRIM: "Prim/İkramiye",
  YARGILAMA_GIDERI: "Yargılama Gideri",
  OTHER: "Diğer",
};

export function dueTypeLabel(type: string | null | undefined): string {
  if (!type) return "";
  return DUE_TYPE_LABELS[type] ?? type;
}
