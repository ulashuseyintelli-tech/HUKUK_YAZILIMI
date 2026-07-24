import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';
import {
  assertLegalBasisEligible,
  type LegalBasisEligibilityExpectedBinding,
  type LegalBasisEligibilityInput,
} from '../formation-intent/claim-item-formation-legal-basis-eligibility';
import { type ExactLegalBasisBindingV1 } from '../formation-intent/claim-item-formation-resolver.ports';

const HASH = (value: string) => stableJsonHash({ value });

function legalBasis(overrides: Partial<ExactLegalBasisBindingV1> = {}): ExactLegalBasisBindingV1 {
  return {
    legalBasisCode: 'CONTRACTUAL_RECEIVABLE',
    legalBasisVersion: '1',
    legalBasisChecksum: HASH('basis'),
    registryReleaseId: 'legal-basis-release-1',
    registryReleaseChecksum: HASH('release'),
    status: 'ACTIVE',
    effectiveFrom: '2020-01-01T00:00:00.000Z',
    effectiveTo: null,
    subtypeRecognized: true,
    componentCategory: 'PRINCIPAL',
    componentSubtypeCode: 'CONTRACT_PRINCIPAL',
    componentSubtypeVersion: '1',
    componentSubtypeChecksum: HASH('subtype'),
    allowedDocumentTypes: ['CONTRACT'],
    requiredEvidenceClasses: ['SIGNED_CONTRACT'],
    liabilityCompatible: true,
    interestEligibility: 'NO_INTEREST',
    interestPolicyRef: null,
    interestPolicyVersion: null,
    ruleRef: null,
    ruleVersion: null,
    legalReviewRequired: false,
    resolutionContractVersion: 'LegalBasisResolutionV1',
    resolutionHash: HASH('resolution'),
    claimItemProjection: {
      itemType: 'PRINCIPAL',
      interestAccrualStatus: 'NO_INTEREST',
      interestType: null,
      interestRate: null,
      interestStartDate: null,
      interestStartDateProvenance: null,
      isAllDebtorsLiable: false,
      liableDebtorIds: ['debtor:opaque-1'],
    },
    ...overrides,
  };
}

function matchingExpectedBinding(
  basis: ExactLegalBasisBindingV1,
): LegalBasisEligibilityExpectedBinding {
  return {
    legalBasisChecksum: basis.legalBasisChecksum,
    registryReleaseId: basis.registryReleaseId,
    registryReleaseChecksum: basis.registryReleaseChecksum,
    componentSubtypeVersion: basis.componentSubtypeVersion,
    componentSubtypeChecksum: basis.componentSubtypeChecksum,
    interestEligibility: basis.interestEligibility,
    interestPolicyRef: basis.interestPolicyRef,
    interestPolicyVersion: basis.interestPolicyVersion,
    ruleRef: basis.ruleRef,
    ruleVersion: basis.ruleVersion,
    resolutionContractVersion: basis.resolutionContractVersion,
    resolutionHash: basis.resolutionHash,
  };
}

