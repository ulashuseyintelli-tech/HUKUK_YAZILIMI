/**
 * Sorumlu-avukat invariant'ının SAF karar fonksiyonları (B5/D + ASSIGN-4b).
 *
 * Bu fonksiyonlar ASSIGN-4b'de `case.service.ts` içinde tanımlıydı; tek-seferlik drift
 * onarım scripti (`fix-case-lawyer-responsible-drift.ts`, tsx ile NestJS-dışı çalışır)
 * bunları REUSE edebilsin diye buraya taşındı. `case.service.ts` `@/` path-alias kullandığı
 * için tsx onu doğrudan import edemez; bu dosya BAĞIMSIZDIR (hiç import yok) → hem servis
 * hem script aynı kararı paylaşır (tek-kaynak, kod tekrarı yok).
 *
 * `case.service.ts` bunları geriye-uyum için RE-EXPORT eder; mevcut import'lar
 * (ör. `case-responsible-lawyer-invariant.spec.ts`, `from '../case.service'`) bozulmaz.
 */

/**
 * B5/D — sorumsuz (zero-responsible) case'te fallback sorumlu avukat seçimi.
 * Öncelik: PARTNER > MANAGER > AUTHORIZED > LAWYER > INTERN > rank'siz.
 * Eşit öncelikte İLK kayıt seçilir (strict `<` ile korunur). Aday yoksa -1.
 *
 * Saf fonksiyon (yan-etkisiz, izole test edilebilir). Yalnız createCase'in
 * "≥1 sorumlu" invariant'ı, hiç RESPONSIBLE yokken çağırır.
 *
 * @remarks Çağrıldığı yerler:
 * - CaseService.create() → POST /cases (Yeni Takip sihirbazı: sorumlu seçilmeden açılırsa fallback)
 * - planResponsible() / resolveResponsiblePromotion() (bu dosya) → öncelik motoru
 * - case-responsible-drift.core.planCaseDriftFix() → tek-seferlik drift onarımı
 */
export function pickResponsibleFallbackIndex(ranks: (string | null)[]): number {
  const priority: Record<string, number> = {
    PARTNER: 0,
    MANAGER: 1,
    AUTHORIZED: 2,
    LAWYER: 3,
    INTERN: 4,
  };
  const RANKLESS = 5; // rank'siz → en düşük öncelik (INTERN'den sonra)
  let bestIdx = -1;
  let bestPri = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ranks.length; i++) {
    const r = ranks[i];
    const pri = r != null && priority[r] !== undefined ? priority[r] : RANKLESS;
    if (pri < bestPri) {
      // strict `<` → eşit öncelikte İLK kayıt korunur
      bestPri = pri;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * B5/D — "≥1 sorumlu avukat" invariant kararı (saf). Verilen CaseLawyer listesinde
 * yükseltilecek satırın id'sini döndürür, yoksa null.
 *
 * Kurallar:
 * - Liste boşsa → null (hiç avukat yok → no-op).
 * - Zaten bir RESPONSIBLE varsa → null (explicit seçim / PARTNER-MANAGER KORUNUR; ezme/demote YOK).
 * - Hiç sorumlu yoksa → {@link pickResponsibleFallbackIndex} önceliğiyle BİR satır seç.
 *
 * @remarks Çağrıldığı yerler:
 * - CaseService.removeCaseLawyer() → DELETE /cases/:id/lawyers/:caseLawyerId
 *   (sorumlu silinince kalanlar arasından fallback promote; ASSIGN-4b)
 */
export function resolveResponsiblePromotion(
  created: { id: string; lawyerRank: string | null; isResponsible: boolean }[],
): string | null {
  if (created.length === 0) return null;
  if (created.some((cl) => cl.isResponsible)) return null; // sorumlu zaten var → dokunma
  const idx = pickResponsibleFallbackIndex(created.map((cl) => cl.lawyerRank));
  return idx >= 0 ? created[idx].id : null;
}

/**
 * ASSIGN-4b — "her dosyada TAM OLARAK 1 sorumlu avukat" invariant'ı (saf karar).
 *
 * Verilen caseLawyer listesinde sorumlu kalacak/olacak BİR satırı (keepId) ve
 * sorumluluğu düşürülecek diğer satırları (demoteIds) hesaplar. Avukat yoksa keepId=null.
 *
 * @param lawyers Dosyanın caseLawyer'ları ({id, lawyerRank, isResponsible}).
 * @param preferId Explicit sorumlu hedefi (update/add). Listede varsa keepId=preferId
 *   (kullanıcının açık seçimi korunur). null ise: önce mevcut sorumlular, yoksa tüm
 *   liste arasından {@link pickResponsibleFallbackIndex} önceliğiyle BİR tane seçilir
 *   (create dedupe). demoteIds = keepId DIŞINDA şu an sorumlu olan tüm satırlar
 *   (çağıran bunları isResponsible=false + role=ASSIGNED yapar).
 *
 * @remarks Çağrıldığı yerler:
 * - CaseService.create() → POST /cases (loop sonrası dedupe → tam 1; preferId=null, rank önceliği)
 * - case-responsible-drift.core.planCaseDriftFix() → tek-seferlik drift onarımı (preferId=null,
 *   create dedupe ile BİREBİR aynı karar)
 * Not: updateCaseLawyer/addCaseLawyer aynı "tam 1" kararını inline uygular (hedef sorumlu
 * yapılırken `responsibleIds.filter(!=hedef)` ile diğer sorumluları demote eder).
 */
export function planResponsible(
  lawyers: { id: string; lawyerRank: string | null; isResponsible: boolean }[],
  preferId: string | null,
): { keepId: string | null; demoteIds: string[] } {
  if (lawyers.length === 0) return { keepId: null, demoteIds: [] };
  let keepId: string | null = null;
  if (preferId && lawyers.some((l) => l.id === preferId)) {
    keepId = preferId; // kullanıcının açık seçimi
  } else {
    const responsibles = lawyers.filter((l) => l.isResponsible);
    const pool = responsibles.length > 0 ? responsibles : lawyers;
    const idx = pickResponsibleFallbackIndex(pool.map((l) => l.lawyerRank));
    keepId = idx >= 0 ? pool[idx].id : null;
  }
  const demoteIds = lawyers
    .filter((l) => l.id !== keepId && l.isResponsible)
    .map((l) => l.id);
  return { keepId, demoteIds };
}
