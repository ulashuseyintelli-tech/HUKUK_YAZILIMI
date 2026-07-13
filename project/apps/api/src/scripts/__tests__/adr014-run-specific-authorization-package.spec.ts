import {
  ADR014_PHASED_RUN_AUTHORIZATION_CONTRACT_VERSION,
  ADR014_PRE_RUN_BLOCKER_CODES,
  ADR014_RUNTIME_BINDING_BLOCKER_CODES,
  ADR014_RUN_AUTHORIZATION_BLOCKER_CODES,
  authorizeAdr014PreRunPackage,
  bindAdr014RuntimeCapture,
  completeAdr014RunSpecificAuthorizationPackage,
  type Adr014PreRunAuthorizationRequest,
  type Adr014RuntimeBindingRequest,
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

function validPreRunRequest(): Adr014PreRunAuthorizationRequest {
  return {
    contractVersion: '2',
    canonicalSha: SHA,
    environmentReference: ref('ENVIRONMENT', '2') as Adr014PreRunAuthorizationRequest['environmentReference'],
    operatorAssignment: {
      actorReference: opaque('operator', '3'),
      assignmentReference: opaque('operator-assignment', '4'),
    },
    reviewerAssignmentPolicy: {
      role: 'AUTHORIZED_LAWYER_OR_PARTNER',
      assignedByReference: opaque('owner', '5'),
      assignmentTiming: 'BEFORE_EXECUTION',
      mustDifferFromOperator: true,
    },
    accessAuthorization: {
      reference: ref('ACCESS_AUTHORIZATION', '6') as Adr014PreRunAuthorizationRequest['accessAuthorization']['reference'],
      approvalStatus: 'APPROVED',
      authorizedByReference: opaque('owner', '7'),
      sourceAccess: 'READ_ONLY',
      runSpecific: true,
    },
    executionAuthorization: {
      reference: ref('EXECUTION_AUTHORIZATION', '8') as Adr014PreRunAuthorizationRequest['executionAuthorization']['reference'],
      approvalStatus: 'APPROVED',
      authorizedByReference: opaque('owner', '9'),
      singleRun: true,
      implicit: false,
    },
    readOnlyProof: {
      proofReference: opaque('read-only-proof', 'a'),
      sourceAccess: 'READ_ONLY',
      transactionBoundary: 'REPEATABLE_READ_READ_ONLY',
      writeBack: 'FORBIDDEN',
    },
    noEgressProof: {
      proofReference: opaque('no-egress-proof', 'b'),
      networkBoundary: 'NO_EGRESS',
      externalServices: 'FORBIDDEN',
      externalAi: 'FORBIDDEN',
      cloudOrRemoteStaging: 'FORBIDDEN',
    },
    outputPath: {
      outputPathReference: `adr014-output-path:v1:${'c'.repeat(64)}`,
      ownerControlledRootReference: opaque('output-root', 'd'),
      locality: 'OWNER_CONTROLLED_LOCAL',
      writeMode: 'CREATE_ONCE',
    },
    retention: {
      ownerReference: opaque('retention-owner', 'e'),
      automaticDeletion: false,
      dispositionRequiresOwnerDecision: true,
      supersessionReplacesPreviousEvidence: false,
    },
    manifestPreparation: {
      source: 'REAL_LOCAL_OFFICE_DATA',
      population: 'FULL_ELIGIBLE_POPULATION',
      sampling: 'NONE',
      syntheticDataset: 'FORBIDDEN',
      goldenFixture: 'FORBIDDEN',
      copiedDatabase: 'FORBIDDEN',
    },
    baselineMethod: {
      source: 'CURRENT_LOCAL_DATABASE_STATE',
      dateFilter: 'NONE',
      population: 'FULL_ELIGIBLE_POPULATION',
      sampling: 'NONE',
      latencyPercentiles: ['P95', 'P99'],
      errorComparisonBasis: 'BASELINE_RELATIVE',
      timeoutComparisonBasis: 'BASELINE_RELATIVE',
    },
    signoffs: [
      ['OPERATIONS', '1'], ['LEGAL', '2'], ['FINANCIAL', '3'], ['PRIVACY', '4'], ['TECHNICAL', '5'],
    ].map(([scope, token]) => ({
      scope,
      reviewerReference: opaque(`${scope.toLowerCase()}-reviewer`, token),
      decisionReference: opaque(`${scope.toLowerCase()}-decision`, token),
      decision: 'APPROVED_FOR_RUN',
    })) as Adr014PreRunAuthorizationRequest['signoffs'],
  };
}

function validRuntimeBinding(preRunPackageReference: string): Adr014RuntimeBindingRequest {
  return {
    contractVersion: '2',
    preRunPackageReference,
    sessionReference: ref('SESSION', 'f') as Adr014RuntimeBindingRequest['sessionReference'],
    approvedManifest: {
      reference: ref('MANIFEST', '1') as Adr014RuntimeBindingRequest['approvedManifest']['reference'],
      approvalStatus: 'APPROVED',
      approvalReference: opaque('manifest-approval', '2'),
    },
    independentReviewerAssignment: {
      actorReference: opaque('reviewer', '3'),
      assignmentReference: opaque('reviewer-assignment', '4'),
    },
    actualAccessWindow: {
      startsAt: '2026-08-03T08:00:00Z', endsAt: '2026-08-03T18:00:00Z',
    },
    actualExecutionWindow: {
      startsAt: '2026-08-03T09:00:00Z', endsAt: '2026-08-03T17:00:00Z',
    },
    baselineFacts: {
      window: { startsAt: '2026-08-03T09:15:00Z', endsAt: '2026-08-03T16:45:00Z' },
      warmupRequestCount: 25,
      populationCount: 200,
      requestCount: 500,
    },
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

describe('ADR014-REP-01A-R2 phased run authorization contract', () => {
  it('authorizes complete pre-run owner decisions without requiring runtime facts', () => {
    const result = authorizeAdr014PreRunPackage(validPreRunRequest(), {
      currentCanonicalSha: SHA,
    });

    expect(result.status).toBe('PRE_RUN_AUTHORIZED');
    if (result.status !== 'PRE_RUN_AUTHORIZED') throw new Error('expected pre-run authorization');
    expect(result.package.contractVersion).toBe(ADR014_PHASED_RUN_AUTHORIZATION_CONTRACT_VERSION);
    expect(result.package.preRunPackageReference)
      .toMatch(/^adr014-pre-run-package:v2:[0-9a-f]{64}$/);
    expect(result.package.runtimeBindingStatus).toBe('RUNTIME_BINDING_REQUIRED');
    expect(result.package.retention).toEqual({
      ownerReference: opaque('retention-owner', 'e'),
      automaticDeletion: false,
      dispositionRequiresOwnerDecision: true,
      supersessionReplacesPreviousEvidence: false,
    });
    expect(result.package).not.toHaveProperty('sessionReference');
    expect(result.package).not.toHaveProperty('approvedManifest');
    expect(result.package).not.toHaveProperty('durationDays');
    expect(result.package.executionStarted).toBe(false);
    expect(result.package.representativeEvidenceAccepted).toBe(false);
    expect(result.package.rep02Authorized).toBe(false);
    expect(result.package.pr11Ready).toBe(false);
    expect(result.package.runtimeCutoverAuthorized).toBe(false);
  });

  it('fails closed before execution when a mandatory owner decision is missing', () => {
    const candidate = validPreRunRequest() as unknown as Record<string, unknown>;
    delete candidate.environmentReference;
    delete candidate.executionAuthorization;
    delete candidate.retention;
    const result = authorizeAdr014PreRunPackage(candidate, { currentCanonicalSha: SHA });

    expect(result.status).toBe('BLOCKED');
    if (result.status !== 'BLOCKED') throw new Error('expected blocked');
    expect(result.blockerCodes).toEqual(expect.arrayContaining([
      'INVALID_PRE_RUN_REQUEST_SHAPE',
      'MISSING_PRE_RUN_ENVIRONMENT_REFERENCE',
      'MISSING_PRE_RUN_EXECUTION_AUTHORIZATION',
      'MISSING_PRE_RUN_RETENTION_POLICY',
    ]));
  });

  it('keeps access and execution authorization separate before runtime binding', () => {
    const candidate = validPreRunRequest();
    const result = authorizeAdr014PreRunPackage({
      ...candidate,
      executionAuthorization: {
        ...candidate.executionAuthorization,
        reference: candidate.accessAuthorization.reference as never,
      },
    }, { currentCanonicalSha: SHA });

    expect(result).toMatchObject({
      status: 'BLOCKED',
      blockerCodes: expect.arrayContaining([
        'MISSING_PRE_RUN_EXECUTION_AUTHORIZATION',
        'PRE_RUN_AUTHORIZATION_REFERENCES_NOT_DISTINCT',
      ]),
    });
  });

  it('returns runtime-binding-required without revoking pre-run authorization', () => {
    const preRun = authorizeAdr014PreRunPackage(validPreRunRequest(), {
      currentCanonicalSha: SHA,
    });
    if (preRun.status !== 'PRE_RUN_AUTHORIZED') throw new Error('expected pre-run authorization');

    const result = bindAdr014RuntimeCapture(preRun.package, {});
    expect(result.status).toBe('RUNTIME_BINDING_REQUIRED');
    if (result.status !== 'RUNTIME_BINDING_REQUIRED') throw new Error('expected runtime blockers');
    expect(result.preRunPackageReference).toBe(preRun.package.preRunPackageReference);
    expect(result.representativeEvidenceAccepted).toBe(false);
    expect(result.blockerCodes).toEqual(expect.arrayContaining([
      'INVALID_RUNTIME_BINDING_SHAPE',
      'MISSING_RUNTIME_SESSION_REFERENCE',
      'MISSING_RUNTIME_MANIFEST_REFERENCE',
      'MISSING_RUNTIME_REVIEWER_ASSIGNMENT',
      'MISSING_ACTUAL_ACCESS_WINDOW',
      'MISSING_ACTUAL_EXECUTION_WINDOW',
      'MISSING_ACTUAL_BASELINE_WINDOW',
      'MISSING_ACTUAL_POPULATION_OR_REQUEST_COUNT',
      'RUNTIME_REFERENCE_BINDING_MISMATCH',
    ]));
  });

  it('rejects a forged or mutated pre-run package before runtime binding', () => {
    const preRun = authorizeAdr014PreRunPackage(validPreRunRequest(), {
      currentCanonicalSha: SHA,
    });
    if (preRun.status !== 'PRE_RUN_AUTHORIZED') throw new Error('expected pre-run authorization');
    const forged = {
      ...preRun.package,
      operatorAssignment: {
        ...preRun.package.operatorAssignment,
        actorReference: opaque('forged-operator', 'f'),
      },
    };

    expect(bindAdr014RuntimeCapture(forged, {})).toMatchObject({
      status: 'BLOCKED', blockerCodes: ['INVALID_PRE_RUN_PACKAGE'],
    });
  });

  it('completes capture binding deterministically without accepting evidence or authority', () => {
    const preRun = authorizeAdr014PreRunPackage(validPreRunRequest(), {
      currentCanonicalSha: SHA,
    });
    if (preRun.status !== 'PRE_RUN_AUTHORIZED') throw new Error('expected pre-run authorization');
    const input = validRuntimeBinding(preRun.package.preRunPackageReference);

    const first = bindAdr014RuntimeCapture(preRun.package, input);
    const second = bindAdr014RuntimeCapture(
      preRun.package,
      validRuntimeBinding(preRun.package.preRunPackageReference),
    );
    expect(first).toEqual(second);
    expect(first.status).toBe('CAPTURE_COMPLETE');
    if (first.status !== 'CAPTURE_COMPLETE') throw new Error('expected capture completion');
    expect(first.package.capturePackageReference)
      .toMatch(/^adr014-capture-package:v2:[0-9a-f]{64}$/);
    expect(first.package.representativeEvidenceAccepted).toBe(false);
    expect(first.package.rep02Authorized).toBe(false);
    expect(first.package.pr11Ready).toBe(false);
    expect(first.package.runtimeCutoverAuthorized).toBe(false);
    expect(first.package.authority).toBe('CAPTURE_REFERENCE_ONLY');
    expect(Object.isFrozen(first.package)).toBe(true);
    expect(Object.isFrozen(first.package.baselineFacts)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
  });

  it('blocks capture completion for self-review, invalid windows and absent counts', () => {
    const preRun = authorizeAdr014PreRunPackage(validPreRunRequest(), {
      currentCanonicalSha: SHA,
    });
    if (preRun.status !== 'PRE_RUN_AUTHORIZED') throw new Error('expected pre-run authorization');
    const runtime = validRuntimeBinding(preRun.package.preRunPackageReference);
    const result = bindAdr014RuntimeCapture(preRun.package, {
      ...runtime,
      independentReviewerAssignment: {
        ...runtime.independentReviewerAssignment,
        actorReference: preRun.package.operatorAssignment.actorReference,
      },
      actualExecutionWindow: {
        startsAt: '2026-08-03T07:00:00Z', endsAt: '2026-08-03T19:00:00Z',
      },
      baselineFacts: { ...runtime.baselineFacts, populationCount: 0, requestCount: 0 },
    });

    expect(result).toMatchObject({
      status: 'RUNTIME_BINDING_REQUIRED',
      blockerCodes: expect.arrayContaining([
        'RUNTIME_REVIEWER_CONFLICT',
        'ACTUAL_EXECUTION_OUTSIDE_ACCESS_WINDOW',
        'MISSING_ACTUAL_POPULATION_OR_REQUEST_COUNT',
      ]),
      representativeEvidenceAccepted: false,
    });
  });

  it('keeps phased blocker vocabularies unique and canonically ordered', () => {
    expect(new Set(ADR014_PRE_RUN_BLOCKER_CODES).size).toBe(ADR014_PRE_RUN_BLOCKER_CODES.length);
    expect(new Set(ADR014_RUNTIME_BINDING_BLOCKER_CODES).size)
      .toBe(ADR014_RUNTIME_BINDING_BLOCKER_CODES.length);
    const preRun = authorizeAdr014PreRunPackage({}, { currentCanonicalSha: SHA });
    expect(preRun.status).toBe('BLOCKED');
    if (preRun.status !== 'BLOCKED') throw new Error('expected blocked');
    const preIndexes = preRun.blockerCodes.map((code) => ADR014_PRE_RUN_BLOCKER_CODES.indexOf(code));
    expect(preIndexes).toEqual([...preIndexes].sort((left, right) => left - right));

    const validPreRun = authorizeAdr014PreRunPackage(validPreRunRequest(), {
      currentCanonicalSha: SHA,
    });
    if (validPreRun.status !== 'PRE_RUN_AUTHORIZED') throw new Error('expected pre-run authorization');
    const runtime = bindAdr014RuntimeCapture(validPreRun.package, {});
    if (runtime.status !== 'RUNTIME_BINDING_REQUIRED') throw new Error('expected runtime blockers');
    const runtimeIndexes = runtime.blockerCodes.map((code) =>
      ADR014_RUNTIME_BINDING_BLOCKER_CODES.indexOf(code));
    expect(runtimeIndexes).toEqual([...runtimeIndexes].sort((left, right) => left - right));
  });

  it('preserves the v1 one-shot package contract unchanged', () => {
    const result = completeAdr014RunSpecificAuthorizationPackage(validRequest(), {
      currentCanonicalSha: SHA,
    });
    expect(result.status).toBe('PACKAGE_COMPLETE');
    expect(result.contractVersion).toBe('1');
    expect(JSON.stringify(result)).not.toContain('PRE_RUN_AUTHORIZED');
  });
});
