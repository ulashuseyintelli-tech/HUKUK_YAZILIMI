import {
  ADR014_RUN_AUTHORIZATION_BLOCKER_CODES,
  completeAdr014RunSpecificAuthorizationPackage,
  type Adr014RunSpecificAuthorizationPackageRequest,
} from '../adr014-run-specific-authorization-package';

const SHA = 'b'.repeat(40);
const BINDING = `adr014-binding:v1:${'1'.repeat(32)}`;

function ref(kind: string, token: string) {
  return {
    kind,
    opaqueReference: `adr014-ref:v1:${kind.toLowerCase().replaceAll('_', '-')}:${token.repeat(32)}`,
    bindingReference: BINDING,
  };
}

function opaque(kind: string, token: string): string {
  return `adr014-ref:v1:${kind}:${token.repeat(32)}`;
}

function validRequest(): Adr014RunSpecificAuthorizationPackageRequest {
  return {
    contractVersion: '1',
    canonicalSha: SHA,
    environmentReference: ref('ENVIRONMENT', '2') as Adr014RunSpecificAuthorizationPackageRequest['environmentReference'],
    sessionReference: ref('SESSION', '3') as Adr014RunSpecificAuthorizationPackageRequest['sessionReference'],
    approvedManifest: {
      reference: ref('MANIFEST', '4') as Adr014RunSpecificAuthorizationPackageRequest['approvedManifest']['reference'],
      approvalStatus: 'APPROVED',
      approvalReference: opaque('manifest-approval', '5'),
    },
    accessAuthorization: {
      reference: ref('ACCESS_AUTHORIZATION', '6') as Adr014RunSpecificAuthorizationPackageRequest['accessAuthorization']['reference'],
      approvalStatus: 'APPROVED',
      authorizedByReference: opaque('owner', '7'),
      window: { startsAt: '2026-08-03T08:00:00Z', endsAt: '2026-08-03T18:00:00Z' },
    },
    executionAuthorization: {
      reference: ref('EXECUTION_AUTHORIZATION', '8') as Adr014RunSpecificAuthorizationPackageRequest['executionAuthorization']['reference'],
      approvalStatus: 'APPROVED',
      authorizedByReference: opaque('owner', '9'),
      window: { startsAt: '2026-08-03T09:00:00Z', endsAt: '2026-08-03T17:00:00Z' },
    },
    operatorAssignment: {
      actorReference: opaque('operator', 'a'),
      assignmentReference: opaque('assignment', 'b'),
    },
    independentReviewerAssignment: {
      actorReference: opaque('reviewer', 'c'),
      assignmentReference: opaque('assignment', 'd'),
    },
    readOnlyProof: {
      proofReference: opaque('read-only-proof', 'e'),
      sourceAccess: 'READ_ONLY',
      transactionBoundary: 'REPEATABLE_READ_READ_ONLY',
      writeBack: 'FORBIDDEN',
    },
    noEgressProof: {
      proofReference: opaque('no-egress-proof', 'f'),
      networkBoundary: 'NO_EGRESS',
      externalServices: 'FORBIDDEN',
      externalAi: 'FORBIDDEN',
      cloudOrRemoteStaging: 'FORBIDDEN',
    },
    outputPath: {
      outputPathReference: `adr014-output-path:v1:${'1'.repeat(64)}`,
      ownerControlledRootReference: opaque('output-root', '2'),
      locality: 'OWNER_CONTROLLED_LOCAL',
      writeMode: 'CREATE_ONCE',
    },
    retention: {
      ownerReference: opaque('retention-owner', '3'),
      durationDays: 30,
      dispositionRuleReference: opaque('retention-rule', '4'),
    },
    baseline: {
      window: { startsAt: '2026-08-03T09:15:00Z', endsAt: '2026-08-03T16:45:00Z' },
      warmupRequestCount: 25,
      populationCount: 200,
      requestCount: 500,
      latencyPercentiles: ['P95', 'P99'],
      errorComparisonBasis: 'BASELINE_RELATIVE',
      timeoutComparisonBasis: 'BASELINE_RELATIVE',
    },
    signoffs: [
      ['OPERATIONS', '5'], ['LEGAL', '6'], ['FINANCIAL', '7'], ['PRIVACY', '8'], ['TECHNICAL', '9'],
    ].map(([scope, token]) => ({
      scope,
      reviewerReference: opaque(`${scope.toLowerCase()}-reviewer`, token),
      decisionReference: opaque(`${scope.toLowerCase()}-decision`, token),
      decision: 'APPROVED_FOR_RUN',
    })) as Adr014RunSpecificAuthorizationPackageRequest['signoffs'],
  };
}

