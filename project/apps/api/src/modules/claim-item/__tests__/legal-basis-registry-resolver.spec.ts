import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  calculateLegalSubtypeRegistryChecksum,
  LegalBasisRegistryResolverService,
  type LegalBasisRegistryResolverArtifactsV1,
  type LegalSubtypeRegistryChecksumManifestV1,
  type LegalSubtypeRegistryEntryV1,
  type LegalSubtypeRegistryV1,
} from '../formation-intent/legal-basis-registry-resolver.service';
import {
  isLegalBasisResolverEnabled,
  RECEIVABLE_LEGAL_BASIS_RESOLVER_FLAG,
} from '../formation-intent/legal-basis-resolver-activation';
import { type ResolveExactLegalBasisInput } from '../formation-intent/claim-item-formation-resolver.ports';

const PROJECT_ROOT = path.resolve(__dirname, '../../../../../..');
const GOVERNANCE_ROOT = path.join(PROJECT_ROOT, 'docs/governance');
const REGISTRY = JSON.parse(
  fs.readFileSync(
    path.join(GOVERNANCE_ROOT, 'receivable-legal-subtype-registry-v1.json'),
    'utf8',
  ),
) as LegalSubtypeRegistryV1;
const CHECKSUM_MANIFEST = JSON.parse(
  fs.readFileSync(
    path.join(GOVERNANCE_ROOT, 'receivable-legal-subtype-registry-v1.checksum.json'),
    'utf8',
  ),
) as LegalSubtypeRegistryChecksumManifestV1;

function canonicalArtifacts(): LegalBasisRegistryResolverArtifactsV1 {
  return {
    registry: REGISTRY,
    checksumManifest: CHECKSUM_MANIFEST,
    computedRegistryChecksum: calculateLegalSubtypeRegistryChecksum(REGISTRY),
  };
}

function artifactsWithStatus(
  status: LegalSubtypeRegistryEntryV1['status'],
): LegalBasisRegistryResolverArtifactsV1 {
  const registry = {
    ...REGISTRY,
    entries: REGISTRY.entries.map((entry, index) => (index === 0 ? { ...entry, status } : entry)),
  } as LegalSubtypeRegistryV1;
  const computedRegistryChecksum = calculateLegalSubtypeRegistryChecksum(registry);
  return {
    registry,
    checksumManifest: { ...CHECKSUM_MANIFEST, registryChecksum: computedRegistryChecksum },
    computedRegistryChecksum,
  };
}

function inputFor(
  entry: LegalSubtypeRegistryEntryV1 = REGISTRY.entries[0],
): ResolveExactLegalBasisInput {
  return {
    tenantId: 'tenant:test',
    caseId: 'case:test',
    legalBasisCode: entry.legalBasisBindings.allowedLegalBasisCodes[0],
    requestedVersion: '1',
    effectiveAt: entry.effectiveFrom,
    componentCategory: entry.canonicalComponentCategory,
    componentSubtypeCode: entry.subtypeCode,
    documentType: 'TEST_DOCUMENT',
    evidenceClasses: entry.requiredEvidenceTypes,
    liabilityContext: { liabilityType: 'TAM' },
  };
}

describe('LegalBasisRegistryResolverService', () => {
  it.each(REGISTRY.entries)(
    'characterizes $subtypeCode without inventing a ClaimItem projection',
    async (entry) => {
      const result = await new LegalBasisRegistryResolverService(canonicalArtifacts).resolveExactVersion(
        inputFor(entry),
      );
      expect(result).toEqual({ ok: false, failure: { code: 'VERSION_NOT_FOUND' } });
    },
  );

  it('returns VERSION_NOT_FOUND for an unknown Legal Basis code or subtype code', async () => {
    const resolver = new LegalBasisRegistryResolverService(canonicalArtifacts);
    await expect(
      resolver.resolveExactVersion({ ...inputFor(), legalBasisCode: 'UNKNOWN_LEGAL_BASIS' }),
    ).resolves.toEqual({ ok: false, failure: { code: 'VERSION_NOT_FOUND' } });
    await expect(
      resolver.resolveExactVersion({ ...inputFor(), componentSubtypeCode: 'UNKNOWN_SUBTYPE' }),
    ).resolves.toEqual({ ok: false, failure: { code: 'VERSION_NOT_FOUND' } });
  });

  it('returns VERSION_NOT_FOUND outside the entry effective interval', async () => {
    const resolver = new LegalBasisRegistryResolverService(canonicalArtifacts);
    await expect(
      resolver.resolveExactVersion({ ...inputFor(), effectiveAt: '2026-07-25T23:59:59.999Z' }),
    ).resolves.toEqual({ ok: false, failure: { code: 'VERSION_NOT_FOUND' } });
  });

  it.each(['REVOKED', 'SUPERSEDED'] as const)(
    'returns %s for the matching lifecycle status',
    async (status) => {
      const artifacts = artifactsWithStatus(status);
      await expect(
        new LegalBasisRegistryResolverService(() => artifacts).resolveExactVersion(
          inputFor(artifacts.registry.entries[0]),
        ),
      ).resolves.toEqual({ ok: false, failure: { code: status } });
    },
  );

  it('returns the same result for the same input and registry state', async () => {
    const resolver = new LegalBasisRegistryResolverService(canonicalArtifacts);
    const input = inputFor(REGISTRY.entries[1]);
    const first = await resolver.resolveExactVersion(input);
    const second = await resolver.resolveExactVersion(input);
    expect(second).toEqual(first);
  });

  it('keeps the resolver flag disabled by default', () => {
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
  });

  it('returns AUTHORITY_UNAVAILABLE when the checksum manifest is corrupted', async () => {
    const artifacts = canonicalArtifacts();
    const corrupted: LegalBasisRegistryResolverArtifactsV1 = {
      ...artifacts,
      checksumManifest: { ...artifacts.checksumManifest, registryChecksum: '0'.repeat(64) },
    };
    await expect(
      new LegalBasisRegistryResolverService(() => corrupted).resolveExactVersion(inputFor()),
    ).resolves.toEqual({ ok: false, failure: { code: 'AUTHORITY_UNAVAILABLE' } });
  });
});
