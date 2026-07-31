import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ClaimItemType, InterestAccrualStatus } from '@prisma/client';
import { type ClaimItemFormationComponentCategory } from './claim-item-formation-intent.contract';
import {
  LegalBasisExactVersionResolverPort,
  type LegalBasisDecisionProjectionSourceV1,
  type ResolveExactLegalBasisFailureCode,
  type ResolveExactLegalBasisInput,
  type ResolveExactLegalBasisResult,
} from './claim-item-formation-resolver.ports';

const REGISTRY_FILE = 'receivable-legal-subtype-registry-v2.json';
const CHECKSUM_FILE = 'receivable-legal-subtype-registry-v2.checksum.json';
const RELEASE_FILE = 'receivable-legal-basis-release-r1.json';
const RELEASE_MANIFEST_FILE = 'receivable-legal-basis-release-r1.manifest.json';
const VALIDATOR_FILE = 'validate-receivable-nafaka-legal-basis-release.cjs';
const REGISTRY_ID = 'RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY';
const RESOLUTION_CONTRACT_VERSION = 'NafakaLegalBasisExactVersionResolutionV1';
const SHA256_HEX = /^[0-9a-f]{64}$/;
const OPAQUE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const LIABILITY_TYPES = new Set(['KISMI', 'SINIRLI', 'TAM']);

export interface LegalSubtypeRegistryEntryV2 {
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

export interface LegalSubtypeRegistryV2 {
  readonly entries: readonly LegalSubtypeRegistryEntryV2[];
  readonly registryId: typeof REGISTRY_ID;
  readonly registryStatus: 'RATIFIED';
  readonly registryVersion: 2;
  readonly runtimeStatus: 'DORMANT';
  readonly serializationAlgorithm: 'RCV-LEGAL-SUBTYPE-REGISTRY-CANONICAL-JSON-V1';
}

export interface LegalSubtypeRegistryChecksumManifestV2 {
  readonly checksumAlgorithm: 'SHA-256';
  readonly entryCount: number;
  readonly generatedFromCanonicalPayload: typeof REGISTRY_FILE;
  readonly registryChecksum: string;
  readonly registryId: typeof REGISTRY_ID;
  readonly registryVersion: 2;
  readonly serializationAlgorithm: 'RCV-LEGAL-SUBTYPE-REGISTRY-CANONICAL-JSON-V1';
}

export interface NafakaLegalBasisReleaseEntryV1 {
  readonly allowedComponentCategories: readonly ClaimItemFormationComponentCategory[];
  readonly effectiveFrom: string;
  readonly interestEligibility: Readonly<{
    readonly automaticInterest: false;
    readonly formationProjection: 'UNKNOWN';
    readonly rule: string;
  }>;
  readonly legalBasisCode: string;
  readonly legalBasisVersion: string;
  readonly liabilityCompatibility: Readonly<{
    readonly allowedLiabilityTypes: readonly string[];
    readonly implicitAllDebtors: 'PROHIBITED';
    readonly scopes: readonly string[];
  }>;
  readonly sourceEvidenceCompatibility: Readonly<{
    readonly allowedSourceTypes: readonly string[];
    readonly combinationRule: 'ALL_ENTRY_REQUIREMENTS_AND_EXACT_SOURCE';
    readonly requiredEvidenceTypes: readonly string[];
  }>;
  readonly subtypeRegistryBinding: Readonly<{
    readonly allowedSubtypeCodes: readonly string[];
    readonly registryChecksum: string;
    readonly registryId: typeof REGISTRY_ID;
    readonly registryVersion: '2';
  }>;
}

export interface NafakaLegalBasisReleaseV1 {
  readonly contentAuthority: Readonly<{
    readonly decisionPackId: string;
    readonly decisionPackSha256: string;
    readonly decisionPackVersion: string;
  }>;
  readonly effectiveAt: string;
  readonly legalBases: readonly NafakaLegalBasisReleaseEntryV1[];
  readonly previousRelease: null;
  readonly releaseId: 'RCV-LB-R1';
  readonly releaseVersion: '1';
  readonly schemaVersion: 'RECEIVABLE_LEGAL_BASIS_RELEASE_V1';
  readonly supersedesReleaseIds: readonly string[];
}

export interface NafakaLegalBasisReleaseManifestV1 {
  readonly contentRatification: Readonly<{
    readonly decisionPackSha256: string;
    readonly status: 'OWNER_LEGAL_AUTHORITY_RATIFIED';
  }>;
  readonly entryChecksums: readonly Readonly<{
    readonly checksum: string;
    readonly legalBasisCode: string;
    readonly legalBasisVersion: string;
  }>[];
  readonly manifestSchemaVersion: 'RECEIVABLE_LEGAL_BASIS_RELEASE_MANIFEST_V1';
  readonly payloadChecksum: string;
  readonly releaseId: 'RCV-LB-R1';
  readonly releaseVersion: '1';
  readonly runtimeStatus: 'DORMANT_DEFAULT_OFF';
  readonly signatureStatus: 'PENDING_NOT_EXECUTED';
  readonly signatures: readonly unknown[];
}

export interface LegalBasisRegistryResolverArtifactsV2 {
  readonly registry: LegalSubtypeRegistryV2;
  readonly checksumManifest: LegalSubtypeRegistryChecksumManifestV2;
  readonly release: NafakaLegalBasisReleaseV1;
  readonly releaseManifest: NafakaLegalBasisReleaseManifestV1;
  readonly computedRegistryChecksum: string;
  readonly computedReleaseChecksum: string;
}

type RegistryArtifactsProvider = () => LegalBasisRegistryResolverArtifactsV2;

interface ReleaseValidatorModule {
  readonly canonicalize: (value: unknown) => string;
  readonly validateRepository: () => Readonly<{
    entryCount: number;
    registryChecksum: string;
    registryEntryCount: number;
    releaseChecksum: string;
  }>;
}

interface ExactLiabilityContext {
  readonly liabilityType: string;
  readonly liableDebtorRefs: readonly string[];
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
      fs.existsSync(path.join(candidate, 'docs/governance', RELEASE_FILE)) &&
      fs.existsSync(path.join(candidate, 'scripts/governance', VALIDATOR_FILE))
    ) {
      return candidate;
    }
  }
  throw new Error('RECEIVABLE Legal Basis release root is unavailable');
}

