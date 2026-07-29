import * as fs from 'node:fs';
import * as path from 'node:path';
import { type ClaimItemFormationComponentCategory } from './claim-item-formation-intent.contract';
import {
  LegalBasisExactVersionResolverPort,
  type LegalBasisDecisionProjectionSourceV1,
  type ResolveExactLegalBasisFailureCode,
  type ResolveExactLegalBasisInput,
  type ResolveExactLegalBasisResult,
} from './claim-item-formation-resolver.ports';

const REGISTRY_FILE = 'receivable-legal-subtype-registry-v1.json';
const CHECKSUM_FILE = 'receivable-legal-subtype-registry-v1.checksum.json';
const VALIDATOR_FILE = 'validate-receivable-legal-subtype-registry.cjs';
const SHA256_HEX = /^[0-9a-f]{64}$/;

export interface LegalSubtypeRegistryEntryV1 {
  readonly subtypeCode: string;
  readonly subtypeVersion: number;
  readonly status: 'RATIFIED' | 'REVOKED' | 'SUPERSEDED';
  readonly canonicalComponentCategory: ClaimItemFormationComponentCategory;
  readonly legalCharacter: string;
  readonly legalBasisBindings: LegalBasisDecisionProjectionSourceV1['legalBasisBinding'];
  readonly requiredSourceTypes: readonly string[];
  readonly requiredEvidenceTypes: readonly string[];
  readonly liabilityCompatibility: LegalBasisDecisionProjectionSourceV1['liabilityCompatibility'];
  readonly interestEligibility: LegalBasisDecisionProjectionSourceV1['interestEligibility'];
  readonly amountSemantics: LegalBasisDecisionProjectionSourceV1['amountSemantics'];
  readonly currencySemantics: LegalBasisDecisionProjectionSourceV1['currencySemantics'];
  readonly calculationSemantics: LegalBasisDecisionProjectionSourceV1['calculationSemantics'];
  readonly allowedFormationPaths: readonly string[];
  readonly forbiddenFormationPaths: readonly string[];
  readonly admissionRequirements: readonly string[];
  readonly finalizationRequirements: readonly string[];
  readonly snapshotRequirements: readonly string[];
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
}

export interface LegalSubtypeRegistryV1 {
  readonly entries: readonly LegalSubtypeRegistryEntryV1[];
  readonly registryId: 'RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY';
  readonly registryStatus: 'RATIFIED';
  readonly registryVersion: 1;
  readonly runtimeStatus: 'DORMANT';
  readonly serializationAlgorithm: 'RCV-LEGAL-SUBTYPE-REGISTRY-CANONICAL-JSON-V1';
}

export interface LegalSubtypeRegistryChecksumManifestV1 {
  readonly checksumAlgorithm: 'SHA-256';
  readonly entryCount: number;
  readonly generatedFromCanonicalPayload: typeof REGISTRY_FILE;
  readonly registryChecksum: string;
  readonly registryId: 'RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY';
  readonly registryVersion: 1;
  readonly serializationAlgorithm: 'RCV-LEGAL-SUBTYPE-REGISTRY-CANONICAL-JSON-V1';
}

export interface LegalBasisRegistryResolverArtifactsV1 {
  readonly registry: LegalSubtypeRegistryV1;
  readonly checksumManifest: LegalSubtypeRegistryChecksumManifestV1;
  readonly computedRegistryChecksum: string;
}

type RegistryArtifactsProvider = () => LegalBasisRegistryResolverArtifactsV1;

interface RegistryValidatorModule {
  readonly registryChecksum: (registry: unknown) => string;
  readonly validateRepository: () => Readonly<{ checksum: string; entryCount: number }>;
}

function findProjectRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), '../..'),
    process.cwd(),
    path.resolve(process.cwd(), 'project'),
    path.resolve(__dirname, '../../../../../..'),
  ];
  for (const candidate of new Set(candidates)) {
    if (
      fs.existsSync(path.join(candidate, 'docs/governance', REGISTRY_FILE)) &&
      fs.existsSync(path.join(candidate, 'scripts/governance', VALIDATOR_FILE))
    ) {
      return candidate;
    }
  }
  throw new Error('RECEIVABLE legal subtype registry root is unavailable');
}

