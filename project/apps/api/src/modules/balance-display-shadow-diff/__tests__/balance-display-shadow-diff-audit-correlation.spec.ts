import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ADR014_AUDIT_CORRELATION_CONTRACT,
  ADR014_AUDIT_CORRELATION_CONTRACT_VERSION,
  BalanceDisplayShadowDiffAuditCorrelationPreparation,
} from '../balance-display-shadow-diff-audit-correlation';
import { buildAdr014OperationalEvent, type Adr014OperationalEvent } from '../balance-display-shadow-diff.events';

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

function event(): Adr014OperationalEvent {
  return buildAdr014OperationalEvent(
    {
      eventType: 'ADR014_SHADOW_COMPARISON_BLOCKED',
      severity: 'HARD_STOP',
      component: 'SHADOW_COMPARE',
      operation: 'EVALUATE_READINESS',
      result: 'BLOCKED',
      failureCode: 'NON_ZERO_FINANCIAL_DELTA',
    },
    new Date('2026-07-13T10:00:00.000Z'),
    { GIT_SHA: 'a'.repeat(40), NODE_ENV: 'test' },
  );
}

describe('ADR-014 audit correlation preparation', () => {
  const preparation = new BalanceDisplayShadowDiffAuditCorrelationPreparation();

  it('exact allowlist correlation candidate üretir ve PE-05A2 envelope degerlerini kayipsiz korur', () => {
    const source = event();
    const candidate = preparation.prepare(source);

    expect(Object.keys(candidate).sort()).toEqual([
      'correlation_contract',
      'correlation_contract_version',
      'correlation_reference',
      'durability',
      'persistence',
      'source_event',
    ].sort());
    expect(candidate).toMatchObject({
      correlation_contract: ADR014_AUDIT_CORRELATION_CONTRACT,
      correlation_contract_version: ADR014_AUDIT_CORRELATION_CONTRACT_VERSION,
      correlation_reference: expect.stringMatching(/^adr014-correlation:v1:[0-9a-f-]{36}$/),
      durability: 'NON_DURABLE',
      persistence: 'NOT_CONFIGURED',
      source_event: source,
    });
    expect(candidate.source_event).not.toBe(source);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.source_event)).toBe(true);
  });

  it('correlation reference domain/entity ID veya metric label yerine yeni opaque UUID kullanir', () => {
    const first = preparation.prepare(event()).correlation_reference;
    const second = preparation.prepare(event()).correlation_reference;

    expect(first).not.toBe(second);
    expect(first).not.toContain('tenant');
    expect(first).not.toContain('case');
    expect(first).not.toContain('person');
  });

  it('PII, financial payload, raw error ve arbitrary metadata tasiyan spoofed eventleri fail-closed reddeder', () => {
    const unsafe = {
      ...event(),
      tenantId: 'tenant-secret',
      caseId: 'case-secret',
      amount: 12345,
      metadata: { token: 'secret-token' },
      message: 'raw failure',
      stack: 'raw stack',
    } as unknown as Adr014OperationalEvent;

    expect(() => preparation.prepare(unsafe)).toThrow('non-allowlisted field');
  });

  it.each([
    ['timestamp', 'not-a-timestamp'],
    ['canonical_sha_reference', 'case-secret'],
    ['environment_reference', 'STAGING'],
    ['event_type', 'ADR014_DYNAMIC_EVENT'],
    ['failure_code', 'raw database error'],
  ])('invalid %s degerini durable audit adayi gibi sunmaz', (key, value) => {
    const invalid = { ...event(), [key]: value } as unknown as Adr014OperationalEvent;
    expect(() => preparation.prepare(invalid)).toThrow(TypeError);
  });

  it('serialized candidate forbidden alan veya deger tasimaz', () => {
    const serialized = JSON.stringify(preparation.prepare(event()));

    for (const key of FORBIDDEN_KEYS) expect(serialized).not.toContain(`"${key}"`);
    expect(serialized).not.toContain('tenant-secret');
    expect(serialized).not.toContain('case-secret');
  });

  it('abstraction Prisma, AuditService, logger, network veya persistence side effecti icermez', () => {
    const source = readFileSync(resolve(__dirname, '..', 'balance-display-shadow-diff-audit-correlation.ts'), 'utf8');

    expect(source).not.toMatch(/Prisma|AuditService|HttpService|fetch\(|axios|Logger/);
    expect(source).not.toMatch(/\.create\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(source).not.toMatch(/auditLog|metadata\s*:/);
  });
});