function baseInput(
  overrides: Partial<LegalBasisEligibilityInput> = {},
): LegalBasisEligibilityInput {
  return {
    mode: 'ADMISSION',
    legalBasis: legalBasis(),
    requestedIdentity: { legalBasisCode: 'CONTRACTUAL_RECEIVABLE', legalBasisVersion: '1' },
    requestedComponent: { category: 'PRINCIPAL', subtypeCode: 'CONTRACT_PRINCIPAL' },
    documentType: 'CONTRACT',
    evidenceClasses: ['SIGNED_CONTRACT'],
    effectiveAt: '2026-07-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('RCV-CLAIM-FORM-P02-S08-D01B-CONTRACT-PARITY-I01 assertLegalBasisEligible', () => {
  it('accepts a fully valid ACTIVE binding in ADMISSION mode', () => {
    expect(assertLegalBasisEligible(baseInput())).toMatchObject({ ok: true });
  });

  it('accepts a fully valid ACTIVE binding in FINALIZATION mode with a matching expectedBinding', () => {
    const basis = legalBasis();
    const result = assertLegalBasisEligible(
      baseInput({
        mode: 'FINALIZATION',
        legalBasis: basis,
        expectedBinding: matchingExpectedBinding(basis),
      }),
    );
    expect(result).toMatchObject({ ok: true });
  });

  it('rejects when the resolver found nothing', () => {
    const result = assertLegalBasisEligible(baseInput({ legalBasis: null }));
    expect(result).toMatchObject({ ok: false, failure: { code: 'NOT_FOUND' } });
  });

  describe('D1 lifecycle status x mode admissibility matrix', () => {
    it.each([
      ['ACTIVE', 'ADMISSION', true],
      ['SUPERSEDED', 'ADMISSION', false],
      ['REVOKED', 'ADMISSION', false],
      ['ARCHIVED', 'ADMISSION', false],
      ['ACTIVE', 'FINALIZATION', true],
      ['SUPERSEDED', 'FINALIZATION', true],
      ['REVOKED', 'FINALIZATION', false],
      ['ARCHIVED', 'FINALIZATION', false],
    ] as const)('status=%s mode=%s -> eligible=%s', (status, mode, eligible) => {
      const basis = legalBasis({ status });
      const result = assertLegalBasisEligible(
        baseInput({
          mode,
          legalBasis: basis,
          expectedBinding: mode === 'FINALIZATION' ? matchingExpectedBinding(basis) : undefined,
        }),
      );
      expect(result.ok).toBe(eligible);
      if (!result.ok && !eligible) {
        expect(result.failure.code).toBe('LIFECYCLE_NOT_ELIGIBLE');
      }
    });
  });

  describe('D2 temporal validity: effectiveFrom <= effectiveAt < effectiveTo', () => {
    it('accepts effectiveAt exactly at effectiveFrom', () => {
      const basis = legalBasis({
        effectiveFrom: '2026-07-22T00:00:00.000Z',
        effectiveTo: '2026-08-01T00:00:00.000Z',
      });
      const result = assertLegalBasisEligible(
        baseInput({ legalBasis: basis, effectiveAt: '2026-07-22T00:00:00.000Z' }),
      );
      expect(result).toMatchObject({ ok: true });
    });

    it('rejects effectiveAt one millisecond before effectiveFrom', () => {
      const basis = legalBasis({
        effectiveFrom: '2026-07-22T00:00:00.000Z',
        effectiveTo: null,
      });
      const result = assertLegalBasisEligible(
        baseInput({ legalBasis: basis, effectiveAt: '2026-07-21T23:59:59.999Z' }),
      );
      expect(result).toMatchObject({ ok: false, failure: { code: 'NOT_EFFECTIVE_AT_DATE' } });
    });

    it('rejects effectiveAt exactly at effectiveTo (exclusive upper bound)', () => {
      const basis = legalBasis({
        effectiveFrom: '2020-01-01T00:00:00.000Z',
        effectiveTo: '2026-07-22T00:00:00.000Z',
      });
      const result = assertLegalBasisEligible(
        baseInput({ legalBasis: basis, effectiveAt: '2026-07-22T00:00:00.000Z' }),
      );
      expect(result).toMatchObject({ ok: false, failure: { code: 'NOT_EFFECTIVE_AT_DATE' } });
    });

    it('accepts effectiveAt one millisecond before effectiveTo', () => {
      const basis = legalBasis({
        effectiveFrom: '2020-01-01T00:00:00.000Z',
        effectiveTo: '2026-07-22T00:00:00.000Z',
      });
      const result = assertLegalBasisEligible(
        baseInput({ legalBasis: basis, effectiveAt: '2026-07-21T23:59:59.999Z' }),
      );
      expect(result).toMatchObject({ ok: true });
    });

    it('treats a null effectiveTo as open-ended', () => {
      const basis = legalBasis({ effectiveFrom: '2020-01-01T00:00:00.000Z', effectiveTo: null });
      const result = assertLegalBasisEligible(
        baseInput({ legalBasis: basis, effectiveAt: '2099-01-01T00:00:00.000Z' }),
      );
      expect(result).toMatchObject({ ok: true });
    });
  });

  describe('parity fix: itemType OTHER is a dead end in both modes', () => {
    it.each(['ADMISSION', 'FINALIZATION'] as const)('rejects OTHER in %s mode', (mode) => {
      const basis = legalBasis({
        claimItemProjection: { ...legalBasis().claimItemProjection, itemType: 'OTHER' as any },
      });
      const result = assertLegalBasisEligible(
        baseInput({
          mode,
          legalBasis: basis,
          expectedBinding: mode === 'FINALIZATION' ? matchingExpectedBinding(basis) : undefined,
        }),
      );
      expect(result).toMatchObject({ ok: false, failure: { code: 'PROJECTION_UNSUPPORTED' } });
    });
  });

  describe('D6 immutable binding drift (FINALIZATION only)', () => {
    it('rejects when the re-resolved checksum no longer matches the persisted binding', () => {
      const original = legalBasis();
      const drifted = legalBasis({ legalBasisChecksum: HASH('drifted') });
      const result = assertLegalBasisEligible(
        baseInput({
          mode: 'FINALIZATION',
          legalBasis: drifted,
          expectedBinding: matchingExpectedBinding(original),
        }),
      );
      expect(result).toMatchObject({ ok: false, failure: { code: 'BINDING_DRIFT' } });
    });

    it('rejects when the resolution hash no longer matches the persisted binding', () => {
      const original = legalBasis();
      const drifted = legalBasis({ resolutionHash: HASH('drifted-resolution') });
      const result = assertLegalBasisEligible(
        baseInput({
          mode: 'FINALIZATION',
          legalBasis: drifted,
          expectedBinding: matchingExpectedBinding(original),
        }),
      );
      expect(result).toMatchObject({ ok: false, failure: { code: 'RESOLUTION_CONTRACT_INVALID' } });
    });
  });

  describe('cross-consumer parity: ADMISSION and FINALIZATION never contradict', () => {
    it.each([
      ['liabilityCompatible', false, 'LIABILITY_INCOMPATIBLE'],
      ['legalReviewRequired', true, 'LEGAL_REVIEW_REQUIRED'],
      ['subtypeRecognized', false, 'COMPONENT_UNSUPPORTED'],
    ] as const)('both modes reject %s=%s with %s', (field, value, code) => {
      const basis = legalBasis({ [field]: value } as Partial<ExactLegalBasisBindingV1>);
      const admission = assertLegalBasisEligible(baseInput({ legalBasis: basis }));
      const finalization = assertLegalBasisEligible(
        baseInput({
          mode: 'FINALIZATION',
          legalBasis: basis,
          expectedBinding: matchingExpectedBinding(basis),
        }),
      );
      expect(admission).toMatchObject({ ok: false, failure: { code } });
      expect(finalization).toMatchObject({ ok: false, failure: { code } });
    });

    it('both modes accept the same fully-compatible binding', () => {
      const basis = legalBasis();
      const admission = assertLegalBasisEligible(baseInput({ legalBasis: basis }));
      const finalization = assertLegalBasisEligible(
        baseInput({
          mode: 'FINALIZATION',
          legalBasis: basis,
          expectedBinding: matchingExpectedBinding(basis),
        }),
      );
      expect(admission.ok).toBe(true);
      expect(finalization.ok).toBe(true);
    });
  });

  describe('resolver-record identity defense', () => {
    it('rejects when the returned record does not match the requested code/version', () => {
      const result = assertLegalBasisEligible(
        baseInput({
          requestedIdentity: { legalBasisCode: 'CONTRACTUAL_RECEIVABLE', legalBasisVersion: '2' },
        }),
      );
      expect(result).toMatchObject({ ok: false, failure: { code: 'IDENTITY_MISMATCH' } });
    });

    it('rejects a malformed (non-hex) legal basis checksum', () => {
      const basis = legalBasis({ legalBasisChecksum: 'not-a-valid-checksum' });
      const result = assertLegalBasisEligible(baseInput({ legalBasis: basis }));
      expect(result).toMatchObject({ ok: false, failure: { code: 'IDENTITY_MISMATCH' } });
    });
  });
});
