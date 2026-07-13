import {
  ADR014_EVIDENCE_SEAL_ITEM_KINDS,
  ADR014_LOCAL_ALERT_RULES,
  ADR014_LOCAL_DASHBOARD_QUERIES,
  ADR014_LOCAL_MONITORING_METRICS,
  type Adr014LocalAuditEntryInput,
  createAdr014LocalObservabilityPreparation,
} from '../adr014-local-observability-surfaces';

const SHA = 'a'.repeat(40);
const TOKEN = '1'.repeat(32);
const HASH = '2'.repeat(64);
const ENVIRONMENT_REFERENCE = `adr014-ref:v1:environment:${TOKEN}`;
const SESSION_REFERENCE = `adr014-ref:v1:session:${TOKEN}`;
const MANIFEST_REFERENCE = `adr014-ref:v1:manifest:${TOKEN}`;
const AUTHORIZATION_REFERENCE = `adr014-ref:v1:execution-authorization:${TOKEN}`;

function entry(overrides: Partial<Adr014LocalAuditEntryInput> = {}) {
  return Object.freeze({
    correlationReference: 'adr014-correlation:v1:12345678-1234-4234-8234-123456789abc',
    actorRole: 'OWNER',
    action: 'SESSION_STATE_OBSERVED',
    target: 'SESSION',
    previousState: 'ABSENT',
    newState: 'ACTIVE',
    reasonCode: 'NONE',
    timestamp: '2026-07-13T12:00:00.000Z',
    canonicalSha: SHA,
    environmentReference: ENVIRONMENT_REFERENCE,
    sessionReference: SESSION_REFERENCE,
    authorizationReference: AUTHORIZATION_REFERENCE,
    ...overrides,
  } as const);
}

function append(chain: readonly unknown[], input = entry()) {
  return createAdr014LocalObservabilityPreparation({ mode: 'TEST_ONLY' })
    .appendAudit({ chain, entry: input });
}

function chain() {
  const result = append([]);
  if (result.status !== 'PREPARED') throw new Error('expected prepared chain');
  return result.value;
}

function items() {
  const prefix = {
    METRIC_WINDOW: 'adr014-metric-window',
    DASHBOARD_SNAPSHOT: 'adr014-dashboard-snapshot',
    ALERT_INVENTORY: 'adr014-alert-inventory',
    AUDIT_CHAIN: 'adr014-audit-chain',
  } as const;
  return ADR014_EVIDENCE_SEAL_ITEM_KINDS.map((kind) => Object.freeze({
    kind,
    reference: `${prefix[kind]}:v1:${HASH}`,
    digest: `sha256:${HASH}`,
  }));
}

function sealRequest() {
  return Object.freeze({
    canonicalSha: SHA,
    environmentReference: ENVIRONMENT_REFERENCE,
    sessionReference: SESSION_REFERENCE,
    manifestReference: MANIFEST_REFERENCE,
    sealedAt: '2026-07-13T12:05:00.000Z',
    auditChain: chain(),
    items: items(),
  });
}