function releaseValidator(): ReleaseValidatorModule {
  const validatorPath = path.join(findProjectRoot(), 'scripts/governance', VALIDATOR_FILE);
  // Canonical governance validator is a CommonJS module loaded from the resolved project root.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(validatorPath) as ReleaseValidatorModule;
}

export function calculateCanonicalLegalBasisArtifactChecksum(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(Buffer.from(releaseValidator().canonicalize(value), 'utf8'))
    .digest('hex');
}

export function calculateLegalSubtypeRegistryChecksum(registry: LegalSubtypeRegistryV2): string {
  return calculateCanonicalLegalBasisArtifactChecksum(registry);
}

function readCanonicalArtifacts(): LegalBasisRegistryResolverArtifactsV2 {
  const projectRoot = findProjectRoot();
  const governanceRoot = path.join(projectRoot, 'docs/governance');
  const validation = releaseValidator().validateRepository();
  const registry = readJson<LegalSubtypeRegistryV2>(governanceRoot, REGISTRY_FILE);
  const checksumManifest = readJson<LegalSubtypeRegistryChecksumManifestV2>(
    governanceRoot,
    CHECKSUM_FILE,
  );
  const release = readJson<NafakaLegalBasisReleaseV1>(governanceRoot, RELEASE_FILE);
  const releaseManifest = readJson<NafakaLegalBasisReleaseManifestV1>(
    governanceRoot,
    RELEASE_MANIFEST_FILE,
  );
  return {
    registry,
    checksumManifest,
    release,
    releaseManifest,
    computedRegistryChecksum: validation.registryChecksum,
    computedReleaseChecksum: validation.releaseChecksum,
  };
}

function readJson<T>(root: string, fileName: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, fileName), 'utf8')) as T;
}

function failure(code: ResolveExactLegalBasisFailureCode): ResolveExactLegalBasisResult {
  return { ok: false, failure: { code } };
}

