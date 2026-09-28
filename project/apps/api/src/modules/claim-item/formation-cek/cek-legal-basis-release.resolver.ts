import * as fs from 'node:fs';
import * as path from 'node:path';
import { ClaimItemType, InterestAccrualStatus } from '@prisma/client';
import { type ClaimItemFormationComponentCategory } from '../formation-intent/claim-item-formation-intent.contract';
import {
  LegalBasisExactVersionResolverPort,
  type LegalBasisDecisionProjectionSourceV1,
  type ResolveExactLegalBasisFailureCode,
  type ResolveExactLegalBasisInput,
  type ResolveExactLegalBasisResult,
} from '../formation-intent/claim-item-formation-resolver.ports';

const VALIDATOR_FILE = 'validate-receivable-cek-legal-basis-release-r2.cjs';
const RESOLUTION_CONTRACT_VERSION = 'CekLegalBasisExactVersionResolutionV1';
const REGISTRY_ID = 'RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY';
const OPAQUE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const DRAFT_STATUS = 'DRAFT_PENDING_OWNER_LEGAL_RATIFICATION';
const RATIFIED_STATUS = 'OWNER_LEGAL_AUTHORITY_RATIFIED';

/** Alt tür → ClaimItem kalem türü (taslak içerikle birebir; başka alt tür DESTEKLENMEZ). */
const CEK_ITEM_TYPE: Readonly<Record<string, ClaimItemType>> = Object.freeze({
  CHECK_PRINCIPAL: ClaimItemType.PRINCIPAL,
  CHECK_PENALTY: ClaimItemType.CHECK_PENALTY,
});

interface CekSubtypeEntry {
  readonly subtypeCode: string;
  readonly subtypeVersion: number;
  readonly status: string;
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

interface CekLegalBasisEntry {
  readonly legalBasisCode: string;
  readonly legalBasisVersion: string;
  readonly effectiveFrom: string;
  readonly allowedComponentCategories: readonly ClaimItemFormationComponentCategory[];
  readonly sourceEvidenceCompatibility: Readonly<{
    allowedSourceTypes: readonly string[];
    requiredEvidenceTypes: readonly string[];
  }>;
  readonly liabilityCompatibility: Readonly<{
    allowedLiabilityTypes: readonly string[];
    implicitAllDebtors: string;
  }>;
  readonly interestEligibility: Readonly<{ automaticInterest: boolean; formationProjection: string }>;
  readonly subtypeRegistryBinding: Readonly<{ allowedSubtypeCodes: readonly string[] }>;
  readonly calculation?: Readonly<{ percentOfPrincipalBasisPoints: number; rounding: string }>;
}

export interface CekLegalBasisArtifactsV1 {
  readonly registry: Readonly<{ registryVersion: number; entries: readonly CekSubtypeEntry[] }>;
  readonly release: Readonly<{ releaseId: string; releaseVersion: string; effectiveAt: string; legalBases: readonly CekLegalBasisEntry[] }>;
  readonly validation: Readonly<{
    registryChecksum: string;
    releaseChecksum: string;
    entryChecksums: readonly Readonly<{ checksum: string; legalBasisCode: string; legalBasisVersion: string }>[];
    ratificationStatus: string;
  }>;
}

interface CekValidatorModule {
  readonly readArtifacts: () => Record<string, any>;
  readonly validateArtifacts: (artifacts: Record<string, any>) => CekLegalBasisArtifactsV1['validation'];
  readonly canonicalChecksum: (value: unknown) => string;
}

function findValidatorPath(): string {
  const candidates = [
    path.resolve(process.cwd(), '../../scripts/governance', VALIDATOR_FILE),
    path.resolve(process.cwd(), 'scripts/governance', VALIDATOR_FILE),
    path.resolve(process.cwd(), 'project/scripts/governance', VALIDATOR_FILE),
    path.resolve(__dirname, '../../../../../../scripts/governance', VALIDATOR_FILE),
  ];
  for (const candidate of new Set(candidates)) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('RCV-LB-R2-CEK validator is unavailable');
}

function validator(): CekValidatorModule {
  // Kanonik governance doğrulayıcısı proje kökünden CommonJS olarak yüklenir (R1 çözücüsüyle aynı desen).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(findValidatorPath()) as CekValidatorModule;
}

function readCanonicalCekArtifacts(): CekLegalBasisArtifactsV1 {
  const module = validator();
  const raw = module.readArtifacts();
  const validation = module.validateArtifacts(raw);
  return { registry: raw.registry, release: raw.release, validation };
}

export function cekArtifactChecksum(value: unknown): string {
  return validator().canonicalChecksum(value);
}

export interface CekLegalBasisReleaseResolverOptions {
  /**
   * TASLAK hukuki içeriğin (owner ratifikasyonu bekleyen) kabulü. YALNIZ geliştirme/test ortamında açılır; üretimde
   * kapalıdır → taslak statüde çözücü AUTHORITY_UNAVAILABLE döner.
   */
  readonly allowDraftContent?: boolean;
  readonly artifactsProvider?: () => CekLegalBasisArtifactsV1;
}

function failure(code: ResolveExactLegalBasisFailureCode): ResolveExactLegalBasisResult {
  return { ok: false, failure: { code } };
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

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join('\u0000') === [...right].sort().join('\u0000');
}

/**
 * K3 AUTO-GENERATE FORMATION (owner GO + kararları 2026-09-28) — karşılıksız çek hukuki dayanak çözücüsü
 * (`RCV-LB-R2-CEK`). Kanonik doğrulayıcı içerik + checksum'ları pinlemeden bağlama DÖNMEZ. Yalnız
 * `CHECK_PRINCIPAL` (→ PRINCIPAL) ve `CHECK_PENALTY` (→ CHECK_PENALTY) alt türlerini, `CEK` kaynak türünü ve
 * açık `TAM` sorumluluk bağlamını kabul eder; faiz işletimi UNKNOWN doğar (ayrı onaylı güncelleme). Taslak içerik
 * yalnız `allowDraftContent` ile kabul edilir.
 */
export class CekLegalBasisReleaseResolverService extends LegalBasisExactVersionResolverPort {
  private readonly allowDraftContent: boolean;
  private readonly artifactsProvider: () => CekLegalBasisArtifactsV1;

