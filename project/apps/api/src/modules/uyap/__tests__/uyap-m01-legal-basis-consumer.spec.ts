import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PrismaService } from '../../../prisma/prisma.service';
import {
  LegalBasisExactVersionResolverPort,
  type ExactLegalBasisBindingV1,
  type ResolveExactLegalBasisInput,
  type ResolveExactLegalBasisResult,
} from '../../claim-item/formation-intent/claim-item-formation-resolver.ports';
import { LegalBasisRegistryResolverService } from '../../claim-item/formation-intent/legal-basis-registry-resolver.service';
import {
  createLegalBasisProjectionBindingV1,
} from '../../claim-item/formation-intent/legal-basis-projection-binding.contract';
import { RECEIVABLE_LEGAL_BASIS_RESOLVER_FLAG } from '../../claim-item/formation-intent/legal-basis-resolver-activation';
import {
  canonicalJsonStringify,
  stableJsonHash,
} from '../../permission-diagnostics/guided-edge/canonical-json';
import {
  UYAP_M01_LEGAL_BASIS_CONSUMER_FLAG,
  isUyapM01LegalBasisConsumerEnabled,
} from '../legal-basis/uyap-m01-legal-basis-consumer.activation';
import {
  UyapM01LegalBasisConsumerService,
  type UyapM01ClaimRelationInput,
} from '../legal-basis/uyap-m01-legal-basis-consumer.service';

const PROJECT_ROOT = path.resolve(__dirname, '../../../../../..');
const EFFECTIVE_AT = '2026-08-01T00:00:00.000Z';
const HASH = (value: string) => stableJsonHash({ value });
const LIABILITY = Object.freeze({
  liabilityType: 'TAM',
  liableDebtorRefs: Object.freeze(['debtor:opaque-1']),
});
const INPUT: UyapM01ClaimRelationInput = Object.freeze({
  tenantId: 'tenant:test',
  caseId: 'case:test',
  claimItemId: 'claim-item:test',
  snapshotId: 'snapshot:test',
  snapshotHash: HASH('snapshot'),
});

