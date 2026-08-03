/**
 * C3-B03 — POL-E 8-KOŞULLU FAIL-CLOSED VERİ YAŞAM DÖNGÜSÜ KAPISI (saf karar katmanı).
 *
 * Kaynak: CLIENT-P1-POL-E-GOV (decision-log, OPTION A baseline) + §13/8 K8 ratifikasyonu
 * (2026-08-03). Sekiz koşulun HER BİRİ açıkça CONFIRMED olmadan silme/anonimleştirme
 * DEĞERLENDİRMESİ geçemez; biri belirsizse sonuç DO_NOT_DELETE ve sınıflandırma
 * OWNER/LEGAL/CROSS-DOMAIN DECISION REQUIRED'dır.
 *
 * RATİFİYE SINIR (K8.1/K8.5): sabit saklama süresi ve silme yöntemi SEÇİLMEDİ. Bu yüzden
 * bu kapı bugün hiçbir koşulda EXECUTE kararı ÜRETEMEZ: sekiz koşul birden CONFIRMED olsa
 * bile sonuç ALL_CONDITIONS_MET_AWAITING_OWNER_METHOD_DECISION'dır ve fiilî silme
 * yürütücüsü bu modülde YOKTUR. BUSINESS LIFECYCLE ≠ DATA LIFECYCLE: iş olayı silme
 * tetiklemez (K8.2); scheduler YOKTUR (K8.3).
 */

/** POL-E sekiz koşulu (decision-log OPTION A kaydındaki sırayla). */
export const CLIENT_LIFECYCLE_GATE_CONDITIONS = [
  'RECORD_FAMILY_OWNER_CONFIRMED', // 1. record-family owner belli ve onaylı
  'BUSINESS_TERMINAL_EVENT_CONFIRMED', // 2. iş terminal olayı gerçekleşti (tek başına yetmez)
  'RETENTION_LEGAL_BASIS_CONFIRMED', // 3. saklama/hukuki dayanak değerlendirmesi tamam
  'EVIDENCE_DEPENDENCY_CLEARED', // 4. delil bağımlılığı yok
  'CROSS_DOMAIN_DEPENDENCY_CLEARED', // 5. cross-domain bağımlılık yok
  'NO_ACTIVE_LEGAL_HOLD', // 6. aktif hold yok (DB'den otomatik doğrulanır)
  'REFERENCE_INTEGRITY_ASSESSED', // 7. referans bütünlüğü etkisi değerlendirildi
  'AUTHORIZED_DELETION_METHOD_SELECTED', // 8. yetkili silme yöntemi seçili (K8.5: BUGÜN SEÇİLİ DEĞİL)
] as const;

export type ClientLifecycleGateCondition = (typeof CLIENT_LIFECYCLE_GATE_CONDITIONS)[number];

export type ClientLifecycleConditionState = 'CONFIRMED' | 'NOT_CONFIRMED' | 'UNKNOWN';

export type ClientLifecycleAssessment = Partial<
  Record<ClientLifecycleGateCondition, ClientLifecycleConditionState>
>;

export interface ClientLifecycleGateDecision {
  /** Fiilî silme/anonimleştirme İZNİ — bu sürümde HER ZAMAN false (yürütücü yok). */
  executionAllowed: false;
  result:
    | 'DO_NOT_DELETE'
    | 'ALL_CONDITIONS_MET_AWAITING_OWNER_METHOD_DECISION';
  classification?: 'OWNER_LEGAL_CROSS_DOMAIN_DECISION_REQUIRED';
  /** CONFIRMED olmayan koşullar (fail-closed gerekçesi — ad listesi, değer yok). */
  unmetConditions: ClientLifecycleGateCondition[];
}

/**
 * FAIL-CLOSED değerlendirme: eksik/UNKNOWN/NOT_CONFIRMED her koşul kapıyı kapatır.
 * Girdi bir İDDİA setidir; koşul 6 çağıran tarafından DB'den doldurulmak ZORUNDADIR
 * (ClientLegalHoldService.evaluateDeletionRequest bunu yapar).
 */
export function decideClientDataLifecycleGate(
  assessment: ClientLifecycleAssessment | null | undefined,
): ClientLifecycleGateDecision {
  const unmet = CLIENT_LIFECYCLE_GATE_CONDITIONS.filter(
    (c) => (assessment?.[c] ?? 'UNKNOWN') !== 'CONFIRMED',
  );
  if (unmet.length > 0) {
    return {
      executionAllowed: false,
      result: 'DO_NOT_DELETE',
      classification: 'OWNER_LEGAL_CROSS_DOMAIN_DECISION_REQUIRED',
      unmetConditions: unmet,
    };
  }
  // Sekiz koşul birden CONFIRMED: K8.5 gereği yine YÜRÜTME YOK — yöntem kararı owner'da.
  return {
    executionAllowed: false,
    result: 'ALL_CONDITIONS_MET_AWAITING_OWNER_METHOD_DECISION',
    unmetConditions: [],
  };
}