  constructor(options: CekLegalBasisReleaseResolverOptions = {}) {
    super();
    this.allowDraftContent = options.allowDraftContent ?? false;
    this.artifactsProvider = options.artifactsProvider ?? readCanonicalCekArtifacts;
  }

  async resolveExactVersion(input: ResolveExactLegalBasisInput): Promise<ResolveExactLegalBasisResult> {
    if (!OPAQUE_REFERENCE.test(input.tenantId) || !OPAQUE_REFERENCE.test(input.caseId)) {
      return failure('SCOPE_MISMATCH');
    }
    const evidenceClasses = exactOpaqueList(input.evidenceClasses, true);
    const liability = this.parseLiability(input.liabilityContext);
    if (input.documentType !== 'CEK' || !evidenceClasses || !liability) return failure('SCOPE_MISMATCH');

    let artifacts: CekLegalBasisArtifactsV1;
    try {
      artifacts = this.artifactsProvider();
    } catch {
      return failure('AUTHORITY_UNAVAILABLE');
    }
    const status = artifacts.validation.ratificationStatus;
    if (!(status === RATIFIED_STATUS || (status === DRAFT_STATUS && this.allowDraftContent))) {
      return failure('AUTHORITY_UNAVAILABLE');
    }

    const bases = artifacts.release.legalBases.filter(
      (candidate) =>
        candidate.legalBasisCode === input.legalBasisCode &&
        candidate.legalBasisVersion === input.requestedVersion,
    );
    if (bases.length !== 1) return failure(bases.length === 0 ? 'VERSION_NOT_FOUND' : 'AUTHORITY_UNAVAILABLE');
    const basis = bases[0];
    const subtypes = artifacts.registry.entries.filter((candidate) => candidate.subtypeCode === input.componentSubtypeCode);
    if (subtypes.length !== 1) return failure(subtypes.length === 0 ? 'VERSION_NOT_FOUND' : 'AUTHORITY_UNAVAILABLE');
    const subtype = subtypes[0];
    const itemType = CEK_ITEM_TYPE[subtype.subtypeCode];
    if (!itemType) return failure('SCOPE_MISMATCH');

    const at = Date.parse(input.effectiveAt);
    const from = Date.parse(basis.effectiveFrom);
    const until = subtype.effectiveUntil === null ? null : Date.parse(subtype.effectiveUntil);
    if (
      basis.effectiveFrom !== artifacts.release.effectiveAt ||
      subtype.effectiveFrom !== basis.effectiveFrom ||
      !Number.isFinite(at) ||
      at < from ||
      (until !== null && at >= until)
    ) {
      return failure('VERSION_NOT_FOUND');
    }

    const entryChecksum = artifacts.validation.entryChecksums.find(
      (candidate) =>
        candidate.legalBasisCode === basis.legalBasisCode && candidate.legalBasisVersion === basis.legalBasisVersion,
    );
    if (!entryChecksum || entryChecksum.checksum !== cekArtifactChecksum(basis)) return failure('CHECKSUM_MISMATCH');

    if (
      subtype.canonicalComponentCategory !== input.componentCategory ||
      !basis.allowedComponentCategories.includes(input.componentCategory) ||
      !basis.subtypeRegistryBinding.allowedSubtypeCodes.includes(subtype.subtypeCode) ||
      !subtype.legalBasisBindings.allowedLegalBasisCodes.includes(basis.legalBasisCode) ||
      !basis.sourceEvidenceCompatibility.allowedSourceTypes.includes(input.documentType) ||
      basis.sourceEvidenceCompatibility.requiredEvidenceTypes.some((required) => !evidenceClasses.includes(required)) ||
      !sameStringSet(basis.sourceEvidenceCompatibility.requiredEvidenceTypes, subtype.requiredEvidenceTypes) ||
      !basis.liabilityCompatibility.allowedLiabilityTypes.includes(liability.liabilityType) ||
      !subtype.liabilityCompatibility.allowedLiabilityTypes.includes(liability.liabilityType) ||
      basis.liabilityCompatibility.implicitAllDebtors !== 'PROHIBITED' ||
      basis.interestEligibility.automaticInterest !== false ||
      basis.interestEligibility.formationProjection !== 'UNKNOWN'
    ) {
      return failure('SCOPE_MISMATCH');
    }

    const componentSubtypeChecksum = cekArtifactChecksum(subtype);
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
      itemType,
      interestAccrualStatus: InterestAccrualStatus.UNKNOWN,
      interestType: null,
      interestRate: null,
      interestStartDate: null,
      interestStartDateProvenance: null,
      isAllDebtorsLiable: false,
      liableDebtorIds: liability.liableDebtorRefs,
    });
    const resolutionHash = cekArtifactChecksum({
      caseId: input.caseId,
      claimItemProjection,
      componentSubtypeChecksum,
      decisionProjection,
      documentType: input.documentType,
      effectiveAt: input.effectiveAt,
      evidenceClasses,
      legalBasisChecksum: entryChecksum.checksum,
      liability,
      registryChecksum: artifacts.validation.registryChecksum,
      releaseChecksum: artifacts.validation.releaseChecksum,
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
        registryReleaseChecksum: artifacts.validation.releaseChecksum,
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
          registryChecksum: artifacts.validation.registryChecksum,
        }),
        decisionProjection,
        claimItemProjection,
      }),
    };
  }

  /** Taslak içerikten tazminat oranı (baz puan) — hesaplama tek kaynaktan okunur. */
  penaltyBasisPoints(): number {
    const artifacts = this.artifactsProvider();
    const penalty = artifacts.release.legalBases.find((basis) => basis.legalBasisCode === 'TTK_CEK_TAZMINATI');
    const bp = penalty?.calculation?.percentOfPrincipalBasisPoints;
    if (!Number.isSafeInteger(bp) || (bp as number) <= 0 || (bp as number) > 10000) {
      throw new Error('RCV-LB-R2-CEK penalty calculation is unavailable');
    }
    return bp as number;
  }

  private parseLiability(
    value: unknown,
  ): { readonly liabilityType: string; readonly liableDebtorRefs: readonly string[] } | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).sort().join(',') !== 'liabilityType,liableDebtorRefs') return null;
    if (record.liabilityType !== 'TAM') return null;
    const refs = exactOpaqueList(record.liableDebtorRefs);
    if (!refs) return null;
    return Object.freeze({ liabilityType: 'TAM', liableDebtorRefs: refs });
  }
}
