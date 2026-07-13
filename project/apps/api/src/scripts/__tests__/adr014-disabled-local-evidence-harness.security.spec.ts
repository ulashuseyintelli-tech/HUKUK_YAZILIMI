import * as harness from '../adr014-disabled-local-evidence-harness';
import {
  ADR014_LOCAL_EVIDENCE_HARNESS_CONTRACT_VERSION,
  type Adr014BoundOpaqueReference,
  type Adr014LocalEvidenceHarnessReferenceKind,
  type Adr014LocalEvidencePreparationRequest,
  prepareAdr014DisabledLocalEvidenceHarness,
} from '../adr014-disabled-local-evidence-harness';

const CANONICAL_SHA = 'a'.repeat(40);
const BINDING = `adr014-binding:v1:${'c'.repeat(32)}`;

function prefixFor(kind: Adr014LocalEvidenceHarnessReferenceKind): string {
  switch (kind) {
    case 'ENVIRONMENT':
      return 'environment';
    case 'SESSION':
      return 'session';
    case 'MANIFEST':
      return 'manifest';
    case 'ACCESS_AUTHORIZATION':
      return 'access-authorization';
    case 'EXECUTION_AUTHORIZATION':
      return 'execution-authorization';
  }
}

function boundReference<K extends Adr014LocalEvidenceHarnessReferenceKind>(
  kind: K,
  token: string,
): Adr014BoundOpaqueReference<K> {
  return {
    kind,
    opaqueReference: `adr014-ref:v1:${prefixFor(kind)}:${token.repeat(32)}`,
    bindingReference: BINDING,
  };
}

function validRequest(): Adr014LocalEvidencePreparationRequest {
  return {
    contractVersion: ADR014_LOCAL_EVIDENCE_HARNESS_CONTRACT_VERSION,
    enabled: true,
    canonicalSha: CANONICAL_SHA,
    environmentReference: boundReference('ENVIRONMENT', '6'),
    sessionReference: boundReference('SESSION', '7'),
    manifestReference: boundReference('MANIFEST', '8'),
    accessAuthorizationReference: boundReference('ACCESS_AUTHORIZATION', '9'),
    executionAuthorizationReference: boundReference('EXECUTION_AUTHORIZATION', 'a'),
  };
}

function evaluate(input: unknown) {
  return prepareAdr014DisabledLocalEvidenceHarness(input as Adr014LocalEvidencePreparationRequest, {
    currentCanonicalSha: CANONICAL_SHA,
  });
}

describe('ADR014-PE-06A security boundary', () => {
  it('exports only immutable contract vocabulary and the explicit preparation function', () => {
    expect(Object.keys(harness).sort()).toEqual([
      'ADR014_LOCAL_EVIDENCE_HARNESS_BLOCKER_CODES',
      'ADR014_LOCAL_EVIDENCE_HARNESS_CONTRACT_VERSION',
      'ADR014_LOCAL_EVIDENCE_HARNESS_DEFAULT_ENABLED',
      'ADR014_LOCAL_EVIDENCE_HARNESS_REFERENCE_KINDS',
      'ADR014_LOCAL_EVIDENCE_HARNESS_RESULT_STATUSES',
      'prepareAdr014DisabledLocalEvidenceHarness',
    ]);
    expect(Object.isFrozen(harness.ADR014_LOCAL_EVIDENCE_HARNESS_BLOCKER_CODES)).toBe(true);
    expect(Object.isFrozen(harness.ADR014_LOCAL_EVIDENCE_HARNESS_REFERENCE_KINDS)).toBe(true);
    expect(Object.isFrozen(harness.ADR014_LOCAL_EVIDENCE_HARNESS_RESULT_STATUSES)).toBe(true);
    expect(harness).not.toHaveProperty('main');
  });

  it.each([
    ['tenantId', 'tenant-raw-id'],
    ['caseId', 'case-raw-id'],
    ['clientId', 'client-raw-id'],
    ['personId', 'person-raw-id'],
    ['amount', 1250],
    ['rawError', new Error('sensitive failure')],
    ['reason', 'free-text explanation'],
    ['metadata', { arbitrary: true }],
  ])('rejects a non-allowlisted %s field at the runtime boundary', (fieldName, value) => {
    const result = evaluate({ ...validRequest(), [fieldName]: value });

    expect(result.status).toBe('BLOCKED');
    expect(result.blockerCodes).toContain('INVALID_REQUEST_SHAPE');
    expect(Object.keys(result).sort()).toEqual(['blockerCodes', 'contractVersion', 'status']);
    expect(JSON.stringify(result)).not.toContain(String(value));
  });

  it('rejects nested arbitrary metadata', () => {
    const request = validRequest();
    const result = evaluate({
      ...request,
      manifestReference: {
        ...request.manifestReference,
        metadata: { arbitrary: true },
      },
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.blockerCodes).toContain('INVALID_OPAQUE_REFERENCE');
  });

  it('rejects raw or untyped reference values', () => {
    const request = validRequest();
    const result = evaluate({
      ...request,
      sessionReference: {
        ...request.sessionReference,
        opaqueReference: 'raw-business-identifier',
      },
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.blockerCodes).toContain('INVALID_OPAQUE_REFERENCE');
  });

  it('does not activate from an environment variable', () => {
    const previous = process.env.ADR014_LOCAL_EVIDENCE_HARNESS_ENABLED;
    process.env.ADR014_LOCAL_EVIDENCE_HARNESS_ENABLED = 'true';

    try {
      const result = evaluate({ ...validRequest(), enabled: false });
      expect(result.status).toBe('BLOCKED');
      expect(result.blockerCodes).toEqual(['HARNESS_DISABLED']);
    } finally {
      if (previous === undefined) delete process.env.ADR014_LOCAL_EVIDENCE_HARNESS_ENABLED;
      else process.env.ADR014_LOCAL_EVIDENCE_HARNESS_ENABLED = previous;
    }
  });

  it('never echoes input references, canonical SHA or injected payloads into the result', () => {
    const request = validRequest();
    const result = evaluate(request);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(request.canonicalSha);
    expect(serialized).not.toContain(request.environmentReference.opaqueReference);
    expect(serialized).not.toContain(request.accessAuthorizationReference.opaqueReference);
    expect(serialized).not.toContain(request.executionAuthorizationReference.opaqueReference);
    expect(result).toEqual({ contractVersion: '1', status: 'PREPARED', blockerCodes: [] });
  });
});