function authorityFailure(
  artifacts: LegalBasisRegistryResolverArtifactsV2,
): ResolveExactLegalBasisFailureCode | null {
  const {
    registry,
    checksumManifest,
    release,
    releaseManifest,
    computedRegistryChecksum,
    computedReleaseChecksum,
  } = artifacts;
  if (
    !SHA256_HEX.test(computedRegistryChecksum) ||
    !SHA256_HEX.test(computedReleaseChecksum) ||
    checksumManifest.registryChecksum !== computedRegistryChecksum ||
    releaseManifest.payloadChecksum !== computedReleaseChecksum
  ) {
    return 'CHECKSUM_MISMATCH';
  }
  if (
    registry.registryId !== REGISTRY_ID ||
    registry.registryVersion !== 2 ||
    registry.registryStatus !== 'RATIFIED' ||
    registry.runtimeStatus !== 'DORMANT' ||
    checksumManifest.registryId !== registry.registryId ||
    checksumManifest.registryVersion !== registry.registryVersion ||
    checksumManifest.serializationAlgorithm !== registry.serializationAlgorithm ||
    checksumManifest.entryCount !== registry.entries.length ||
    checksumManifest.generatedFromCanonicalPayload !== REGISTRY_FILE ||
    release.releaseId !== 'RCV-LB-R1' ||
    release.releaseVersion !== '1' ||
    release.schemaVersion !== 'RECEIVABLE_LEGAL_BASIS_RELEASE_V1' ||
    release.previousRelease !== null ||
    release.supersedesReleaseIds.length !== 0 ||
    releaseManifest.releaseId !== release.releaseId ||
    releaseManifest.releaseVersion !== release.releaseVersion ||
    releaseManifest.runtimeStatus !== 'DORMANT_DEFAULT_OFF' ||
    releaseManifest.signatureStatus !== 'PENDING_NOT_EXECUTED' ||
    releaseManifest.signatures.length !== 0 ||
    releaseManifest.contentRatification.status !== 'OWNER_LEGAL_AUTHORITY_RATIFIED' ||
    releaseManifest.contentRatification.decisionPackSha256 !==
      release.contentAuthority.decisionPackSha256 ||
    releaseManifest.entryChecksums.length !== release.legalBases.length
  ) {
    return 'AUTHORITY_UNAVAILABLE';
  }
  if (
    release.legalBases.some(
      (basis) =>
        basis.subtypeRegistryBinding.registryId !== registry.registryId ||
        basis.subtypeRegistryBinding.registryVersion !== String(registry.registryVersion) ||
        basis.subtypeRegistryBinding.registryChecksum !== computedRegistryChecksum,
    )
  ) {
    return 'CHECKSUM_MISMATCH';
  }
  return null;
}

function isEffectiveAt(fromValue: string, untilValue: string | null, effectiveAt: string): boolean {
  const at = Date.parse(effectiveAt);
  const from = Date.parse(fromValue);
  const until = untilValue === null ? null : Date.parse(untilValue);
  return (
    Number.isFinite(at) &&
    Number.isFinite(from) &&
    (until === null || Number.isFinite(until)) &&
    at >= from &&
    (until === null || at < until)
  );
}

function exactOpaqueList(value: unknown, allowEmpty = false): readonly string[] | null {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.length > 32 ||
    value.some((entry) => typeof entry !== 'string' || !OPAQUE_REFERENCE.test(entry)) ||
    new Set(value).size !== value.length
  ) {
    return null;
  }
  return Object.freeze([...(value as string[])].sort());
}

function parseLiabilityContext(value: unknown): ExactLiabilityContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'liabilityType,liableDebtorRefs') return null;
  if (typeof record.liabilityType !== 'string' || !LIABILITY_TYPES.has(record.liabilityType)) {
    return null;
  }
  const liableDebtorRefs = exactOpaqueList(record.liableDebtorRefs);
  if (!liableDebtorRefs) return null;
  return Object.freeze({ liabilityType: record.liabilityType, liableDebtorRefs });
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join('\u0000') === [...right].sort().join('\u0000');
}

