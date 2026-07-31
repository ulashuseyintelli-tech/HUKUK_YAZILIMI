import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';
import type { ExactLegalBasisBindingV1 } from '../formation-intent/claim-item-formation-resolver.ports';
import {
  assertLegalBasisProjectionBindingMatches,
  createLegalBasisProjectionBindingV1,
  LEGAL_BASIS_PROJECTION_BINDING_CONTRACT_ID,
  LEGAL_SUBTYPE_CODES_V1,
  LegalBasisProjectionBindingContractError,
  parseLegalBasisProjectionBindingV1,
} from '../formation-intent/legal-basis-projection-binding.contract';

const HASH = (value: string) => stableJsonHash({ value });
const ADMITTED_AT = '2026-07-28T10:00:00.000Z';
const PROJECT_ROOT = resolve(__dirname, '../../../../../..');

function legalBasis(
  overrides: Partial<ExactLegalBasisBindingV1> = {},
): ExactLegalBasisBindingV1 {
  return {
    legalBasisCode: 'TBK_118',
    legalBasisVersion: '1',
    legalBasisChecksum: HASH('TBK_118@1'),
    registryReleaseId: 'RCV-LB-R1',
    registryReleaseChecksum: HASH('RCV-LB-R1'),
    status: 'ACTIVE',
    effectiveFrom: '2026-07-26T00:00:00Z',
    effectiveTo: null,
    subtypeRecognized: true,
    componentCategory: 'ANCILLARY',
    componentSubtypeCode: 'DELAY_DAMAGE',
    componentSubtypeVersion: '1',
    componentSubtypeChecksum: HASH('DELAY_DAMAGE@1'),
    allowedDocumentTypes: ['CONTRACT'],
    requiredEvidenceClasses: [
      'CAUSATION_EVIDENCE',
      'DAMAGE_AMOUNT_EVIDENCE',
      'DEFAULT_FACT_EVIDENCE',
      'LIABILITY_CONTEXT_HASH',
      'LIABILITY_SOURCE_EVIDENCE',
    ],
    liabilityCompatible: true,
    interestEligibility: 'NO_INTEREST',
    interestPolicyRef: null,
    interestPolicyVersion: null,
    ruleRef: null,
    ruleVersion: null,
    legalReviewRequired: false,
    resolutionContractVersion: 'LegalBasisResolutionV1',
    resolutionHash: HASH('resolution'),
    projectionAuthority: {
      releaseVersion: '1',
      registryId: 'RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY',
      registryVersion: '1',
      registryChecksum:
        '320f671ed2262314a560703bc8f15f9cd8b5e0743d8dfa4e5ce49b1e62c26e64',
    },
    decisionProjection: {
      legalCharacter: 'DEFAULT_CONSEQUENCE_DAMAGE',
      legalBasisBinding: {
        allowedLegalBasisCodes: ['TBK_118'],
        bindingMode: 'EXACTLY_ONE',
        requiredLegalBasisCodes: ['TBK_118'],
      },
      requiredSourceTypes: [
        'EXACT_DOCUMENT_SOURCE_VERSION',
        'EXACT_LEGAL_BASIS_RELEASE_ENTRY',
        'EXACT_LIABILITY_CONTEXT',
      ],
      requiredEvidenceTypes: [
        'CAUSATION_EVIDENCE',
        'DAMAGE_AMOUNT_EVIDENCE',
        'DEFAULT_FACT_EVIDENCE',
        'LIABILITY_CONTEXT_HASH',
        'LIABILITY_SOURCE_EVIDENCE',
      ],
      liabilityCompatibility: {
        allowedLiabilityTypes: ['KISMI', 'SINIRLI', 'TAM'],
        crossLiabilityUse: 'PROHIBITED',
        scope: 'EXACT_SAME_DEBTOR_AND_LIABILITY_RELATIONSHIP',
      },
      interestEligibility: {
        componentAccruesFurtherInterest: false,
        eligibilityRule: 'NOT_AN_INTEREST_COMPONENT',
        requiresExactInterestPolicy: false,
        requiresExactRateAuthority: false,
      },
      amountSemantics: {
        fixedAtFormation: true,
        minorUnitRepresentation: 'POSITIVE_INTEGER_STRING',
        roundingFallback: 'PROHIBITED',
        semanticAuthority: 'PROVEN_DELAY_DAMAGE',
      },
      currencySemantics: {
        conversion: 'PROHIBITED',
        currencyAuthority: 'EXACT_DAMAGE_EVIDENCE_CURRENCY',
        minorUnitAuthority: 'ISO_CURRENCY_MINOR_UNIT',
      },
      calculationSemantics: {
        futureAccrual: 'PROHIBITED',
        rule: 'FORM_ONLY_PROVEN_DAMAGE_AMOUNT_WITH_CAUSATION',
        sourceAmountDerivation: 'EXACT_DAMAGE_EVIDENCE_REQUIRED',
      },
      allowedFormationPaths: [
        'CLAIM_ITEM_FORMATION_INTENT_V1_APPROVED_FINALIZATION',
      ],
      forbiddenFormationPaths: [
        'DIRECT_CLAIM_ITEM_WRITE',
        'GENERIC_COMPONENT_FALLBACK',
        'CURRENT_LATEST_OR_DEFAULT_RESOLUTION',
        'AUTOMATIC_INTEREST_OR_PENALTY_CLASSIFICATION',
        'HISTORICAL_RECLASSIFICATION',
      ],
      admissionRequirements: [
        'Exact TBK_118 version and checksum',
        'Exact default fact and damage evidence',
      ],
      finalizationRequirements: [
        'Revalidate exact Legal Basis version and checksum',
        'Persist ClaimItem and immutable formation snapshot atomically',
      ],
      snapshotRequirements: [
        'Registry identity version checksum and subtype version',
        'Exact Legal Basis identity version checksum and release identity',
      ],
    },
    claimItemProjection: {
      itemType: 'PENALTY',
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

function create(binding = legalBasis(), admittedAt = ADMITTED_AT) {
  return createLegalBasisProjectionBindingV1({ legalBasis: binding, admittedAt });
}

describe('RCV-CLAIM-FORM-P02-S08-D02-PB01 projection binding contract', () => {
  it('keeps the machine contract and closed JSON Schema aligned with runtime V1', () => {
    const contract = JSON.parse(
      readFileSync(
        resolve(
          PROJECT_ROOT,
          'docs/rcv-claim-legal-basis-projection-binding-v1.contract.json',
        ),
        'utf8',
      ),
    ) as Record<string, any>;
    const schema = JSON.parse(
      readFileSync(
        resolve(
          PROJECT_ROOT,
          'docs/rcv-claim-legal-basis-projection-binding-v1.schema.json',
        ),
        'utf8',
      ),
    ) as Record<string, any>;

    expect(contract).toMatchObject({
      contractId: LEGAL_BASIS_PROJECTION_BINDING_CONTRACT_ID,
      contractStatus: 'RATIFIED',
      contractVersion: 1,
      runtimeStatus: 'DORMANT',
      projectionSchemaVersion: 1,
      authorityIdentity: {
        registryId: 'RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY',
        registryVersion: 1,
        registryChecksum:
          '320f671ed2262314a560703bc8f15f9cd8b5e0743d8dfa4e5ce49b1e62c26e64',
        resolutionPolicy: 'EXACT_VERSION_ONLY',
        fallbacks: 'PROHIBITED',
      },
    });
    expect(contract.decisionProjection.claimItemProjectionFields).toHaveLength(8);
    expect(schema).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
    });
    expect(schema.required).toEqual([
      'authorityIdentity',
      'decisionProjection',
      'integrityMetadata',
      'temporalContext',
    ]);
    for (const definition of [
      'authorityIdentity',
      'decisionProjection',
      'legalBasisBinding',
      'liabilityCompatibility',
      'interestEligibility',
      'amountSemantics',
      'currencySemantics',
      'calculationSemantics',
      'claimItemProjection',
      'integrityMetadata',
      'temporalContext',
    ]) {
      expect(schema.$defs[definition].additionalProperties).toBe(false);
    }
    expect(schema.$defs.authorityIdentity.properties.subtypeCode.enum).toEqual(
      LEGAL_SUBTYPE_CODES_V1,
    );
  });

  it('creates one immutable canonical V1 envelope with all decision sections', () => {
    const result = create();

    expect(result.envelope).toMatchObject({
      contractVersion: '1',
      checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(result.payload.integrityMetadata).toEqual({
      contractId: LEGAL_BASIS_PROJECTION_BINDING_CONTRACT_ID,
      projectionSchemaVersion: 1,
      serializationAlgorithm: 'CANONICAL_JSON_UTF8_V1',
      checksumAlgorithm: 'SHA-256',
    });
    expect(result.payload.authorityIdentity).toMatchObject({
      releaseId: 'RCV-LB-R1',
      releaseVersion: 1,
      legalBasisCode: 'TBK_118',
      registryId: 'RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY',
      registryVersion: 1,
      subtypeCode: 'DELAY_DAMAGE',
      subtypeVersion: 1,
    });
    expect(Object.isFrozen(result.payload)).toBe(true);
    expect(Object.isFrozen(result.payload.decisionProjection)).toBe(true);
  });

  it('is deterministic across insertion order and admission timestamps', () => {
    const first = create();
    const reordered = legalBasis({
      decisionProjection: {
        ...legalBasis().decisionProjection,
        legalBasisBinding: {
          requiredLegalBasisCodes: ['TBK_118'],
          bindingMode: 'EXACTLY_ONE',
          allowedLegalBasisCodes: ['TBK_118'],
        },
      },
    });
    const second = create(reordered, '2026-07-28T10:30:00.000Z');

    expect(second.envelope).toEqual(first.envelope);
  });

  it('normalizes equivalent CRLF/LF and Unicode semantic text before hashing', () => {
    const crlf = legalBasis({
      decisionProjection: {
        ...legalBasis().decisionProjection,
        legalCharacter: 'Gecikme\r\nzararı e\u0301',
      },
    });
    const lf = legalBasis({
      decisionProjection: {
        ...legalBasis().decisionProjection,
        legalCharacter: 'Gecikme\nzararı é',
      },
    });

    expect(create(crlf).envelope).toEqual(create(lf).envelope);
  });

  it('preserves array order as decision-significant while sorting nested object keys', () => {
    const baseline = legalBasis();
    const reversedEvidence = legalBasis({
      decisionProjection: {
        ...baseline.decisionProjection,
        requiredEvidenceTypes: [...baseline.decisionProjection.requiredEvidenceTypes].reverse(),
      },
    });

    expect(create(reversedEvidence).envelope.checksum).not.toBe(
      create(baseline).envelope.checksum,
    );
  });

  it('round-trips the typed payload and exact checksum', () => {
    const created = create();
    expect(parseLegalBasisProjectionBindingV1(created.envelope)).toEqual(created);
  });

  it.each([
    ['legalCharacter', (basis: ExactLegalBasisBindingV1) => ({
      ...basis,
      decisionProjection: { ...basis.decisionProjection, legalCharacter: 'CHANGED' },
    })],
    ['evidence', (basis: ExactLegalBasisBindingV1) => ({
      ...basis,
      decisionProjection: {
        ...basis.decisionProjection,
        requiredEvidenceTypes: [...basis.decisionProjection.requiredEvidenceTypes, 'NEW_EVIDENCE'],
      },
    })],
    ['source', (basis: ExactLegalBasisBindingV1) => ({
      ...basis,
      decisionProjection: {
        ...basis.decisionProjection,
        requiredSourceTypes: [...basis.decisionProjection.requiredSourceTypes, 'NEW_SOURCE'],
      },
    })],
    ['liability', (basis: ExactLegalBasisBindingV1) => ({
      ...basis,
      decisionProjection: {
        ...basis.decisionProjection,
        liabilityCompatibility: {
          ...basis.decisionProjection.liabilityCompatibility,
          allowedLiabilityTypes: ['TAM'],
        },
      },
    })],
    ['interest', (basis: ExactLegalBasisBindingV1) => ({
      ...basis,
      decisionProjection: {
        ...basis.decisionProjection,
        interestEligibility: {
          ...basis.decisionProjection.interestEligibility,
          eligibilityRule: 'CHANGED',
        },
      },
    })],
    ['amount', (basis: ExactLegalBasisBindingV1) => ({
      ...basis,
      decisionProjection: {
        ...basis.decisionProjection,
        amountSemantics: {
          ...basis.decisionProjection.amountSemantics,
          semanticAuthority: 'CHANGED',
        },
      },
    })],
    ['currency', (basis: ExactLegalBasisBindingV1) => ({
      ...basis,
      decisionProjection: {
        ...basis.decisionProjection,
        currencySemantics: {
          ...basis.decisionProjection.currencySemantics,
          currencyAuthority: 'CHANGED',
        },
      },
    })],
    ['calculation', (basis: ExactLegalBasisBindingV1) => ({
      ...basis,
      decisionProjection: {
        ...basis.decisionProjection,
        calculationSemantics: {
          ...basis.decisionProjection.calculationSemantics,
          rule: 'CHANGED',
        },
      },
    })],
    ['formation path', (basis: ExactLegalBasisBindingV1) => ({
      ...basis,
      decisionProjection: {
        ...basis.decisionProjection,
        forbiddenFormationPaths: [...basis.decisionProjection.forbiddenFormationPaths, 'CHANGED'],
      },
    })],
    ['claim item projection', (basis: ExactLegalBasisBindingV1) => ({
      ...basis,
      claimItemProjection: { ...basis.claimItemProjection, isAllDebtorsLiable: true },
    })],
  ] as const)('changes checksum when %s changes', (_label, mutate) => {
    const baseline = legalBasis();
    expect(create(mutate(baseline)).envelope.checksum).not.toBe(
      create(baseline).envelope.checksum,
    );
  });

  it.each([
    ['missing release ID', { registryReleaseId: '' }],
    ['zero release version', { projectionAuthority: { ...legalBasis().projectionAuthority, releaseVersion: '0' } }],
    ['invalid release checksum', { registryReleaseChecksum: 'bad' }],
    ['missing Legal Basis code', { legalBasisCode: '' }],
    ['zero Legal Basis version', { legalBasisVersion: '0' }],
    ['missing registry identity', { projectionAuthority: { ...legalBasis().projectionAuthority, registryId: '' } }],
    ['invalid registry checksum', { projectionAuthority: { ...legalBasis().projectionAuthority, registryChecksum: 'bad' } }],
    ['unknown subtype', { componentSubtypeCode: 'UNKNOWN' }],
    ['zero subtype version', { componentSubtypeVersion: '0' }],
    ['invalid temporal window', { effectiveTo: '2026-07-25T00:00:00Z' }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => create(legalBasis(overrides as Partial<ExactLegalBasisBindingV1>))).toThrow(
      LegalBasisProjectionBindingContractError,
    );
  });

  it('rejects unknown and missing decision fields in persisted payloads', () => {
    const valid = create();
    const payload = JSON.parse(valid.envelope.canonicalPayload) as Record<string, any>;
    payload.decisionProjection.unknownField = true;
    const unknown = {
      ...valid.envelope,
      canonicalPayload: JSON.stringify(payload),
      checksum: stableJsonHash(payload),
    };
    expect(() => parseLegalBasisProjectionBindingV1(unknown)).toThrow();

    delete payload.decisionProjection.unknownField;
    delete payload.decisionProjection.legalCharacter;
    const missing = {
      ...valid.envelope,
      canonicalPayload: JSON.stringify(payload),
      checksum: stableJsonHash(payload),
    };
    expect(() => parseLegalBasisProjectionBindingV1(missing)).toThrow();
  });

  it.each([
    ['unsupported projection schema', 'projectionSchemaVersion', 2],
    ['unsupported serializer', 'serializationAlgorithm', 'OTHER'],
    ['unsupported checksum algorithm', 'checksumAlgorithm', 'SHA-512'],
  ])('rejects %s in persisted payloads', (_label, field, value) => {
    const valid = create();
    const payload = JSON.parse(valid.envelope.canonicalPayload) as Record<string, any>;
    payload.integrityMetadata[field] = value;
    const invalid = {
      ...valid.envelope,
      canonicalPayload: JSON.stringify(payload),
      checksum: stableJsonHash(payload),
    };

    expect(() => parseLegalBasisProjectionBindingV1(invalid)).toThrow(
      LegalBasisProjectionBindingContractError,
    );
  });

  it('distinguishes identity drift from decision-projection drift', () => {
    const stored = create().envelope;
    const identityDrift = () =>
      assertLegalBasisProjectionBindingMatches(
        stored,
        legalBasis({ legalBasisChecksum: HASH('changed-basis') }),
        ADMITTED_AT,
      );
    expect(identityDrift).toThrow(LegalBasisProjectionBindingContractError);
    try {
      identityDrift();
    } catch (error) {
      expect(error).toMatchObject({ code: 'PROJECTION_BINDING_IDENTITY_MISMATCH' });
    }

    const projectionDrift = () =>
      assertLegalBasisProjectionBindingMatches(
        stored,
        legalBasis({
          claimItemProjection: { ...legalBasis().claimItemProjection, itemType: 'EXPENSE' },
        }),
        ADMITTED_AT,
      );
    expect(projectionDrift).toThrow(LegalBasisProjectionBindingContractError);
    try {
      projectionDrift();
    } catch (error) {
      expect(error).toMatchObject({ code: 'PROJECTION_BINDING_PROJECTION_MISMATCH' });
    }
  });
});
