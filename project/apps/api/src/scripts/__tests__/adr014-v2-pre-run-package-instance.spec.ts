import {
  ADR014_FIRST_V2_PRE_RUN_INSTANCE_ID,
  ADR014_FIRST_V2_PRE_RUN_OWNER_DECISIONS,
  materializeAdr014FirstV2PreRunPackageInstance,
} from '../adr014-v2-pre-run-package-instance';

const SHA = 'b'.repeat(40);

describe('ADR014-REP-01A-R2-I1 first v2 pre-run package instance', () => {
  it('materializes the owner decisions as PRE_RUN_AUTHORIZED', () => {
    const result = materializeAdr014FirstV2PreRunPackageInstance(SHA);

    expect(result.instanceId).toBe(ADR014_FIRST_V2_PRE_RUN_INSTANCE_ID);
    expect(result.authorization.status).toBe('PRE_RUN_AUTHORIZED');
    if (result.authorization.status !== 'PRE_RUN_AUTHORIZED') {
      throw new Error('expected PRE_RUN_AUTHORIZED');
    }
    expect(result.authorization.package.canonicalSha).toBe(SHA);
    expect(result.authorization.package.runtimeBindingStatus).toBe('RUNTIME_BINDING_REQUIRED');
    expect(result.authorization.package.executionStarted).toBe(false);
    expect(result.authorization.package.representativeEvidenceProduced).toBe(false);
    expect(result.authorization.package.representativeEvidenceAccepted).toBe(false);
    expect(result.authorization.package.rep02Authorized).toBe(false);
    expect(result.authorization.package.pr11Ready).toBe(false);
    expect(result.authorization.package.runtimeCutoverAuthorized).toBe(false);
  });

  it('binds the approved environment, access, execution and owner policies exactly once', () => {
    const result = materializeAdr014FirstV2PreRunPackageInstance(SHA);
    if (result.authorization.status !== 'PRE_RUN_AUTHORIZED') {
      throw new Error('expected PRE_RUN_AUTHORIZED');
    }
    const pkg = result.authorization.package;

    expect(ADR014_FIRST_V2_PRE_RUN_OWNER_DECISIONS.environment).toEqual({
      host: 'OWNER_CONTROLLED_WINDOWS_11_OFFICE_WORKSTATION',
      database: 'LOCAL_POSTGRESQL_SAME_HOST',
      databaseIdentity: 'LOCAL_HUKUK_YAZILIMI_OFFICE_DATABASE',
      network: 'LOCAL_OFFICE_ONLY',
    });
    expect(pkg.accessAuthorization.reference.opaqueReference)
      .not.toBe(pkg.executionAuthorization.reference.opaqueReference);
    expect(pkg.accessAuthorization.reference.bindingReference)
      .toBe(pkg.executionAuthorization.reference.bindingReference);
    expect(pkg.environmentReference.bindingReference)
      .toBe(pkg.accessAuthorization.reference.bindingReference);
    expect(pkg.retention).toEqual({
      ownerReference: expect.stringMatching(/^adr014-ref:v1:retention-owner:[0-9a-f]{32}$/),
      automaticDeletion: false,
      dispositionRequiresOwnerDecision: true,
      supersessionReplacesPreviousEvidence: false,
    });
    expect(pkg.signoffs.map((signoff) => signoff.scope)).toEqual([
      'TECHNICAL', 'PRIVACY', 'FINANCIAL', 'LEGAL', 'OPERATIONS',
    ]);
  });

  it('leaves every runtime/post-capture fact absent', () => {
    const result = materializeAdr014FirstV2PreRunPackageInstance(SHA);
    if (result.authorization.status !== 'PRE_RUN_AUTHORIZED') {
      throw new Error('expected PRE_RUN_AUTHORIZED');
    }
    const serialized = JSON.stringify(result.authorization.package);

    for (const runtimeField of [
      'sessionReference', 'approvedManifest', 'independentReviewerAssignment',
      'actualAccessWindow', 'actualExecutionWindow', 'baselineFacts',
      'capturePackageReference',
    ]) {
      expect(serialized).not.toContain(`"${runtimeField}"`);
    }
  });

  it('is deterministic, immutable and canonical-SHA-bound', () => {
    const first = materializeAdr014FirstV2PreRunPackageInstance(SHA);
    const second = materializeAdr014FirstV2PreRunPackageInstance(SHA);
    const other = materializeAdr014FirstV2PreRunPackageInstance('c'.repeat(40));

    expect(first).toEqual(second);
    expect(first).not.toEqual(other);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(ADR014_FIRST_V2_PRE_RUN_OWNER_DECISIONS)).toBe(true);
    expect(first.ownerDecisionRecordReference)
      .toMatch(/^adr014-ref:v1:owner-decision-record:[0-9a-f]{32}$/);
  });

  it('fails closed for an invalid canonical SHA', () => {
    const result = materializeAdr014FirstV2PreRunPackageInstance('not-a-sha');
    expect(result.authorization).toMatchObject({
      status: 'BLOCKED',
      blockerCodes: ['INVALID_PRE_RUN_CANONICAL_SHA'],
    });
  });
});