/**
 * Standalone CONTROLLED DEFAULT-OFF implementation. It is intentionally not
 * registered in claim-item.module.ts and performs no signature/key verification.
 * The exact release validator pins content, checksum and dormant authority before
 * this resolver can return a binding.
 */
export class LegalBasisRegistryResolverService extends LegalBasisExactVersionResolverPort {
  constructor(private readonly artifactsProvider: RegistryArtifactsProvider = readCanonicalArtifacts) {
    super();
  }

  async resolveExactVersion(
    input: ResolveExactLegalBasisInput,
  ): Promise<ResolveExactLegalBasisResult> {
    if (!OPAQUE_REFERENCE.test(input.tenantId) || !OPAQUE_REFERENCE.test(input.caseId)) {
      return failure('SCOPE_MISMATCH');
    }
    const evidenceClasses = exactOpaqueList(input.evidenceClasses, true);
    const liability = parseLiabilityContext(input.liabilityContext);
    if (!OPAQUE_REFERENCE.test(input.documentType) || !evidenceClasses || !liability) {
      return failure('SCOPE_MISMATCH');
    }

    let artifacts: LegalBasisRegistryResolverArtifactsV2;
    try {
      artifacts = this.artifactsProvider();
    } catch {
      return failure('AUTHORITY_UNAVAILABLE');
    }
    const unavailable = authorityFailure(artifacts);
    if (unavailable) return failure(unavailable);

    const basisMatches = artifacts.release.legalBases.filter(
      (candidate) =>
        candidate.legalBasisCode === input.legalBasisCode &&
        candidate.legalBasisVersion === input.requestedVersion,
    );
    if (basisMatches.length === 0) return failure('VERSION_NOT_FOUND');
    if (basisMatches.length !== 1) return failure('AUTHORITY_UNAVAILABLE');
    const basis = basisMatches[0];

    const subtypeMatches = artifacts.registry.entries.filter(
      (candidate) => candidate.subtypeCode === input.componentSubtypeCode,
    );
    if (subtypeMatches.length === 0) return failure('VERSION_NOT_FOUND');
    if (subtypeMatches.length !== 1) return failure('AUTHORITY_UNAVAILABLE');
    const subtype = subtypeMatches[0];

    if (subtype.status === 'REVOKED') return failure('REVOKED');
    if (subtype.status === 'SUPERSEDED') return failure('SUPERSEDED');
    if (
      basis.effectiveFrom !== artifacts.release.effectiveAt ||
      subtype.effectiveFrom !== basis.effectiveFrom ||
      !isEffectiveAt(basis.effectiveFrom, subtype.effectiveUntil, input.effectiveAt)
    ) {
      return failure('VERSION_NOT_FOUND');
    }

    const entryChecksum = artifacts.releaseManifest.entryChecksums.find(
      (candidate) =>
        candidate.legalBasisCode === basis.legalBasisCode &&
        candidate.legalBasisVersion === basis.legalBasisVersion,
    );
    if (
      !entryChecksum ||
      entryChecksum.checksum !== calculateCanonicalLegalBasisArtifactChecksum(basis)
    ) {
      return failure('CHECKSUM_MISMATCH');
    }

    if (
      input.componentCategory !== 'PRINCIPAL' ||
      subtype.canonicalComponentCategory !== input.componentCategory ||
      !basis.allowedComponentCategories.includes(input.componentCategory) ||
      !basis.subtypeRegistryBinding.allowedSubtypeCodes.includes(subtype.subtypeCode) ||
      !subtype.legalBasisBindings.allowedLegalBasisCodes.includes(basis.legalBasisCode) ||
      !basis.sourceEvidenceCompatibility.allowedSourceTypes.includes(input.documentType) ||
      basis.sourceEvidenceCompatibility.requiredEvidenceTypes.some(
        (required) => !evidenceClasses.includes(required),
      ) ||
      !sameStringSet(
        basis.sourceEvidenceCompatibility.requiredEvidenceTypes,
        subtype.requiredEvidenceTypes,
      ) ||
      !basis.liabilityCompatibility.allowedLiabilityTypes.includes(liability.liabilityType) ||
      !subtype.liabilityCompatibility.allowedLiabilityTypes.includes(liability.liabilityType) ||
      basis.liabilityCompatibility.implicitAllDebtors !== 'PROHIBITED' ||
      basis.interestEligibility.automaticInterest !== false ||
      basis.interestEligibility.formationProjection !== 'UNKNOWN'
    ) {
      return failure('SCOPE_MISMATCH');
    }

    const componentSubtypeChecksum = calculateCanonicalLegalBasisArtifactChecksum(subtype);
    const decisionProjection: LegalBasisDecisionProjectionSourceV1 = Object.freeze({
      legalCharacter: subtype.legalCharacter,
      legalBasisBinding: subtype.legalBasisBindings,
      requiredSourceTypes: subtype.requiredSourceTypes,
      requiredEvidenceTypes: subtype.requiredEvidenceTypes,
      liabilityCompatibility: subtype.liabilityCompatibility,
      interestEligibility: subtype.interestEligibility,
      amountSemantics: subtype.amountSemantics,
      currencySemantics: subtype.currencySemantics,
      calculationSemantics: subtype.calculationSemantics,
      allowedFormationPaths: subtype.allowedFormationPaths,
      forbiddenFormationPaths: subtype.forbiddenFormationPaths,
      admissionRequirements: subtype.admissionRequirements,
      finalizationRequirements: subtype.finalizationRequirements,
      snapshotRequirements: subtype.snapshotRequirements,
    });
    const claimItemProjection = Object.freeze({
      itemType: ClaimItemType.PRINCIPAL,
      interestAccrualStatus: InterestAccrualStatus.UNKNOWN,
      interestType: null,
      interestRate: null,
      interestStartDate: null,
      interestStartDateProvenance: null,
      isAllDebtorsLiable: false,
      liableDebtorIds: liability.liableDebtorRefs,
    });
    const resolutionHash = calculateCanonicalLegalBasisArtifactChecksum({
      caseId: input.caseId,
      claimItemProjection,
      componentSubtypeChecksum,
      decisionProjection,
      documentType: input.documentType,
      effectiveAt: input.effectiveAt,
      evidenceClasses,
      legalBasisChecksum: entryChecksum.checksum,
      liability,
      registryChecksum: artifacts.computedRegistryChecksum,
      releaseChecksum: artifacts.computedReleaseChecksum,
      resolutionContractVersion: RESOLUTION_CONTRACT_VERSION,
      tenantId: input.tenantId,
    });

    return {
      ok: true,
      value: Object.freeze({
        legalBasisCode: basis.legalBasisCode,
        legalBasisVersion: basis.legalBasisVersion,
        legalBasisChecksum: entryChecksum.checksum,
        registryReleaseId: artifacts.release.releaseId,
        registryReleaseChecksum: artifacts.computedReleaseChecksum,
        status: 'ACTIVE',
        effectiveFrom: basis.effectiveFrom,
        effectiveTo: subtype.effectiveUntil,
        subtypeRecognized: true,
        componentCategory: subtype.canonicalComponentCategory,
        componentSubtypeCode: subtype.subtypeCode,
        componentSubtypeVersion: String(subtype.subtypeVersion),
        componentSubtypeChecksum,
        allowedDocumentTypes: basis.sourceEvidenceCompatibility.allowedSourceTypes,
        requiredEvidenceClasses: basis.sourceEvidenceCompatibility.requiredEvidenceTypes,
        liabilityCompatible: true,
        interestEligibility: 'UNRESOLVED',
        interestPolicyRef: null,
        interestPolicyVersion: null,
        ruleRef: null,
        ruleVersion: null,
        legalReviewRequired: false,
        resolutionContractVersion: RESOLUTION_CONTRACT_VERSION,
        resolutionHash,
        projectionAuthority: Object.freeze({
          releaseVersion: artifacts.release.releaseVersion,
          registryId: REGISTRY_ID,
          registryVersion: String(artifacts.registry.registryVersion),
          registryChecksum: artifacts.computedRegistryChecksum,
        }),
        decisionProjection,
        claimItemProjection,
      }),
    };
  }
}
