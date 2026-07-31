import * as fs from 'node:fs';
import * as path from 'node:path';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';
import { ClaimItemFormationOfficeApprovalAdapter } from '../formation-intent/claim-item-formation-office-approval.adapter';
import {
  calculateCanonicalLegalBasisArtifactChecksum,
  calculateLegalSubtypeRegistryChecksum,
  LegalBasisRegistryResolverService,
  type LegalBasisRegistryResolverArtifactsV2,
  type LegalSubtypeRegistryChecksumManifestV2,
  type LegalSubtypeRegistryEntryV2,
  type LegalSubtypeRegistryV2,
  type NafakaLegalBasisReleaseEntryV1,
  type NafakaLegalBasisReleaseManifestV1,
  type NafakaLegalBasisReleaseV1,
} from '../formation-intent/legal-basis-registry-resolver.service';
import {
  isLegalBasisResolverEnabled,
  RECEIVABLE_LEGAL_BASIS_RESOLVER_FLAG,
} from '../formation-intent/legal-basis-resolver-activation';
import {
  CaseDocumentExactVersionResolverPort,
  HumanClaimItemFormationAuthorizationPort,
  type ExactCaseDocumentSourceV1,
  type ResolveExactLegalBasisInput,
} from '../formation-intent/claim-item-formation-resolver.ports';
import {
  LEGAL_SUBTYPE_CODES_V1,
  parseLegalBasisProjectionBindingV1,
} from '../formation-intent/legal-basis-projection-binding.contract';
import { HumanClaimItemFormationAdmissionService } from '../formation-intent/human-claim-item-formation-admission.service';

const PROJECT_ROOT = path.resolve(__dirname, '../../../../../..');
const GOVERNANCE_ROOT = path.join(PROJECT_ROOT, 'docs/governance');
const REGISTRY = readJson<LegalSubtypeRegistryV2>('receivable-legal-subtype-registry-v2.json');
const CHECKSUM_MANIFEST = readJson<LegalSubtypeRegistryChecksumManifestV2>(
  'receivable-legal-subtype-registry-v2.checksum.json',
);
const RELEASE = readJson<NafakaLegalBasisReleaseV1>('receivable-legal-basis-release-r1.json');
const RELEASE_MANIFEST = readJson<NafakaLegalBasisReleaseManifestV1>(
  'receivable-legal-basis-release-r1.manifest.json',
);
const HASH = (value: string) => stableJsonHash({ value });
const LIABILITY = Object.freeze({
  liabilityType: 'TAM',
  liableDebtorRefs: Object.freeze(['debtor:opaque-1']),
});

function readJson<T>(fileName: string): T {
  return JSON.parse(fs.readFileSync(path.join(GOVERNANCE_ROOT, fileName), 'utf8')) as T;
}

function canonicalArtifacts(): LegalBasisRegistryResolverArtifactsV2 {
  return {
    registry: REGISTRY,
    checksumManifest: CHECKSUM_MANIFEST,
    release: RELEASE,
    releaseManifest: RELEASE_MANIFEST,
    computedRegistryChecksum: calculateLegalSubtypeRegistryChecksum(REGISTRY),
    computedReleaseChecksum: calculateCanonicalLegalBasisArtifactChecksum(RELEASE),
  };
}

function artifactsWithStatus(
  subtypeCode: string,
  status: LegalSubtypeRegistryEntryV2['status'],
): LegalBasisRegistryResolverArtifactsV2 {
  const registry = {
    ...REGISTRY,
    entries: REGISTRY.entries.map((entry) =>
      entry.subtypeCode === subtypeCode ? { ...entry, status } : entry,
    ),
  } as LegalSubtypeRegistryV2;
  const computedRegistryChecksum = calculateLegalSubtypeRegistryChecksum(registry);
  const checksumManifest = {
    ...CHECKSUM_MANIFEST,
    registryChecksum: computedRegistryChecksum,
  } as LegalSubtypeRegistryChecksumManifestV2;
  const release = {
    ...RELEASE,
    legalBases: RELEASE.legalBases.map((basis) => ({
      ...basis,
      subtypeRegistryBinding: {
        ...basis.subtypeRegistryBinding,
        registryChecksum: computedRegistryChecksum,
      },
    })),
  } as NafakaLegalBasisReleaseV1;
  const computedReleaseChecksum = calculateCanonicalLegalBasisArtifactChecksum(release);
  const releaseManifest = {
    ...RELEASE_MANIFEST,
    payloadChecksum: computedReleaseChecksum,
    entryChecksums: release.legalBases.map((basis) => ({
      legalBasisCode: basis.legalBasisCode,
      legalBasisVersion: basis.legalBasisVersion,
      checksum: calculateCanonicalLegalBasisArtifactChecksum(basis),
    })),
  } as NafakaLegalBasisReleaseManifestV1;
  return {
    registry,
    checksumManifest,
    release,
    releaseManifest,
    computedRegistryChecksum,
    computedReleaseChecksum,
  };
}

