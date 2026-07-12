import {
  ADR014_OPERATIONAL_EVENT_COMPONENTS,
  ADR014_OPERATIONAL_EVENT_FAILURE_CODES,
  ADR014_OPERATIONAL_EVENT_OPERATIONS,
  ADR014_OPERATIONAL_EVENT_RESULTS,
  ADR014_OPERATIONAL_EVENT_SEVERITIES,
  ADR014_OPERATIONAL_EVENT_TYPES,
  ADR014_OPERATIONAL_EVENT_VERSION,
  buildAdr014OperationalEvent,
  canonicalShaReference,
  environmentReference,
} from '../balance-display-shadow-diff.events';

const REQUIRED_KEYS = [
  'event_type',
  'event_version',
  'timestamp',
  'severity',
  'component',
  'operation',
  'result',
  'failure_code',
  'canonical_sha_reference',
  'environment_reference',
] as const;

const FORBIDDEN_KEYS = [
  'tenantId',
  'caseId',
  'debtorId',
  'clientId',
  'personId',
  'amount',
  'principal',
  'interest',
  'fee',
  'delta',
  'message',
  'stack',
  'token',
  'secret',
  'password',
  'metadata',
] as const;

describe('ADR-014 PII-safe operational event contract', () => {
  it('required allowlist alanlarini stable version ve controlled context ile üretir', () => {
    const sha = 'a'.repeat(40);
    const event = buildAdr014OperationalEvent(
      {
        eventType: 'ADR014_SHADOW_COMPONENT_COMPLETED',
        severity: 'INFO',
        component: 'LEGACY',
        operation: 'CALCULATE',
        result: 'SUCCESS',
        failureCode: 'NONE',
      },
      new Date('2026-07-13T08:30:00.000Z'),
      { GIT_SHA: sha, NODE_ENV: 'test' },
    );

    expect(Object.keys(event).sort()).toEqual([...REQUIRED_KEYS].sort());
    expect(event).toEqual({
      event_type: 'ADR014_SHADOW_COMPONENT_COMPLETED',
      event_version: ADR014_OPERATIONAL_EVENT_VERSION,
      timestamp: '2026-07-13T08:30:00.000Z',
      severity: 'INFO',
      component: 'LEGACY',
      operation: 'CALCULATE',
      result: 'SUCCESS',
      failure_code: 'NONE',
      canonical_sha_reference: sha,
      environment_reference: 'TEST',
    });
    expect(Object.isFrozen(event)).toBe(true);
    expect(Number.isNaN(Date.parse(event.timestamp))).toBe(false);
  });

  it('invalid veya eksik build context icin sahte SHA/reference üretmez', () => {
    expect(canonicalShaReference({ GIT_SHA: 'not-a-sha' })).toBe('UNKNOWN');
    expect(canonicalShaReference({})).toBe('UNKNOWN');
    expect(environmentReference({ NODE_ENV: 'custom' })).toBe('UNKNOWN');
    expect(environmentReference({})).toBe('UNKNOWN');
  });

  it('optional reference alanlarini kaynak yokken tamamen omit eder', () => {
    const event = buildAdr014OperationalEvent({
      eventType: 'ADR014_SHADOW_COMPARISON_STARTED',
      severity: 'INFO',
      component: 'SHADOW_COMPARE',
      operation: 'COMPARE',
      result: 'SUCCESS',
      failureCode: 'NONE',
    });

    expect(event).not.toHaveProperty('session_reference');
    expect(event).not.toHaveProperty('manifest_reference');
    expect(event).not.toHaveProperty('trace_reference');
    expect(event).not.toHaveProperty('evidence_reference');
  });

  it('event/severity/component/operation/result/failure code sozluklerini bounded tutar', () => {
    expect(ADR014_OPERATIONAL_EVENT_TYPES).toEqual([
      'ADR014_SHADOW_COMPARISON_STARTED',
      'ADR014_SHADOW_COMPONENT_COMPLETED',
      'ADR014_SHADOW_COMPONENT_FAILED',
      'ADR014_SHADOW_COMPARISON_COMPLETED',
      'ADR014_SHADOW_COMPARISON_BLOCKED',
      'ADR014_SHADOW_COMPARISON_UNAVAILABLE',
    ]);
    expect(ADR014_OPERATIONAL_EVENT_SEVERITIES).toEqual(['INFO', 'WARNING', 'CRITICAL', 'HARD_STOP']);
    expect(ADR014_OPERATIONAL_EVENT_COMPONENTS).toEqual(['LEGACY', 'CANONICAL', 'SHADOW_COMPARE']);
    expect(ADR014_OPERATIONAL_EVENT_OPERATIONS).toEqual(['CALCULATE', 'COMPARE', 'EVALUATE_READINESS']);
    expect(ADR014_OPERATIONAL_EVENT_RESULTS).toEqual(['SUCCESS', 'ERROR', 'BLOCKED', 'UNAVAILABLE']);
    expect(ADR014_OPERATIONAL_EVENT_FAILURE_CODES).toContain('NON_ZERO_FINANCIAL_DELTA');
    expect(ADR014_OPERATIONAL_EVENT_FAILURE_CODES).toContain('MANDATORY_FIELD_NOT_COMPARABLE');
  });

  it('serialized contract forbidden alan veya arbitrary metadata yüzeyi tasimaz', () => {
    const serialized = JSON.stringify(buildAdr014OperationalEvent({
      eventType: 'ADR014_SHADOW_COMPARISON_BLOCKED',
      severity: 'HARD_STOP',
      component: 'SHADOW_COMPARE',
      operation: 'EVALUATE_READINESS',
      result: 'BLOCKED',
      failureCode: 'NON_ZERO_FINANCIAL_DELTA',
    }));

    for (const key of FORBIDDEN_KEYS) expect(serialized).not.toContain(`"${key}"`);
  });
});
