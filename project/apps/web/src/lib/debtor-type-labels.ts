/**
 * Borçlu kişi türünün müvekkil portalında gösterilen adı — sunucu `DebtorType` enum'u (INDIVIDUAL / COMPANY /
 * PUBLIC_INSTITUTION / ESTATE). `PERSON` eski istemci sözleşmesi uyumu için gerçek kişi sayılır.
 * Tanınmayan ya da boş değer kişi türü UYDURMAZ: boş döner (F02 kabul UB-9 — önceki gösterim `PERSON` dışındaki her
 * değeri, gerçek kişi `INDIVIDUAL` dahil, "Kurum" yazıyordu).
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - app/portal/cases/[id]/page.tsx (müvekkil portalı borçlular)
 * </remarks>
 */
const DEBTOR_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Şahıs",
  PERSON: "Şahıs",
  COMPANY: "Kurum",
  PUBLIC_INSTITUTION: "Kamu Kurumu",
  ESTATE: "Tereke",
};

export function debtorTypeLabel(type: string | null | undefined): string {
  if (!type) return "";
  return DEBTOR_TYPE_LABELS[type] ?? "";
}
