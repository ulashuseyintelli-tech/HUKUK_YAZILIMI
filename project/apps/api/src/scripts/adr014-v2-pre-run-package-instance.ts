import { createHash } from 'node:crypto';
import {
  ADR014_PHASED_RUN_AUTHORIZATION_CONTRACT_VERSION,
  authorizeAdr014PreRunPackage,
  type Adr014PreRunAuthorizationRequest,
  type Adr014PreRunAuthorizationResult,
} from './adr014-run-specific-authorization-package';

export const ADR014_FIRST_V2_PRE_RUN_INSTANCE_ID = 'ADR014-REP-01A-R2-I1' as const;

export const ADR014_FIRST_V2_PRE_RUN_OWNER_DECISIONS = Object.freeze({
  environment: Object.freeze({
    host: 'OWNER_CONTROLLED_WINDOWS_11_OFFICE_WORKSTATION',
    database: 'LOCAL_POSTGRESQL_SAME_HOST',
    databaseIdentity: 'LOCAL_HUKUK_YAZILIMI_OFFICE_DATABASE',
    network: 'LOCAL_OFFICE_ONLY',
  }),
  data: Object.freeze({
    source: 'REAL_LOCAL_OFFICE_DATA',
    population: 'FULL_ELIGIBLE_POPULATION',
    sampling: 'NONE',
  }),
  operator: 'OWNER_OPERATOR_AND_EVIDENCE_OWNER',
  reviewerPolicy: Object.freeze({
    role: 'AUTHORIZED_LAWYER_OR_PARTNER',
    assignedBy: 'OWNER',
    assignmentTiming: 'BEFORE_EXECUTION',
    mustDifferFromOperator: true,
  }),
  output: Object.freeze({
    root: 'OWNER_CONTROLLED_LOCAL_ADR014_EVIDENCE_DIRECTORY',
    writeMode: 'CREATE_ONCE',
  }),
  retention: Object.freeze({
    owner: 'OWNER',
    automaticDeletion: false,
    dispositionRequiresOwnerDecision: true,
    supersessionReplacesPreviousEvidence: false,
  }),
  authorization: Object.freeze({
    access: 'OWNER_APPROVED_READ_ONLY_RUN_SPECIFIC',
    execution: 'OWNER_APPROVED_SINGLE_RUN_SEPARATE_NON_IMPLICIT',
  }),
  signoffs: Object.freeze([
    'TECHNICAL', 'PRIVACY', 'FINANCIAL', 'LEGAL', 'OPERATIONS',
  ] as const),
  baseline: Object.freeze({
    source: 'CURRENT_LOCAL_DATABASE_STATE',
    dateFilter: 'NONE',
    population: 'FULL_ELIGIBLE_POPULATION',
    sampling: 'NONE',
  }),
});

export interface Adr014FirstV2PreRunPackageInstance {
  readonly instanceId: typeof ADR014_FIRST_V2_PRE_RUN_INSTANCE_ID;
  readonly ownerDecisionRecordReference: string;
  readonly authorization: Adr014PreRunAuthorizationResult;
}

const FULL_SHA = /^[0-9a-f]{40}$/;

function digest(namespace: string, canonicalSha: string): string {
  return createHash('sha256')
    .update(`${ADR014_FIRST_V2_PRE_RUN_INSTANCE_ID}:${canonicalSha}:${namespace}`)
    .digest('hex');
}

function opaqueReference(namespace: string, canonicalSha: string): string {
  return `adr014-ref:v1:${namespace}:${digest(namespace, canonicalSha).slice(0, 32)}`;
}

function boundReference<K extends 'ENVIRONMENT' | 'ACCESS_AUTHORIZATION' | 'EXECUTION_AUTHORIZATION'>(
  kind: K,
  canonicalSha: string,
) {
  const namespace = kind.toLowerCase().replaceAll('_', '-');
  return Object.freeze({
    kind,
    opaqueReference: opaqueReference(namespace, canonicalSha),
    bindingReference: `adr014-binding:v1:${digest('shared-binding', canonicalSha).slice(0, 32)}`,
  });
}

function outputPathReference(canonicalSha: string): string {
  return `adr014-output-path:v1:${digest('owner-controlled-local-output', canonicalSha)}`;
}

function signoffs(canonicalSha: string) {
  return ADR014_FIRST_V2_PRE_RUN_OWNER_DECISIONS.signoffs.map((scope) => Object.freeze({
    scope,
    reviewerReference: opaqueReference('owner-signoff-reviewer', canonicalSha),
    decisionReference: opaqueReference(`${scope.toLowerCase()}-approved-for-run`, canonicalSha),
    decision: 'APPROVED_FOR_RUN' as const,
  }));
}