function registryValidator(): RegistryValidatorModule {
  const validatorPath = path.join(findProjectRoot(), 'scripts/governance', VALIDATOR_FILE);
  return require(validatorPath) as RegistryValidatorModule;
}

export function calculateLegalSubtypeRegistryChecksum(registry: LegalSubtypeRegistryV1): string {
  return registryValidator().registryChecksum(registry);
}

function readCanonicalArtifacts(): LegalBasisRegistryResolverArtifactsV1 {
  const projectRoot = findProjectRoot();
  const governanceRoot = path.join(projectRoot, 'docs/governance');
  const validation = registryValidator().validateRepository();
  const registry = JSON.parse(
    fs.readFileSync(path.join(governanceRoot, REGISTRY_FILE), 'utf8'),
  ) as LegalSubtypeRegistryV1;
  const checksumManifest = JSON.parse(
    fs.readFileSync(path.join(governanceRoot, CHECKSUM_FILE), 'utf8'),
  ) as LegalSubtypeRegistryChecksumManifestV1;
  return {
    registry,
    checksumManifest,
    computedRegistryChecksum: validation.checksum,
  };
}

function failure(code: ResolveExactLegalBasisFailureCode): ResolveExactLegalBasisResult {
  return { ok: false, failure: { code } };
}

function isAuthorityAvailable(artifacts: LegalBasisRegistryResolverArtifactsV1): boolean {
  const { registry, checksumManifest, computedRegistryChecksum } = artifacts;
  return (
    SHA256_HEX.test(computedRegistryChecksum) &&
    checksumManifest.registryChecksum === computedRegistryChecksum &&
    checksumManifest.registryId === registry.registryId &&
    checksumManifest.registryVersion === registry.registryVersion &&
    checksumManifest.serializationAlgorithm === registry.serializationAlgorithm &&
    checksumManifest.entryCount === registry.entries.length
  );
}

function isEffectiveAt(entry: LegalSubtypeRegistryEntryV1, effectiveAt: string): boolean {
  const at = Date.parse(effectiveAt);
  const from = Date.parse(entry.effectiveFrom);
  const until = entry.effectiveUntil === null ? null : Date.parse(entry.effectiveUntil);
  return (
    Number.isFinite(at) &&
    Number.isFinite(from) &&
    (until === null || Number.isFinite(until)) &&
    at >= from &&
    (until === null || at < until)
  );
}

/**
 * Standalone CONTROLLED DEFAULT-OFF implementation. It is intentionally not
 * registered in claim-item.module.ts and performs no signature/key verification.
 */
export class LegalBasisRegistryResolverService extends LegalBasisExactVersionResolverPort {
  constructor(private readonly artifactsProvider: RegistryArtifactsProvider = readCanonicalArtifacts) {
    super();
  }

  async resolveExactVersion(
    input: ResolveExactLegalBasisInput,
  ): Promise<ResolveExactLegalBasisResult> {
    let artifacts: LegalBasisRegistryResolverArtifactsV1;
    try {
      artifacts = this.artifactsProvider();
    } catch {
      return failure('AUTHORITY_UNAVAILABLE');
    }
    if (!isAuthorityAvailable(artifacts)) return failure('AUTHORITY_UNAVAILABLE');

    const entry = artifacts.registry.entries.find(
      (candidate) =>
        candidate.subtypeCode === input.componentSubtypeCode &&
        candidate.legalBasisBindings.allowedLegalBasisCodes.includes(input.legalBasisCode),
    );
    if (!entry || !isEffectiveAt(entry, input.effectiveAt)) {
      return failure('VERSION_NOT_FOUND');
    }
    if (entry.status === 'REVOKED') return failure('REVOKED');
    if (entry.status === 'SUPERSEDED') return failure('SUPERSEDED');

    /*
     * SR01's closed schema supplies canonicalComponentCategory but none of the
     * eight exact ClaimItem persistence projection fields required by
     * ExactLegalBasisBindingV1.claimItemProjection. Mapping those fields from a
     * label, category or legacy enum would invent legal semantics, so the
     * controlled resolver must remain fail-closed until that mapping is
     * explicitly ratified in the registry authority.
     */
    return failure('VERSION_NOT_FOUND');
  }
}