function subtypeFor(basis: NafakaLegalBasisReleaseEntryV1): LegalSubtypeRegistryEntryV2 {
  const subtypeCode = basis.subtypeRegistryBinding.allowedSubtypeCodes[0];
  const subtype = REGISTRY.entries.find((entry) => entry.subtypeCode === subtypeCode);
  if (!subtype) throw new Error(`missing subtype fixture: ${subtypeCode}`);
  return subtype;
}

function inputFor(
  basis: NafakaLegalBasisReleaseEntryV1 = RELEASE.legalBases[0],
): ResolveExactLegalBasisInput {
  const subtype = subtypeFor(basis);
  return {
    tenantId: 'tenant:test',
    caseId: 'case:test',
    legalBasisCode: basis.legalBasisCode,
    requestedVersion: basis.legalBasisVersion,
    effectiveAt: basis.effectiveFrom,
    componentCategory: subtype.canonicalComponentCategory,
    componentSubtypeCode: subtype.subtypeCode,
    documentType: basis.sourceEvidenceCompatibility.allowedSourceTypes[0],
    evidenceClasses: basis.sourceEvidenceCompatibility.requiredEvidenceTypes,
    liabilityContext: LIABILITY,
  };
}

function sourceFor(basis: NafakaLegalBasisReleaseEntryV1): ExactCaseDocumentSourceV1 {
  return {
    tenantId: 'tenant:test',
    caseId: 'case:test',
    sourceType: 'CASE_DOCUMENT',
    documentId: 'document:test',
    versionId: 'document-version:test',
    version: '1',
    binaryContentHash: HASH('binary'),
    documentEnvelopeHash: HASH('envelope'),
    classificationHash: HASH('classification'),
    canonicalSourceFingerprint: HASH('fingerprint'),
    fingerprintAlgorithm: 'SHA-256',
    fingerprintVersion: 'DocumentFingerprintV1',
    fingerprintVerified: true,
    documentType: basis.sourceEvidenceCompatibility.allowedSourceTypes[0],
    claimItemDocumentSourceType: 'ILAM',
    documentClassificationVersion: 'DocumentClassificationV1',
    lifecycleStatus: 'ACTIVE',
    availabilityStatus: 'AVAILABLE',
    availableForFormation: true,
    evidenceClasses: basis.sourceEvidenceCompatibility.requiredEvidenceTypes,
    opaqueEvidenceRefs: ['evidence:document:test:v1'],
    resolutionContractVersion: 'DocumentSourceResolutionV1',
    resolutionHash: HASH('document-resolution'),
  };
}

