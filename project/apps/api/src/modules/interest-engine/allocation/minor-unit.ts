/**
 * TBK100 minor-unit (kuruş / bigint cents) helper — doc 18 (Yaklaşım B) + doc 25 (legal sign-off).
 *
 * AMAÇ: TBK100 para hesaplarında float-dust ve sub-cent belirsizliğini ortadan kaldırmak.
 *   İç temsil = `bigint` cents (kuruş). Sınırda number ↔ cents çevrimi.
 *
 * POLİTİKA (doc 25 — hukuken onaylı):
 *   - TRY, kuruş = 2 ondalık; sistem sınırında normalize.
 *   - Yuvarlama: HALF_UP, away-from-zero  (0.005→1, 0.004→0, -0.005→-1).
 *
 * TASARIM SINIRLARI (doc 18 §2/§6):
 *   - Money VO YOK · currency YOK · ortak/global money helper YOK → allocator-local.
 *   - interest-formula `roundMoney` exact-decimal-scale tekniği REFERANS alındı (DRY değil; bağımsız).
 *
 * FLOAT-SCALE TUZAĞI (neden Number(`${v}e2`)):
 *   Naif `value * 100` float'ta kayar: 1550.025 * 100 = 155002.49999999999 → yanlışlıkla 155002.
 *   `Number(`${value}e2`)` değeri ondalık ölçekte exact yeniden-parse eder: "1550.025e2" → 155002.5 → 155003.
 *
 * Çağrıldığı yerler:
 * - (henüz yok) PR-B'de `tbk100-allocator.service.ts` internals tarafından kullanılacak (doc 18 §6).
 */

/**
 * number TL değerini kuruş (cents) bigint'e çevirir.
 * HALF_UP away-from-zero, exact decimal-scale.
 */
export function toCents(value: number): bigint {
  // Ondalık ölçekte exact: value × 100 (float×100 tuzağından kaçınır).
  const scaled = Number(`${value}e2`);
  // HALF_UP away-from-zero: pozitifte yukarı, negatifte mutlak değer üzerinden yukarı sonra işaret.
  const rounded = scaled >= 0 ? Math.round(scaled) : -Math.round(-scaled);
  return BigInt(rounded);
}

/**
 * Kuruş (cents) bigint'i number TL değerine çevirir.
 */
export function fromCents(cents: bigint): number {
  return Number(cents) / 100;
}