describe('ADR014-REP-01A run-specific authorization package', () => {
  it('completes one fully bound package without executing or promoting authority', () => {
    const result = completeAdr014RunSpecificAuthorizationPackage(validRequest(), {
      currentCanonicalSha: SHA,
    });

    expect(result.status).toBe('PACKAGE_COMPLETE');
    if (result.status !== 'PACKAGE_COMPLETE') throw new Error('expected complete package');
    expect(result.package.packageReference).toMatch(/^adr014-authorization-package:v1:[0-9a-f]{64}$/);
    expect(result.package.executionStarted).toBe(false);
    expect(result.package.representativeEvidenceProduced).toBe(false);
    expect(result.package.representativeEvidenceAccepted).toBe(false);
    expect(result.package.pr11Ready).toBe(false);
    expect(result.package.runtimeCutoverAuthorized).toBe(false);
    expect(result.package.authority).toBe('RUN_SPECIFIC_AUTHORIZATION_REFERENCES_ONLY');
    expect(result.package.signoffs.map((item) => item.scope)).toEqual([
      'TECHNICAL', 'PRIVACY', 'FINANCIAL', 'LEGAL', 'OPERATIONS',
    ]);
  });

  it('is deterministic and returns a deeply immutable package', () => {
    const input = validRequest();
    const first = completeAdr014RunSpecificAuthorizationPackage(input, { currentCanonicalSha: SHA });
    const second = completeAdr014RunSpecificAuthorizationPackage(validRequest(), { currentCanonicalSha: SHA });
    expect(first).toEqual(second);
    if (first.status !== 'PACKAGE_COMPLETE') throw new Error('expected complete package');
    expect(Object.isFrozen(first.package)).toBe(true);
    expect(Object.isFrozen(first.package.baseline)).toBe(true);
    expect(Object.isFrozen(first.package.signoffs)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.baseline)).toBe(false);
  });

  it('fails closed when mandatory references and assignments are absent', () => {
    const candidate = validRequest() as unknown as Record<string, unknown>;
    delete candidate.environmentReference;
    delete candidate.sessionReference;
    delete candidate.approvedManifest;
    delete candidate.accessAuthorization;
    delete candidate.executionAuthorization;
    delete candidate.operatorAssignment;
    delete candidate.independentReviewerAssignment;
    const result = completeAdr014RunSpecificAuthorizationPackage(candidate, { currentCanonicalSha: SHA });
    expect(result.status).toBe('BLOCKED');
    if (result.status !== 'BLOCKED') throw new Error('expected blocked');
    expect(result.blockerCodes).toEqual(expect.arrayContaining([
      'INVALID_REQUEST_SHAPE', 'MISSING_ENVIRONMENT_REFERENCE', 'MISSING_SESSION_REFERENCE',
      'MISSING_APPROVED_MANIFEST_REFERENCE', 'MISSING_ACCESS_AUTHORIZATION',
      'MISSING_EXECUTION_AUTHORIZATION', 'MISSING_OPERATOR_ASSIGNMENT',
      'MISSING_INDEPENDENT_REVIEWER_ASSIGNMENT',
    ]));
  });

  it('keeps access and execution approvals distinct and bounded by their windows', () => {
    const candidate = validRequest();
    const result = completeAdr014RunSpecificAuthorizationPackage({
      ...candidate,
      executionAuthorization: {
        ...candidate.executionAuthorization,
        reference: candidate.accessAuthorization.reference as never,
        window: { startsAt: '2026-08-03T07:00:00Z', endsAt: '2026-08-03T19:00:00Z' },
      },
    }, { currentCanonicalSha: SHA });
    expect(result.status).toBe('BLOCKED');
    if (result.status !== 'BLOCKED') throw new Error('expected blocked');
    expect(result.blockerCodes).toEqual(expect.arrayContaining([
      'AUTHORIZATION_REFERENCES_NOT_DISTINCT', 'REFERENCE_BINDING_MISMATCH',
      'EXECUTION_OUTSIDE_ACCESS_WINDOW',
    ]));
  });

  it('requires an approved manifest independently from execution authorization', () => {
    const candidate = validRequest();
    const result = completeAdr014RunSpecificAuthorizationPackage({
      ...candidate,
      approvedManifest: { ...candidate.approvedManifest, approvalStatus: 'DRAFT' },
    }, { currentCanonicalSha: SHA });
    expect(result).toMatchObject({ status: 'BLOCKED', blockerCodes: ['MANIFEST_NOT_APPROVED'] });
  });

  it('rejects operator self-review', () => {
    const candidate = validRequest();
    const result = completeAdr014RunSpecificAuthorizationPackage({
      ...candidate,
      independentReviewerAssignment: {
        ...candidate.independentReviewerAssignment,
        actorReference: candidate.operatorAssignment.actorReference,
      },
    }, { currentCanonicalSha: SHA });
    expect(result).toMatchObject({ status: 'BLOCKED', blockerCodes: ['ASSIGNMENT_CONFLICT'] });
  });

  it('requires read-only, no-egress, output and retention contracts', () => {
    const candidate = validRequest() as unknown as Record<string, unknown>;
    candidate.readOnlyProof = { sourceAccess: 'READ_WRITE' };
    candidate.noEgressProof = { networkBoundary: 'UNKNOWN' };
    candidate.outputPath = { locality: 'REMOTE' };
    candidate.retention = { durationDays: 0 };
    const result = completeAdr014RunSpecificAuthorizationPackage(candidate, { currentCanonicalSha: SHA });
    expect(result.status).toBe('BLOCKED');
    if (result.status !== 'BLOCKED') throw new Error('expected blocked');
    expect(result.blockerCodes).toEqual(expect.arrayContaining([
      'MISSING_READ_ONLY_PROOF', 'MISSING_NO_EGRESS_PROOF', 'MISSING_OUTPUT_PATH_CONTRACT',
      'MISSING_RETENTION_DECISION', 'INVALID_RETENTION_DURATION',
    ]));
  });

  it('requires an exact baseline population/request contract', () => {
    const candidate = validRequest();
    const result = completeAdr014RunSpecificAuthorizationPackage({
      ...candidate,
      baseline: { ...candidate.baseline, populationCount: 0, requestCount: 0 },
    }, { currentCanonicalSha: SHA });
    expect(result).toMatchObject({
      status: 'BLOCKED', blockerCodes: ['INVALID_POPULATION_OR_REQUEST_COUNT'],
    });
  });

  it('requires exactly one approved sign-off for every scope', () => {
    const candidate = validRequest();
    const result = completeAdr014RunSpecificAuthorizationPackage({
      ...candidate,
      signoffs: candidate.signoffs.filter((item) => item.scope !== 'LEGAL'),
    }, { currentCanonicalSha: SHA });
    expect(result).toMatchObject({ status: 'BLOCKED', blockerCodes: ['MISSING_LEGAL_SIGNOFF'] });
  });

  it('rejects stale canonical SHA', () => {
    const result = completeAdr014RunSpecificAuthorizationPackage(validRequest(), {
      currentCanonicalSha: 'c'.repeat(40),
    });
    expect(result).toMatchObject({ status: 'BLOCKED', blockerCodes: ['CANONICAL_SHA_MISMATCH'] });
  });

  it('keeps blocker ordering canonical and exhaustive', () => {
    expect(new Set(ADR014_RUN_AUTHORIZATION_BLOCKER_CODES).size)
      .toBe(ADR014_RUN_AUTHORIZATION_BLOCKER_CODES.length);
    const result = completeAdr014RunSpecificAuthorizationPackage({}, { currentCanonicalSha: SHA });
    expect(result.status).toBe('BLOCKED');
    if (result.status !== 'BLOCKED') throw new Error('expected blocked');
    const indexes = result.blockerCodes.map((code) => ADR014_RUN_AUTHORIZATION_BLOCKER_CODES.indexOf(code));
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });
});