describe('LegalBasisRegistryResolverService — canonical NAFAKA release', () => {
  it.each(RELEASE.legalBases)(
    'resolves $legalBasisCode@1 through the exact immutable release',
    async (basis) => {
      const subtype = subtypeFor(basis);
      const result = await new LegalBasisRegistryResolverService(canonicalArtifacts).resolveExactVersion(
        inputFor(basis),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toMatchObject({
        legalBasisCode: basis.legalBasisCode,
        legalBasisVersion: '1',
        registryReleaseId: 'RCV-LB-R1',
        registryReleaseChecksum: RELEASE_MANIFEST.payloadChecksum,
        status: 'ACTIVE',
        componentCategory: 'PRINCIPAL',
        componentSubtypeCode: subtype.subtypeCode,
        componentSubtypeVersion: '1',
        interestEligibility: 'UNRESOLVED',
        legalReviewRequired: false,
        projectionAuthority: {
          releaseVersion: '1',
          registryId: 'RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY',
          registryVersion: '2',
          registryChecksum: CHECKSUM_MANIFEST.registryChecksum,
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
      });
      expect(result.value.legalBasisChecksum).toMatch(/^[0-9a-f]{64}$/);
      expect(result.value.componentSubtypeChecksum).toMatch(/^[0-9a-f]{64}$/);
      expect(result.value.resolutionHash).toMatch(/^[0-9a-f]{64}$/);
      expect(LEGAL_SUBTYPE_CODES_V1).toContain(result.value.componentSubtypeCode);
    },
  );

  it('returns the same complete binding for the same exact input and release', async () => {
    const resolver = new LegalBasisRegistryResolverService(canonicalArtifacts);
    const input = inputFor(RELEASE.legalBases[1]);
    expect(await resolver.resolveExactVersion(input)).toEqual(await resolver.resolveExactVersion(input));
  });

  it('persists a canonical projection binding through the dormant formation-intent admission path', async () => {
    const basis = RELEASE.legalBases.find((entry) => entry.legalBasisCode === 'TMK_169');
    if (!basis) throw new Error('TMK_169 fixture missing');
    const source = sourceFor(basis);
    const authorization = {
      assertAuthorized: jest.fn(async () => undefined),
    } as unknown as HumanClaimItemFormationAuthorizationPort;
    const documentResolver = {
      resolveExactVersion: jest.fn(async () => source),
    } as unknown as CaseDocumentExactVersionResolverPort;
    const result = {
      intent: { id: 'intent:nafaka' },
      approval: { id: 'approval:nafaka' },
      replayed: false,
    };
    const atomicWriter = {
      createAtomic: jest.fn(async () => result),
    } as unknown as ClaimItemFormationOfficeApprovalAdapter;
    const service = new HumanClaimItemFormationAdmissionService(
      authorization,
      documentResolver,
      new LegalBasisRegistryResolverService(canonicalArtifacts),
      atomicWriter,
      { enabled: true, clock: () => new Date('2026-08-01T00:00:00.000Z') },
    );

    await expect(
      service.admit(
        {
          tenantId: 'tenant:test',
          actorUserId: 'user:test',
          correlationId: 'correlation:test',
        },
        {
          caseId: 'case:test',
          idempotencyKey: 'nafaka:intent:1',
          source: {
            documentId: source.documentId,
            requestedVersionId: source.versionId,
          },
          component: { category: 'PRINCIPAL', subtypeCode: 'INTERIM_MAINTENANCE' },
          legalBasis: { code: 'TMK_169', requestedVersion: '1' },
          money: {
            originalAmountMinor: '10000',
            demandedAmountMinor: '10000',
            currency: 'TRY',
            minorUnit: 2,
          },
          effectiveAt: '2026-08-01T00:00:00.000Z',
          liabilityContext: { payload: LIABILITY },
        },
      ),
    ).resolves.toBe(result);

    const persisted = (atomicWriter.createAtomic as jest.Mock).mock.calls[0][0];
    expect(persisted).toMatchObject({
      componentCategory: 'PRINCIPAL',
      componentSubtypeCode: 'INTERIM_MAINTENANCE',
      componentSubtypeVersion: '1',
      legalBasisCode: 'TMK_169',
      legalBasisVersion: '1',
      legalBasisRegistryReleaseId: 'RCV-LB-R1',
      legalBasisRegistryReleaseChecksum: RELEASE_MANIFEST.payloadChecksum,
      interestEligibility: 'UNRESOLVED',
    });
    const parsed = parseLegalBasisProjectionBindingV1(persisted.legalBasisProjectionBinding);
    expect(parsed.payload.authorityIdentity).toMatchObject({
      registryVersion: 2,
      subtypeCode: 'INTERIM_MAINTENANCE',
      legalBasisCode: 'TMK_169',
    });
    expect(parsed.payload.decisionProjection.claimItemProjection).toEqual({
      itemType: 'PRINCIPAL',
      interestAccrualStatus: 'UNKNOWN',
      interestType: null,
      interestRate: null,
      interestStartDate: null,
      interestStartDateProvenance: null,
      isAllDebtorsLiable: false,
      liableDebtorIds: ['debtor:opaque-1'],
    });
  });

  it.each([
    ['unknown Legal Basis', { legalBasisCode: 'UNKNOWN_LEGAL_BASIS' }, 'VERSION_NOT_FOUND'],
    ['unknown subtype', { componentSubtypeCode: 'UNKNOWN_SUBTYPE' }, 'VERSION_NOT_FOUND'],
    ['wrong exact version', { requestedVersion: '2' }, 'VERSION_NOT_FOUND'],
    ['before effective interval', { effectiveAt: '2026-07-31T23:59:59.999Z' }, 'VERSION_NOT_FOUND'],
    ['component mismatch', { componentCategory: 'COST' }, 'SCOPE_MISMATCH'],
    ['source mismatch', { documentType: 'GENERIC_DOCUMENT' }, 'SCOPE_MISMATCH'],
    ['evidence missing', { evidenceClasses: [] }, 'SCOPE_MISMATCH'],
    ['tenant missing', { tenantId: '' }, 'SCOPE_MISMATCH'],
    ['case missing', { caseId: '' }, 'SCOPE_MISMATCH'],
    ['liability missing', { liabilityContext: {} }, 'SCOPE_MISMATCH'],
    [
      'implicit all-debtor attempt',
      { liabilityContext: { liabilityType: 'TAM', liableDebtorRefs: [], allDebtors: true } },
      'SCOPE_MISMATCH',
    ],
  ] as const)(
    'fails closed for %s',
    async (_label, override, code) => {
      await expect(
        new LegalBasisRegistryResolverService(canonicalArtifacts).resolveExactVersion({
          ...inputFor(),
          ...override,
        } as ResolveExactLegalBasisInput),
      ).resolves.toEqual({ ok: false, failure: { code } });
    },
  );

  it.each(['REVOKED', 'SUPERSEDED'] as const)(
    'returns %s for the exact subtype lifecycle state',
    async (status) => {
      const basis = RELEASE.legalBases[0];
      const subtype = subtypeFor(basis);
      const artifacts = artifactsWithStatus(subtype.subtypeCode, status);
      await expect(
        new LegalBasisRegistryResolverService(() => artifacts).resolveExactVersion(inputFor(basis)),
      ).resolves.toEqual({ ok: false, failure: { code: status } });
    },
  );

  it('distinguishes checksum corruption from authority unavailability', async () => {
    const artifacts = canonicalArtifacts();
    await expect(
      new LegalBasisRegistryResolverService(() => ({
        ...artifacts,
        releaseManifest: { ...artifacts.releaseManifest, payloadChecksum: '0'.repeat(64) },
      })).resolveExactVersion(inputFor()),
    ).resolves.toEqual({ ok: false, failure: { code: 'CHECKSUM_MISMATCH' } });
    await expect(
      new LegalBasisRegistryResolverService(() => {
        throw new Error('unavailable');
      }).resolveExactVersion(inputFor()),
    ).resolves.toEqual({ ok: false, failure: { code: 'AUTHORITY_UNAVAILABLE' } });
  });

  it('keeps the resolver default-disabled and absent from production composition', () => {
    const originalValue = process.env[RECEIVABLE_LEGAL_BASIS_RESOLVER_FLAG];
    try {
      delete process.env[RECEIVABLE_LEGAL_BASIS_RESOLVER_FLAG];
      expect(isLegalBasisResolverEnabled()).toBe(false);
    } finally {
      if (originalValue === undefined) {
        delete process.env[RECEIVABLE_LEGAL_BASIS_RESOLVER_FLAG];
      } else {
        process.env[RECEIVABLE_LEGAL_BASIS_RESOLVER_FLAG] = originalValue;
      }
    }
    expect(
      isLegalBasisResolverEnabled({ [RECEIVABLE_LEGAL_BASIS_RESOLVER_FLAG]: 'true' }),
    ).toBe(true);
    expect(
      isLegalBasisResolverEnabled({ [RECEIVABLE_LEGAL_BASIS_RESOLVER_FLAG]: 'TRUE' }),
    ).toBe(false);

    const moduleSource = fs.readFileSync(
      path.join(PROJECT_ROOT, 'apps/api/src/modules/claim-item/claim-item.module.ts'),
      'utf8',
    );
    expect(moduleSource).not.toContain('LegalBasisRegistryResolverService');
    const productionReferences = productionTypeScriptFiles(
      path.join(PROJECT_ROOT, 'apps/api/src/modules/claim-item'),
    )
      .filter((file) => !file.endsWith('legal-basis-registry-resolver.service.ts'))
      .filter((file) => fs.readFileSync(file, 'utf8').includes('LegalBasisRegistryResolverService'));
    expect(productionReferences).toEqual([]);
  });
});

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
