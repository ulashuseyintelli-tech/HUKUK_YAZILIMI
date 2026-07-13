import {
  ADR014_LOCAL_EVIDENCE_HARNESS_CONTRACT_VERSION,
  ADR014_LOCAL_EVIDENCE_HARNESS_DEFAULT_ENABLED,
  type Adr014BoundOpaqueReference,
  type Adr014LocalEvidenceHarnessBlockerCode,
  type Adr014LocalEvidenceHarnessReferenceKind,
  type Adr014LocalEvidenceHarnessResult,
  type Adr014LocalEvidencePreparationRequest,
  prepareAdr014DisabledLocalEvidenceHarness,
} from '../adr014-disabled-local-evidence-harness';

const CANONICAL_SHA = 'a'.repeat(40);
const BINDING = `adr014-binding:v1:${'a'.repeat(32)}`;

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
  bindingReference = BINDING,
): Adr014BoundOpaqueReference<K> {
  return {
    kind,
    opaqueReference: `adr014-ref:v1:${prefixFor(kind)}:${token.repeat(32)}`,
    bindingReference,
  };
}

function validRequest(enabled = true): Adr014LocalEvidencePreparationRequest {
  return {
    contractVersion: ADR014_LOCAL_EVIDENCE_HARNESS_CONTRACT_VERSION,
    enabled,
    canonicalSha: CANONICAL_SHA,
    environmentReference: boundReference('ENVIRONMENT', '1'),
    sessionReference: boundReference('SESSION', '2'),
    manifestReference: boundReference('MANIFEST', '3'),
    accessAuthorizationReference: boundReference('ACCESS_AUTHORIZATION', '4'),
    executionAuthorizationReference: boundReference('EXECUTION_AUTHORIZATION', '5'),
  };
}

function evaluate(input: unknown, currentCanonicalSha = CANONICAL_SHA): Adr014LocalEvidenceHarnessResult {
  return prepareAdr014DisabledLocalEvidenceHarness(input as Adr014LocalEvidencePreparationRequest, {
    currentCanonicalSha,
  });
}

function expectBlocked(
  input: unknown,
  blockerCode: Adr014LocalEvidenceHarnessBlockerCode,
  currentCanonicalSha = CANONICAL_SHA,
): void {
  const result = evaluate(input, currentCanonicalSha);
  expect(result.status).toBe('BLOCKED');
  expect(result.blockerCodes).toContain(blockerCode);
}

describe('ADR014-PE-06A disabled local evidence harness', () => {
  it('default disabled contract produces only HARNESS_DISABLED', () => {
    const result = evaluate(validRequest(ADR014_LOCAL_EVIDENCE_HARNESS_DEFAULT_ENABLED));

    expect(result).toEqual({
      contractVersion: '1',
      status: 'BLOCKED',
      blockerCodes: ['HARNESS_DISABLED'],
    });
  });

  it('accepts an exact lowercase 40-character current canonical SHA', () => {
    expect(evaluate(validRequest())).toEqual({
      contractVersion: '1',
      status: 'PREPARED',
      blockerCodes: [],
    });
  });

  it.each([
    ['short', 'a'.repeat(39)],
    ['long', 'a'.repeat(41)],
    ['uppercase', 'A'.repeat(40)],
    ['non-hex', `${'a'.repeat(39)}g`],
    ['empty', ''],
  ])('blocks an invalid canonical SHA: %s', (_label, canonicalSha) => {
    expectBlocked({ ...validRequest(), canonicalSha }, 'INVALID_CANONICAL_SHA');
  });

  it('blocks a valid SHA that does not match the trusted current SHA constraint', () => {
    expectBlocked(validRequest(), 'CANONICAL_SHA_MISMATCH', 'b'.repeat(40));
  });

  it.each([
    ['environmentReference', 'MISSING_ENVIRONMENT_REFERENCE'],
    ['sessionReference', 'MISSING_SESSION_REFERENCE'],
    ['manifestReference', 'MISSING_MANIFEST_REFERENCE'],
    ['accessAuthorizationReference', 'MISSING_ACCESS_AUTHORIZATION'],
    ['executionAuthorizationReference', 'MISSING_EXECUTION_AUTHORIZATION'],
  ] as const)('blocks a missing %s', (fieldName, blockerCode) => {
    expectBlocked({ ...validRequest(), [fieldName]: undefined }, blockerCode);
  });

  it('keeps access and execution authorization as distinct required references', () => {
    const request = validRequest();
    expectBlocked(
      {
        ...request,
        executionAuthorizationReference: request.accessAuthorizationReference,
      },
      'INVALID_OPAQUE_REFERENCE',
    );
  });

  it('blocks reference binding mismatch', () => {
    const request = validRequest();
    expectBlocked(
      {
        ...request,
        manifestReference: boundReference(
          'MANIFEST',
          '3',
          `adr014-binding:v1:${'b'.repeat(32)}`,
        ),
      },
      'REFERENCE_BINDING_MISMATCH',
    );
  });

  it('blocks unsupported contract versions', () => {
    expectBlocked({ ...validRequest(), contractVersion: '2' }, 'UNSUPPORTED_CONTRACT_VERSION');
  });

  it('returns blockers in one deterministic bounded order without duplicates', () => {
    const result = evaluate({
      ...validRequest(false),
      canonicalSha: 'INVALID',
      environmentReference: undefined,
      metadata: { arbitrary: true },
    });

    expect(result).toEqual({
      contractVersion: '1',
      status: 'BLOCKED',
      blockerCodes: [
        'HARNESS_DISABLED',
        'INVALID_REQUEST_SHAPE',
        'INVALID_CANONICAL_SHA',
        'MISSING_ENVIRONMENT_REFERENCE',
      ],
    });
  });

  it('is deterministic for repeated inputs and independent of environment state', () => {
    const previous = process.env.ADR014_LOCAL_EVIDENCE_HARNESS_ENABLED;
    process.env.ADR014_LOCAL_EVIDENCE_HARNESS_ENABLED = 'true';

    try {
      const input = validRequest();
      expect(evaluate(input)).toEqual(evaluate(input));
    } finally {
      if (previous === undefined) delete process.env.ADR014_LOCAL_EVIDENCE_HARNESS_ENABLED;
      else process.env.ADR014_LOCAL_EVIDENCE_HARNESS_ENABLED = previous;
    }
  });

  it('returns a frozen result that is detached from later request mutation', () => {
    const request = validRequest();
    const result = evaluate(request);
    const serialized = JSON.stringify(result);

    Reflect.set(request.environmentReference, 'opaqueReference', 'changed-after-evaluation');

    expect(JSON.stringify(result)).toBe(serialized);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.blockerCodes)).toBe(true);
  });

  it('does not depend on date or random sources', () => {
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now must not be used');
    });
    const randomSpy = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not be used');
    });

    const result = evaluate(validRequest());
    const dateCalls = dateSpy.mock.calls.length;
    const randomCalls = randomSpy.mock.calls.length;
    dateSpy.mockRestore();
    randomSpy.mockRestore();

    expect(result.status).toBe('PREPARED');
    expect(dateCalls).toBe(0);
    expect(randomCalls).toBe(0);
  });
});