function requestFor(canonicalSha: string): Adr014PreRunAuthorizationRequest {
  return Object.freeze({
    contractVersion: ADR014_PHASED_RUN_AUTHORIZATION_CONTRACT_VERSION,
    canonicalSha,
    environmentReference: boundReference('ENVIRONMENT', canonicalSha),
    operatorAssignment: Object.freeze({
      actorReference: opaqueReference('owner-operator', canonicalSha),
      assignmentReference: opaqueReference('owner-operator-assignment', canonicalSha),
    }),
    reviewerAssignmentPolicy: Object.freeze({
      role: 'AUTHORIZED_LAWYER_OR_PARTNER' as const,
      assignedByReference: opaqueReference('owner-reviewer-assigner', canonicalSha),
      assignmentTiming: 'BEFORE_EXECUTION' as const,
      mustDifferFromOperator: true as const,
    }),
    accessAuthorization: Object.freeze({
      reference: boundReference('ACCESS_AUTHORIZATION', canonicalSha),
      approvalStatus: 'APPROVED' as const,
      authorizedByReference: opaqueReference('owner-access-authorizer', canonicalSha),
      sourceAccess: 'READ_ONLY' as const,
      runSpecific: true as const,
    }),
    executionAuthorization: Object.freeze({
      reference: boundReference('EXECUTION_AUTHORIZATION', canonicalSha),
      approvalStatus: 'APPROVED' as const,
      authorizedByReference: opaqueReference('owner-execution-authorizer', canonicalSha),
      singleRun: true as const,
      implicit: false as const,
    }),
    readOnlyProof: Object.freeze({
      proofReference: opaqueReference('read-only-proof-contract', canonicalSha),
      sourceAccess: 'READ_ONLY' as const,
      transactionBoundary: 'REPEATABLE_READ_READ_ONLY' as const,
      writeBack: 'FORBIDDEN' as const,
    }),
    noEgressProof: Object.freeze({
      proofReference: opaqueReference('no-egress-proof-contract', canonicalSha),
      networkBoundary: 'NO_EGRESS' as const,
      externalServices: 'FORBIDDEN' as const,
      externalAi: 'FORBIDDEN' as const,
      cloudOrRemoteStaging: 'FORBIDDEN' as const,
    }),
    outputPath: Object.freeze({
      outputPathReference: outputPathReference(canonicalSha),
      ownerControlledRootReference: opaqueReference('local-adr014-evidence-root', canonicalSha),
      locality: 'OWNER_CONTROLLED_LOCAL' as const,
      writeMode: 'CREATE_ONCE' as const,
    }),
    retention: Object.freeze({
      ownerReference: opaqueReference('retention-owner', canonicalSha),
      automaticDeletion: false as const,
      dispositionRequiresOwnerDecision: true as const,
      supersessionReplacesPreviousEvidence: false as const,
    }),
    manifestPreparation: Object.freeze({
      source: 'REAL_LOCAL_OFFICE_DATA' as const,
      population: 'FULL_ELIGIBLE_POPULATION' as const,
      sampling: 'NONE' as const,
      syntheticDataset: 'FORBIDDEN' as const,
      goldenFixture: 'FORBIDDEN' as const,
      copiedDatabase: 'FORBIDDEN' as const,
    }),
    baselineMethod: Object.freeze({
      source: 'CURRENT_LOCAL_DATABASE_STATE' as const,
      dateFilter: 'NONE' as const,
      population: 'FULL_ELIGIBLE_POPULATION' as const,
      sampling: 'NONE' as const,
      latencyPercentiles: Object.freeze(['P95', 'P99'] as const),
      errorComparisonBasis: 'BASELINE_RELATIVE' as const,
      timeoutComparisonBasis: 'BASELINE_RELATIVE' as const,
    }),
    signoffs: Object.freeze(signoffs(canonicalSha)),
  });
}

/**
 * Materializes repository-backed owner decisions against the verified canonical HEAD.
 * The SHA is caller-supplied because a committed artifact cannot contain its future merge SHA.
 * This function performs no execution, data access, manifest creation or runtime binding.
 */
export function materializeAdr014FirstV2PreRunPackageInstance(
  currentCanonicalSha: string,
): Readonly<Adr014FirstV2PreRunPackageInstance> {
  const canonicalSha = FULL_SHA.test(currentCanonicalSha) ? currentCanonicalSha : '';
  const authorization = authorizeAdr014PreRunPackage(requestFor(canonicalSha), {
    currentCanonicalSha,
  });
  return Object.freeze({
    instanceId: ADR014_FIRST_V2_PRE_RUN_INSTANCE_ID,
    ownerDecisionRecordReference: opaqueReference('owner-decision-record', canonicalSha),
    authorization,
  });
}
