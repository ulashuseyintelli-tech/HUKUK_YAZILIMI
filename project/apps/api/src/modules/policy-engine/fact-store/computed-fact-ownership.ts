/**
 * UYAP-LEGACY-POA-FLAG-DEPRECATION-I01 — computed fact SAHİPLİK kaydı.
 *
 * ## Neden var
 *
 * `icrabotCaseFact` / `icrabotCaseFlag` tabloları **serbest anahtarlı** bir key-value
 * deposudur. İki ayrı üretim yolu istemci gövdesinden gelen anahtarlarla bu depoya
 * yazabiliyordu:
 *
 * ```text
 * POST /policy-engine/cases/:caseId/action-executed   body.result.newFacts
 *      → CasePolicyEngine.onActionExecuted → FactStoreService.writeFacts
 *
 * POST /v28-engine/:caseId/flag/:key                  body.value
 * POST /v28-engine/:caseId/fact/:key                  body.value
 * POST /v28-engine/:caseId/facts (bulk)               body.facts / body.flags
 *      → v28 FactStoreService.setFlags / setFacts / batchWrite
 * ```
 *
 * Böylece bir istemci `case.has_power_of_attorney = true` gibi bir **manuel yetki
 * kaydı** oluşturabiliyordu. Bu satır bugün CPE kararını DEĞİŞTİRMEZ — computed
 * provider'lar `computeAll` sırasında base fact'lerin üzerine yazar (I04/I04B) — ancak:
 *
 *  - fact deposunda sahte bir yetki delili bırakır (audit/evidence bütünlüğü),
 *  - `icrabotFactAudit` içinde "yetki verildi" görünümlü bir iz üretir,
 *  - provider bir gün kayıtsız kalırsa (modül yüklenmezse) canlı bir fail-open olur.
 *
 * Owner kuralı (§2/§5): manuel case flag'leri **authority üretemez**, **gate sonucu
 * değiştiremez**, **computed fact'i override edemez** ve **production writer tarafından
 * yazılamaz**.
 *
 * ## Nasıl çalışır
 *
 * Bu modül, sahibi bir computed provider olan fact anahtarlarının kesin listesini
 * tutar ve her iki fact-store'un yazma yolunda **fail-closed** olarak uygulanır.
 * Bu bir allowlist değil, **sahiplik kaydıdır**: bir anahtarın sahibi provider ise,
 * o anahtarı hiçbir üretim yolu elle yazamaz.
 *
 * ## Kapsam sınırı
 *
 * Okuma yolu değişmez. Legacy satırlar SİLİNMEZ (silent data repair yasak, owner §7);
 * yalnız yeni manuel yazım engellenir. Şema kolonu kaldırılmaz.
 */

/**
 * Sahibi computed provider olan fact anahtarları. Elle YAZILAMAZ.
 *
 * | Anahtar | Canonical sahip |
 * |---|---|
 * | `case.has_power_of_attorney` | `UyapAuthorityFactProvider` (I04) — compatibility alias |
 * | `actor.is_canonical_lawyer` | `UyapAuthorityFactProvider` (I04) |
 * | `actor.has_matching_power_of_attorney` | `UyapAuthorityFactProvider` (I04) |
 * | `poa.is_effective_at_evaluation_time` | `UyapAuthorityFactProvider` (I04) |
 * | `poa.covers_requested_operation` | `UyapAuthorityFactProvider` (I04) |
 * | `authority.is_unambiguous` | `UyapAuthorityFactProvider` (I04) |
 * | `authority.failure_code` | `UyapAuthorityFactProvider` (I04) — evidence |
 * | `case.has_unpaid_blocking_expense` | `UyapExpenseBlockingFactProvider` (I04B) |
 * | `system.uyap_available` | `SystemUyapAvailableProvider` |
 * | `system.uyap_availability_explicit` | `SystemUyapAvailableProvider` (PREFLIGHT-R02) |
 */
export const COMPUTED_OWNED_FACT_KEYS: readonly string[] = Object.freeze([
  'case.has_power_of_attorney',
  'actor.is_canonical_lawyer',
  'actor.has_matching_power_of_attorney',
  'poa.is_effective_at_evaluation_time',
  'poa.covers_requested_operation',
  'authority.is_unambiguous',
  'authority.failure_code',
  'case.has_unpaid_blocking_expense',
  'system.uyap_available',
  'system.uyap_availability_explicit',
]);

/**
 * Terk edilmiş legacy anahtarlar: **hiçbir canonical sahibi YOKTUR** ve hiçbir gate/rule
 * tarafından okunmaz. Yeniden yazılmaları yalnız yanıltıcı bir "yetki/blok kaydı"
 * görüntüsü üretir.
 *
 * `case.expense_gate_blocked`: I04B öncesinde `EXPENSE_BLOCKING` gate'inin dolaylı
 * girdisiydi; hiçbir production writer'ı olmadığı için gate yapısal olarak ölüydü.
 * Canonical kaynak artık `ExpenseBlockReason`'dır (owner: bu alan yeniden
 * source-of-truth YAPILMAYACAKTIR).
 */
export const DEPRECATED_LEGACY_FACT_KEYS: readonly string[] = Object.freeze([
  'case.expense_gate_blocked',
]);

/** Elle yazılması yasak anahtarların tamamı. */
const NON_WRITABLE = new Set<string>([
  ...COMPUTED_OWNED_FACT_KEYS,
  ...DEPRECATED_LEGACY_FACT_KEYS,
]);

/** Fail-closed yazma reddi. Dış yanıtta anahtar adı taşınır (PII değildir). */
export class ManualComputedFactWriteError extends Error {
  readonly code = 'MANUAL_COMPUTED_FACT_WRITE_FORBIDDEN';
  readonly factKey: string;

  constructor(factKey: string) {
    super(
      `MANUAL_COMPUTED_FACT_WRITE_FORBIDDEN: "${factKey}" bir computed fact'tir; ` +
        'elle yazılamaz. Canonical kaynak provider zinciridir ' +
        '(ActingLawyerResolver → UyapSendAuthorityResolver → UyapAuthorityFactProvider; ' +
        'ExpenseBlockReason → UyapExpenseBlockingFactProvider).',
    );
    this.name = 'ManualComputedFactWriteError';
    this.factKey = factKey;
  }
}

export function isManuallyWritableFactKey(factKey: string): boolean {
  return !NON_WRITABLE.has(factKey);
}

/** Tek anahtar için fail-closed kapı. */
export function assertManuallyWritableFactKey(factKey: string): void {
  if (!isManuallyWritableFactKey(factKey)) {
    throw new ManualComputedFactWriteError(factKey);
  }
}

/**
 * Toplu yazımlar için kapı. **Tümü ya da hiçbiri**: bir anahtar bile yasaksa hiçbir
 * yazım yapılmaz (kısmi yazım sessiz bir bypass olurdu).
 */
export function assertManuallyWritableFactKeys(factKeys: Iterable<string>): void {
  for (const key of factKeys) {
    assertManuallyWritableFactKey(key);
  }
}
