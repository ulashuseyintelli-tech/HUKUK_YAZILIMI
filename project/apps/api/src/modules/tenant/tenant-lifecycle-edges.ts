/**
 * C15-S1-MODIFIED PR-3 — Geçiş kenarlarının PR-3'e özgü bölümlenmesi.
 *
 * PR-1'in `tenant-lifecycle.ts` dosyasına DOKUNULMAZ; tablo orada kanonik kalır.
 * Burada yalnız "PR-3 hangi kenarı sunuyor, hangisini alıkoyuyor" sorusu yanıtlanır.
 *
 * ALIKOYMANIN GEREKÇESİ — açan/kapatan değil, KANIT SINIFI
 * --------------------------------------------------------
 * Bir geçiş, üreticisi henüz var olmayan bir kanıta dayanıyorsa PR-3'te sunulamaz:
 *
 *   PROVISIONING -> ACTIVE     readiness/provisioning kanıtı gerekir. PR-2 yaptırımı
 *                              (isLoginableLifecycle) yürürlükte olduğu için bu geçiş
 *                              tenant'ın mevcut ADMIN principal'ını ANINDA login
 *                              edilebilir yapar. Hazır olduğu hiç kanıtlanmamış bir
 *                              tenant'ı açmak, drain kanıtı olmadan kapatmakla AYNI
 *                              sınıf hatadır.
 *   QUIESCING -> SUSPENDED     drain kanıtı gerekir.
 *   QUIESCING -> RETIRED       drain kanıtı gerekir.
 *
 * Sunulan beş kenarın ortak özelliği: hiçbiri daha önce hiç kanıtlanmamış bir ACTIVE
 * üretmez ve hiçbiri tenant'ı terminal/askı durumuna finalize etmez.
 * `QUIESCING -> ACTIVE` ve `SUSPENDED -> ACTIVE` yeni bir kanıt sınıfı gerektirmez;
 * ikisi de tenant'ın DAHA ÖNCE kanıtlanmış ACTIVE durumuna geri döner.
 *
 * PR-4'ÜN YÜKÜMLÜLÜĞÜ: alıkonan kenarları açmak için bu dosyadaki sabiti DÜZENLEMEK
 * gerekir; bu, bölümleme kapısının hard-coded iddiasını kırar ve değişikliği bilinçli
 * ve gözden geçirilmiş olmaya zorlar. Her kenar KENDİ kanıt sınıfına bağlı AYRI bir
 * metotla açılmalıdır; genel `transition` metodu bu kenarları kabul etmeye ASLA
 * açılmamalıdır.
 */

import {
  TENANT_LIFECYCLE_STATES,
  TenantLifecycleState,
  allowedTransitionsFrom,
} from "./tenant-lifecycle";

/** Yönlü bir yaşam döngüsü kenarı: [from, to]. */
export type LifecycleEdge = readonly [TenantLifecycleState, TenantLifecycleState];

/** Kenar kimliği — küme karşılaştırmaları için kararlı dize. */
export function lifecycleEdgeKey(from: TenantLifecycleState, to: TenantLifecycleState): string {
  return `${from}->${to}`;
}

/**
 * PR-3'te KOŞULSUZ alıkonan kenarlar. TAM ÜÇ tanedir.
 * `quiesceToken`'ın dolu, boş veya uydurulmuş olması bu listeyi ETKİLEMEZ.
 */
export const WITHHELD_SAFETY_CRITICAL_EDGES: readonly LifecycleEdge[] = Object.freeze([
  Object.freeze(["PROVISIONING", "ACTIVE"]) as LifecycleEdge,
  Object.freeze(["QUIESCING", "SUSPENDED"]) as LifecycleEdge,
  Object.freeze(["QUIESCING", "RETIRED"]) as LifecycleEdge,
]);

/** PR-3'ün sunduğu kenarlar. TAM BEŞ tanedir. */
export const PR3_EXPOSED_EDGES: readonly LifecycleEdge[] = Object.freeze([
  Object.freeze(["PROVISIONING", "QUIESCING"]) as LifecycleEdge,
  Object.freeze(["ACTIVE", "QUIESCING"]) as LifecycleEdge,
  Object.freeze(["QUIESCING", "ACTIVE"]) as LifecycleEdge,
  Object.freeze(["SUSPENDED", "ACTIVE"]) as LifecycleEdge,
  Object.freeze(["SUSPENDED", "QUIESCING"]) as LifecycleEdge,
]);

const WITHHELD_KEYS: ReadonlySet<string> = new Set(
  WITHHELD_SAFETY_CRITICAL_EDGES.map(([from, to]) => lifecycleEdgeKey(from, to)),
);

const EXPOSED_KEYS: ReadonlySet<string> = new Set(
  PR3_EXPOSED_EDGES.map(([from, to]) => lifecycleEdgeKey(from, to)),
);

/** Kenar PR-3'te koşulsuz alıkonuyor mu? */
export function isWithheldSafetyCriticalEdge(
  from: TenantLifecycleState,
  to: TenantLifecycleState,
): boolean {
  return WITHHELD_KEYS.has(lifecycleEdgeKey(from, to));
}

/** Kenar PR-3'te sunuluyor mu? */
export function isPr3ExposedEdge(
  from: TenantLifecycleState,
  to: TenantLifecycleState,
): boolean {
  return EXPOSED_KEYS.has(lifecycleEdgeKey(from, to));
}

/**
 * PR-1'in kanonik tablosundan TÜRETİLMİŞ tam kenar kümesi.
 *
 * Bölümleme kapısı bu türetilmiş kümeyle karşılaştırma yapar; hard-coded bir kopyayla
 * DEĞİL. Böylece PR-1'in tablosu değişirse kapı düşer ve bölümleme yeniden gözden
 * geçirilmeye zorlanır.
 */
export function fullLifecycleEdgeSet(): LifecycleEdge[] {
  const edges: LifecycleEdge[] = [];
  for (const from of TENANT_LIFECYCLE_STATES) {
    for (const to of allowedTransitionsFrom(from)) {
      edges.push([from, to] as LifecycleEdge);
    }
  }
  return edges;
}