function syntheticBinding(
  overrides: Partial<ExactLegalBasisBindingV1> = {},
): ExactLegalBasisBindingV1 {
  const evidence = ['CLAIMANT_IDENTITY_EVIDENCE', 'LIABILITY_CONTEXT_HASH'] as const;
  return {
    legalBasisCode: 'TMK_364_366',
    legalBasisVersion: '1',
    legalBasisChecksum: HASH('TMK_364_366@1'),
    registryReleaseId: 'RCV-LB-R1',
    registryReleaseChecksum: HASH('RCV-LB-R1'),
    status: 'ACTIVE',
    effectiveFrom: '2026-07-30T12:03:52.000Z',
    effectiveTo: null,
    subtypeRecognized: true,
    componentCategory: 'PRINCIPAL',
    componentSubtypeCode: 'FAMILY_SUPPORT_MAINTENANCE',
    componentSubtypeVersion: '1',
    componentSubtypeChecksum: HASH('FAMILY_SUPPORT_MAINTENANCE@1'),
    allowedDocumentTypes: ['COURT_JUDGMENT'],
    requiredEvidenceClasses: evidence,
    liabilityCompatible: true,
    interestEligibility: 'UNRESOLVED',
    interestPolicyRef: null,
    interestPolicyVersion: null,
    ruleRef: null,
    ruleVersion: null,
    legalReviewRequired: false,
    resolutionContractVersion: 'NafakaLegalBasisExactVersionResolutionV1',
    resolutionHash: HASH('resolution'),
    projectionAuthority: {
      releaseVersion: '1',
      registryId: 'RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY',
      registryVersion: '2',
      registryChecksum: HASH('registry-v2'),
    },
    decisionProjection: {
      legalCharacter: 'FAMILY_SUPPORT_MAINTENANCE',
      legalBasisBinding: {
        allowedLegalBasisCodes: ['TMK_364_366'],
        bindingMode: 'EXACTLY_ONE',
        requiredLegalBasisCodes: ['TMK_364_366'],
      },
      requiredSourceTypes: [
        'COURT_JUDGMENT',
        'EXACT_LEGAL_BASIS_RELEASE_ENTRY',
        'EXACT_LIABILITY_CONTEXT',
      ],
      requiredEvidenceTypes: evidence,
      liabilityCompatibility: {
        allowedLiabilityTypes: ['KISMI', 'SINIRLI', 'TAM'],
        crossLiabilityUse: 'PROHIBITED',
        scope: 'EXACT_SAME_DEBTOR_AND_LIABILITY_RELATIONSHIP',
      },
      interestEligibility: {
        componentAccruesFurtherInterest: false,
        eligibilityRule: 'PRINCIPAL_DOES_NOT_AUTO_ACCRUE_INTEREST',
        requiresExactInterestPolicy: false,
        requiresExactRateAuthority: false,
      },
      amountSemantics: {
        fixedAtFormation: true,
        minorUnitRepresentation: 'POSITIVE_INTEGER_STRING',
        roundingFallback: 'PROHIBITED',
        semanticAuthority: 'EXACT_SOURCE_AMOUNT',
      },
      currencySemantics: {
        conversion: 'PROHIBITED',
        currencyAuthority: 'EXACT_SOURCE_CURRENCY',
        minorUnitAuthority: 'ISO_CURRENCY_MINOR_UNIT',
      },
      calculationSemantics: {
        futureAccrual: 'PROHIBITED',
        rule: 'FIXED_PRINCIPAL',
        sourceAmountDerivation: 'EXACT_SOURCE_AMOUNT',
      },
      allowedFormationPaths: ['CLAIM_ITEM_FORMATION_INTENT_V1_APPROVED_FINALIZATION'],
      forbiddenFormationPaths: ['DIRECT_CLAIM_ITEM_WRITE'],
      admissionRequirements: ['EXACT_VERSION'],
      finalizationRequirements: ['EXACT_CHECKSUM'],
      snapshotRequirements: ['IMMUTABLE_SNAPSHOT'],
    },
    claimItemProjection: {
      itemType: 'PRINCIPAL',
      interestAccrualStatus: 'UNKNOWN',
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

function snapshotFor(binding = syntheticBinding()) {
  const projection = createLegalBasisProjectionBindingV1({
    legalBasis: binding,
    admittedAt: EFFECTIVE_AT,
  });
  const liabilityPayload = canonicalJsonStringify(LIABILITY);
  const evidencePayload = canonicalJsonStringify({ refs: ['evidence:opaque-1'] });
  const snapshotPayload = canonicalJsonStringify({ snapshot: 'canonical' });
  return {
    id: INPUT.snapshotId,
    tenantId: INPUT.tenantId,
    caseId: INPUT.caseId,
    claimItemId: INPUT.claimItemId,
    snapshotCanonicalPayload: snapshotPayload,
    snapshotHash: stableJsonHash(JSON.parse(snapshotPayload)),
    legalBasisCode: binding.legalBasisCode,
    legalBasisVersion: binding.legalBasisVersion,
    legalBasisChecksum: binding.legalBasisChecksum,
    legalBasisRegistryReleaseId: binding.registryReleaseId,
    legalBasisRegistryReleaseChecksum: binding.registryReleaseChecksum,
    legalBasisResolutionContractVersion: binding.resolutionContractVersion,
    legalBasisResolutionHash: binding.resolutionHash,
    legalBasisProjectionBindingContractVersion: projection.envelope.contractVersion,
    legalBasisProjectionBindingCanonicalPayload: projection.envelope.canonicalPayload,
    legalBasisProjectionBindingChecksum: projection.envelope.checksum,
    componentCategory: binding.componentCategory,
    componentSubtypeCode: binding.componentSubtypeCode,
    componentSubtypeVersion: binding.componentSubtypeVersion,
    componentSubtypeChecksum: binding.componentSubtypeChecksum,
    effectiveAt: new Date(EFFECTIVE_AT),
    liabilityContextCanonicalPayload: liabilityPayload,
    liabilityContextHash: stableJsonHash(JSON.parse(liabilityPayload)),
    evidenceRefsCanonicalPayload: evidencePayload,
    evidenceRefsHash: stableJsonHash(JSON.parse(evidencePayload)),
    createdAt: new Date(EFFECTIVE_AT),
  };
}

function harness(
  snapshot: ReturnType<typeof snapshotFor> | null = snapshotFor(),
  resolverResult: ResolveExactLegalBasisResult | ((input: ResolveExactLegalBasisInput) => ResolveExactLegalBasisResult) = {
    ok: true,
    value: syntheticBinding(),
  },
) {
  const prisma = {
    claimFormationSnapshot: {
      findUnique: jest.fn(async () => snapshot),
    },
  } as unknown as PrismaService;
  const resolver = {
    resolveExactVersion: jest.fn(async (input: ResolveExactLegalBasisInput) => {
      if (typeof resolverResult === 'function') return resolverResult(input);
      if (input.documentType !== 'COURT_JUDGMENT') {
        return { ok: false, failure: { code: 'SCOPE_MISMATCH' } } as const;
      }
      return resolverResult;
    }),
  } as unknown as LegalBasisExactVersionResolverPort;
  return {
    prisma,
    resolver,
    service: new UyapM01LegalBasisConsumerService(prisma, resolver),
  };
}

describe('UYAP-M01 RECEIVABLE Legal Basis consumer binding', () => {
  const originalUyapFlag = process.env[UYAP_M01_LEGAL_BASIS_CONSUMER_FLAG];
  const originalReceivableFlag = process.env[RECEIVABLE_LEGAL_BASIS_RESOLVER_FLAG];

  beforeEach(() => {
    process.env[UYAP_M01_LEGAL_BASIS_CONSUMER_FLAG] = 'true';
    process.env[RECEIVABLE_LEGAL_BASIS_RESOLVER_FLAG] = 'true';
  });

  afterAll(() => {
    restoreEnv(UYAP_M01_LEGAL_BASIS_CONSUMER_FLAG, originalUyapFlag);
    restoreEnv(RECEIVABLE_LEGAL_BASIS_RESOLVER_FLAG, originalReceivableFlag);
  });

  it('A/B resolves the exact canonical release for a valid tenant/case/claim relation', async () => {
    const canonicalResolver = new LegalBasisRegistryResolverService();
    const first = await canonicalResolver.resolveExactVersion({
      tenantId: INPUT.tenantId,
      caseId: INPUT.caseId,
      legalBasisCode: 'TMK_169',
      requestedVersion: '1',
      effectiveAt: EFFECTIVE_AT,
      componentCategory: 'PRINCIPAL',
      componentSubtypeCode: 'INTERIM_MAINTENANCE',
      documentType: 'INTERIM_COURT_ORDER',
      evidenceClasses: [
        'CLAIMANT_IDENTITY_EVIDENCE',
        'DEBTOR_IDENTITY_EVIDENCE',
        'EXACT_DUE_DATE_EVIDENCE',
        'EXACT_INSTALLMENT_AMOUNT_EVIDENCE',
        'INTERIM_ORDER_ENFORCEABILITY_EVIDENCE',
        'LIABILITY_CONTEXT_HASH',
        'SOURCE_EFFECTIVE_INTERVAL_EVIDENCE',
      ],
      liabilityContext: LIABILITY,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const snapshot = snapshotFor(first.value);
    const prisma = {
      claimFormationSnapshot: { findUnique: jest.fn(async () => snapshot) },
    } as unknown as PrismaService;
    const service = new UyapM01LegalBasisConsumerService(prisma, canonicalResolver);

    await expect(
      service.resolveClaimRelation({ ...INPUT, snapshotHash: snapshot.snapshotHash }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        releaseId: 'RCV-LB-R1',
        legalBasisCode: 'TMK_169',
        legalBasisVersion: '1',
        sourceType: 'INTERIM_COURT_ORDER',
      },
    });
  });

  it.each([
    ['C wrong version', { legalBasisVersion: '2' }, 'VERSION_NOT_FOUND'],
    ['D wrong release checksum', { legalBasisRegistryReleaseChecksum: HASH('wrong') }, 'CHECKSUM_MISMATCH'],
    ['release identity mismatch', { legalBasisRegistryReleaseId: 'RCV-LB-R9' }, 'RELEASE_NOT_FOUND'],
    ['component mismatch', { componentSubtypeCode: 'INTERIM_MAINTENANCE' }, 'COMPONENT_MISMATCH'],
  ] as const)('%s fails closed', async (_label, mutation, expected) => {
    const current = snapshotFor();
    const { service } = harness({ ...current, ...mutation });
    await expect(service.resolveClaimRelation({ ...INPUT, snapshotHash: current.snapshotHash })).resolves.toEqual({
      ok: false,
      failure: { code: expected },
    });
  });

  it('E rejects a release that is not effective for the snapshot time', async () => {
    const current = snapshotFor();
    const { service } = harness({ ...current, effectiveAt: new Date('2020-01-01T00:00:00.000Z') });
    await expect(service.resolveClaimRelation({ ...INPUT, snapshotHash: current.snapshotHash })).resolves.toEqual({
      ok: false,
      failure: { code: 'NOT_EFFECTIVE' },
    });
  });

  it('F rejects a missing claim-level relation without resolver activity', async () => {
    const { service, resolver } = harness(null);
    await expect(service.resolveClaimRelation(INPUT)).resolves.toEqual({
      ok: false,
      failure: { code: 'CLAIM_RELATION_MISSING' },
    });
    expect(resolver.resolveExactVersion).not.toHaveBeenCalled();
  });

  it.each([
    ['G tenant mismatch', { tenantId: 'tenant:other' }, 'TENANT_MISMATCH'],
    ['H case mismatch', { caseId: 'case:other' }, 'CASE_MISMATCH'],
    ['claim mismatch', { claimItemId: 'claim-item:other' }, 'CLAIM_RELATION_MISSING'],
  ] as const)('%s is deterministic', async (_label, inputMutation, expected) => {
    const current = snapshotFor();
    const { service } = harness(current);
    await expect(
      service.resolveClaimRelation({ ...INPUT, snapshotHash: current.snapshotHash, ...inputMutation }),
    ).resolves.toEqual({ ok: false, failure: { code: expected } });
  });

  it('I rejects source incompatibility', async () => {
    const current = snapshotFor();
    const { service } = harness(current, () => ({
      ok: false,
      failure: { code: 'SCOPE_MISMATCH' },
    }));
    await expect(
      service.resolveClaimRelation({ ...INPUT, snapshotHash: current.snapshotHash }),
    ).resolves.toEqual({ ok: false, failure: { code: 'SOURCE_INCOMPATIBLE' } });
  });

  it('I rejects evidence incompatibility', async () => {
    const current = snapshotFor();
    const incompatible = syntheticBinding({
      requiredEvidenceClasses: ['DIFFERENT_EVIDENCE'],
    });
    const { service } = harness(current, (input) =>
      input.documentType === 'COURT_JUDGMENT'
        ? { ok: true, value: incompatible }
        : { ok: false, failure: { code: 'SCOPE_MISMATCH' } },
    );
    await expect(
      service.resolveClaimRelation({ ...INPUT, snapshotHash: current.snapshotHash }),
    ).resolves.toEqual({ ok: false, failure: { code: 'EVIDENCE_INCOMPATIBLE' } });
  });

  it('J rejects liability incompatibility before resolver use', async () => {
    const base = syntheticBinding();
    const incompatible = syntheticBinding({
      decisionProjection: {
        ...base.decisionProjection,
        liabilityCompatibility: {
          ...base.decisionProjection.liabilityCompatibility,
          allowedLiabilityTypes: ['KISMI'],
        },
      },
    });
    const current = snapshotFor(incompatible);
    const { service, resolver } = harness(current, { ok: true, value: incompatible });
    await expect(
      service.resolveClaimRelation({ ...INPUT, snapshotHash: current.snapshotHash }),
    ).resolves.toEqual({ ok: false, failure: { code: 'LIABILITY_INCOMPATIBLE' } });
    expect(resolver.resolveExactVersion).not.toHaveBeenCalled();
  });

  it.each([
    ['K caller Legal Basis override', { legalBasisCode: 'TMK_169' }],
    ['L UYAP transport authority fields', { mahiyetKodu: '9009', takipTuru: '4' }],
    ['L free-text authority', { description: 'nafaka' }],
  ])('%s is rejected before DB access', async (_label, injected) => {
    const { service, prisma } = harness();
    await expect(service.resolveClaimRelation({ ...INPUT, ...injected })).resolves.toEqual({
      ok: false,
      failure: { code: 'CLAIM_RELATION_MISSING' },
    });
    expect(prisma.claimFormationSnapshot.findUnique).not.toHaveBeenCalled();
  });

  it('M requires both exact true flags and defaults to disabled/no-read', async () => {
    expect(isUyapM01LegalBasisConsumerEnabled({})).toBe(false);
    expect(
      isUyapM01LegalBasisConsumerEnabled({
        [UYAP_M01_LEGAL_BASIS_CONSUMER_FLAG]: 'true',
      }),
    ).toBe(false);
    expect(
      isUyapM01LegalBasisConsumerEnabled({
        [UYAP_M01_LEGAL_BASIS_CONSUMER_FLAG]: 'TRUE',
        [RECEIVABLE_LEGAL_BASIS_RESOLVER_FLAG]: 'true',
      }),
    ).toBe(false);
    delete process.env[UYAP_M01_LEGAL_BASIS_CONSUMER_FLAG];
    const { service, prisma } = harness();
    await expect(service.resolveClaimRelation(INPUT)).resolves.toEqual({
      ok: false,
      failure: { code: 'FEATURE_DISABLED' },
    });
    expect(prisma.claimFormationSnapshot.findUnique).not.toHaveBeenCalled();
  });

  it('N/O registers only inside UyapModule and has zero production call-sites', () => {
    const modulePath = path.join(PROJECT_ROOT, 'apps/api/src/modules/uyap/uyap.module.ts');
    const moduleSource = fs.readFileSync(modulePath, 'utf8');
    expect(moduleSource).toContain('UyapM01LegalBasisConsumerService');
    expect(moduleSource).toContain('LegalBasisExactVersionResolverPort');
    expect(moduleSource).toContain('LegalBasisRegistryResolverService');
    const productionReferences = productionTypeScriptFiles(
      path.join(PROJECT_ROOT, 'apps/api/src/modules'),
    )
      .filter((file) => file !== modulePath)
      .filter((file) => !file.endsWith('uyap-m01-legal-basis-consumer.service.ts'))
      .filter((file) =>
        fs.readFileSync(file, 'utf8').includes('UyapM01LegalBasisConsumerService'),
      );
    expect(productionReferences).toEqual([]);
    const exportsBlock = moduleSource.match(/exports:\s*\[([\s\S]*?)\]/)?.[1] ?? '';
    expect(exportsBlock).not.toContain('UyapM01LegalBasisConsumerService');
  });

  it('uses a read-only snapshot lookup and exposes no writer API', () => {
    const source = fs.readFileSync(
      path.join(
        PROJECT_ROOT,
        'apps/api/src/modules/uyap/legal-basis/uyap-m01-legal-basis-consumer.service.ts',
      ),
      'utf8',
    );
    expect(source).toContain('claimFormationSnapshot.findUnique');
    expect(source).not.toMatch(/claimFormationSnapshot\.(create|update|delete|upsert)/);
    expect(source).not.toMatch(/\.(\$executeRaw|\$queryRawUnsafe|\$executeRawUnsafe)\b/);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function productionTypeScriptFiles(root: string): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') result.push(...productionTypeScriptFiles(candidate));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      result.push(candidate);
    }
  }
  return result;
}