describe('ADR014 PE-06E local observability surfaces', () => {
  it('is default-disabled and does not inspect caller input', () => {
    const preparation = createAdr014LocalObservabilityPreparation();
    const hostile = Object.defineProperty({}, 'entry', {
      get: () => { throw new Error('must not inspect'); },
    });

    expect(preparation.mode).toBe('DISABLED');
    expect(preparation.appendAudit(hostile)).toEqual({ status: 'DISABLED' });
    expect(preparation.sealEvidence(hostile)).toEqual({ status: 'DISABLED' });
    expect(preparation.describeMonitoring()).toEqual({ status: 'DISABLED' });
  });

  it('prepares a deterministic immutable append-only audit reference chain', () => {
    const first = append([]);
    const repeated = append([]);
    expect(first).toEqual(repeated);
    expect(first.status).toBe('PREPARED');
    if (first.status !== 'PREPARED') throw new Error('expected prepared chain');

    const second = append(first.value, entry({
      previousState: 'ACTIVE', newState: 'ABORTED', reasonCode: 'SESSION_ABORTED',
      timestamp: '2026-07-13T12:01:00.000Z',
    }));
    expect(second.status).toBe('PREPARED');
    if (second.status !== 'PREPARED') throw new Error('expected second entry');
    expect(first.value).toHaveLength(1);
    expect(second.value).toHaveLength(2);
    expect(second.value[1]?.sequence).toBe(2);
    expect(second.value[1]?.parentAuditReference).toBe(first.value[0]?.auditReference);
    expect(Object.isFrozen(second.value)).toBe(true);
    expect(second.value.every(Object.isFrozen)).toBe(true);
  });

  it('fails closed for tampered, discontinuous, or backdated audit chains', () => {
    const valid = chain();
    const tampered = [{ ...valid[0], reasonCode: 'SOURCE_UNAVAILABLE' }];
    expect(append(tampered)).toEqual({ status: 'BLOCKED', blockerCode: 'INVALID_AUDIT_CHAIN' });
    expect(append(valid, entry({ timestamp: '2026-07-13T11:59:59.000Z' }))).toEqual({
      status: 'BLOCKED', blockerCode: 'BACKDATED_AUDIT_ENTRY',
    });
    expect(append(valid, entry({ sessionReference: `adr014-ref:v1:session:${'3'.repeat(32)}` })))
      .toEqual({ status: 'BLOCKED', blockerCode: 'AUDIT_CHAIN_CONTINUITY_MISMATCH' });
  });

  it('seals a complete deterministic reference index without authority or persistence', () => {
    const preparation = createAdr014LocalObservabilityPreparation({ mode: 'TEST_ONLY' });
    const first = preparation.sealEvidence(sealRequest());
    const repeated = preparation.sealEvidence(sealRequest());
    expect(first).toEqual(repeated);
    expect(first.status).toBe('PREPARED');
    if (first.status !== 'PREPARED') throw new Error('expected sealed reference');
    expect(first.value).toMatchObject({
      status: 'REFERENCE_SEALED', authority: 'NONE', official: false, persisted: false,
    });
    expect(first.value.items.map((item) => item.kind)).toEqual(ADR014_EVIDENCE_SEAL_ITEM_KINDS);
    expect(Object.isFrozen(first.value)).toBe(true);
    expect(Object.isFrozen(first.value.items)).toBe(true);

    const superseding = preparation.sealEvidence({
      ...sealRequest(),
      sealedAt: '2026-07-13T12:06:00.000Z',
      supersedesEvidenceReference: first.value.evidenceReference,
    });
    expect(superseding.status).toBe('PREPARED');
    if (superseding.status !== 'PREPARED') throw new Error('expected superseding seal');
    expect(superseding.value.supersedesEvidenceReference).toBe(first.value.evidenceReference);
    expect(superseding.value.evidenceReference).not.toBe(first.value.evidenceReference);
  });

  it('fails closed for incomplete, duplicate, mismatched, or arbitrary evidence references', () => {
    const preparation = createAdr014LocalObservabilityPreparation({ mode: 'TEST_ONLY' });
    expect(preparation.sealEvidence({ ...sealRequest(), items: items().slice(1) })).toEqual({
      status: 'BLOCKED', blockerCode: 'INCOMPLETE_EVIDENCE_REFERENCE_INDEX',
    });
    expect(preparation.sealEvidence({ ...sealRequest(), items: [...items(), items()[0]] })).toEqual({
      status: 'BLOCKED', blockerCode: 'INCOMPLETE_EVIDENCE_REFERENCE_INDEX',
    });
    expect(preparation.sealEvidence({ ...sealRequest(), canonicalSha: 'b'.repeat(40) })).toEqual({
      status: 'BLOCKED', blockerCode: 'INVALID_EVIDENCE_SEAL_REQUEST',
    });
    const invalidItems = items().map((item) => item.kind === 'AUDIT_CHAIN'
      ? { ...item, reference: 'arbitrary-reference' }
      : item);
    expect(preparation.sealEvidence({ ...sealRequest(), items: invalidItems })).toEqual({
      status: 'BLOCKED', blockerCode: 'INVALID_EVIDENCE_SEAL_REQUEST',
    });
  });

  it('exposes only inert local read-only dashboards and rule-only alerts', () => {
    const result = createAdr014LocalObservabilityPreparation({ mode: 'TEST_ONLY' })
      .describeMonitoring();
    expect(result.status).toBe('PREPARED');
    if (result.status !== 'PREPARED') throw new Error('expected monitoring contract');
    expect(result.value).toMatchObject({
      locality: 'OWNER_CONTROLLED_LOCAL_ONLY', access: 'READ_ONLY', defaultMode: 'DISABLED',
      runtimeEmission: 'NONE', persistence: 'NOT_CONFIGURED', externalDelivery: 'NOT_CONFIGURED',
    });
    expect(new Set(ADR014_LOCAL_DASHBOARD_QUERIES.map((query) => query.queryId)).size)
      .toBe(ADR014_LOCAL_DASHBOARD_QUERIES.length);
    expect(new Set(ADR014_LOCAL_ALERT_RULES.map((rule) => rule.ruleCode)).size)
      .toBe(ADR014_LOCAL_ALERT_RULES.length);
    expect(ADR014_LOCAL_ALERT_RULES.every((rule) =>
      ADR014_LOCAL_DASHBOARD_QUERIES.some((query) => query.queryId === rule.sourceQueryId) &&
      rule.delivery === 'NOT_CONFIGURED')).toBe(true);
    expect(ADR014_LOCAL_DASHBOARD_QUERIES.every((query) =>
      ADR014_LOCAL_MONITORING_METRICS.includes(query.metricName))).toBe(true);
    expect(ADR014_LOCAL_MONITORING_METRICS).not.toContain('adr014_execution_requests_total');
    expect(ADR014_LOCAL_MONITORING_METRICS).not.toContain('adr014_control_events_total');
  });
});
