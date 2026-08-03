/**
 * C3-B01 — §13/5 K5.1-K5.2 registry doğrulaması.
 *
 * Ratifiye eşleme (decision-log 2026-08-03, CLIENT-C3 §13/5): dokuz faaliyetin dokuzu da
 * kayıtlı; bent eşlemesi owner kararının BİREBİR aynısı; registry dışı faaliyet fail-closed
 * RED. Bu test eşlemenin sessizce değişmesini (policy drift) engeller — eşleme değişikliği
 * yalnız yeni owner ratifikasyonu + REGISTRY_VERSION artışıyla yapılır.
 */
import {
  CLIENT_PROCESSING_ACTIVITIES,
  CLIENT_PROCESSING_BASIS_REGISTRY_VERSION,
  decideClientProcessingBasis,
  resolveClientProcessingBasis,
} from '../client-processing-basis.registry';

describe('C3-B01 — KVKK işleme dayanağı registry (K5.1-K5.2)', () => {
  it('registry sürümü v1 (2026-08-03 ratifikasyonu)', () => {
    expect(CLIENT_PROCESSING_BASIS_REGISTRY_VERSION).toBe(1);
  });

  it('ratifiye faaliyet envanterinin dokuzu da kayıtlı (K5.1)', () => {
    expect(CLIENT_PROCESSING_ACTIVITIES).toHaveLength(9);
    for (const activity of CLIENT_PROCESSING_ACTIVITIES) {
      expect(resolveClientProcessingBasis(activity)).toBeDefined();
    }
  });

  it.each([
    ['IDENTITY_AND_CONTACT_MANAGEMENT', 'MD_5_2_C', undefined, false],
    ['ENGAGEMENT_AND_RELATIONSHIP', 'MD_5_2_C', undefined, false],
    ['MANDATE_AND_REPRESENTATION', 'MD_5_2_E', 'MD_5_2_CH', false],
    ['LEGAL_PROCEEDINGS_EXECUTION', 'MD_5_2_E', 'MD_5_2_CH', false],
    ['PORTAL_ACCESS', 'MD_5_2_C', undefined, false],
    ['ACCOUNTING_AND_STATUTORY_RECORDS', 'MD_5_2_CH', undefined, false],
    ['SECURITY_AND_AUDIT', 'MD_5_2_F', undefined, false],
    ['UYAP_TRANSFER', 'MD_5_2_E', 'MD_5_2_CH', false],
    ['GREETING_AND_OPTIONAL_COMMUNICATION', 'MD_5_1_ACIK_RIZA', undefined, true],
  ] as const)(
    '%s → %s (K5.2 birebir)',
    (activity, primary, conditional, requiresConsent) => {
      const entry = resolveClientProcessingBasis(activity)!;
      expect(entry.primaryBasis).toBe(primary);
      expect(entry.conditionalAdditionalBasis).toBe(conditional);
      expect(entry.requiresExplicitConsent).toBe(requiresConsent);
    },
  );

  it('registry dışı faaliyet → fail-closed RED (K5.5)', () => {
    const decision = decideClientProcessingBasis('MARKETING_EXPORT_TO_THIRD_PARTY');
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe('NO_LEGAL_BASIS_REGISTERED');
  });

  it('açık rıza faaliyeti registry kararıyla TEK BAŞINA geçemez (opt-in ayrıca şart)', () => {
    const decision = decideClientProcessingBasis('GREETING_AND_OPTIONAL_COMMUNICATION');
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe('EXPLICIT_CONSENT_REQUIRED');
  });
});
