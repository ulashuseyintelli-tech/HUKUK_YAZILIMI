import * as core from '../office-cap02-authorization-shadow.core';
import {
  compareAuthorityWithHierarchyTelemetry,
  toAuthorityHierarchyTelemetryEvent,
  type ActorHierarchyFacts,
  type AuthorityHierarchyTelemetryInput,
} from '../office-cap02-authorization-shadow.core';

/**
 * OFFICE-P2-CAP02 — authority ⟷ hiyerarşi telemetrisi doğrulama matrisi.
 * Kaldırılan dormant policy yüzeyi için negatif regresyon de burada.
 */

const T1 = 'tenant-one';
const T2 = 'tenant-two';
const AT = '2026-07-28T00:00:00.000Z';

describe('dormant hierarchy-policy yuzeyi GERI GELMEMELI', () => {
  it.each([
    'compareShadowDecision',
    'summarizeShadowEvidence',
    'toShadowAuditEvent',
    'SHADOW_NEVER_CHANGES_ACCESS',
  ])('%s export EDILMEZ', (name) => {
    expect(Object.keys(core)).not.toContain(name);
  });

  it('modul yalniz iki fonksiyon export eder', () => {
    expect(Object.keys(core).sort()).toEqual([
      'compareAuthorityWithHierarchyTelemetry',
      'toAuthorityHierarchyTelemetryEvent',
    ]);
  });

  it('hicbir export ALLOW / DENY / FALSE_ALLOW / FALSE_DENY uretmez', () => {
    const facts: ActorHierarchyFacts[] = [
      { actorIsActive: true, actorTenantId: T1, disposition: 'TOP_LEVEL', managerUserId: null },
      { actorIsActive: true, actorTenantId: T1, disposition: 'MANAGED', managerUserId: 'm1' },
      { actorIsActive: true, actorTenantId: T1, disposition: null, managerUserId: null },
      { actorIsActive: false, actorTenantId: T1, disposition: 'TOP_LEVEL', managerUserId: null },
      { actorIsActive: true, actorTenantId: T2, disposition: 'MANAGED', managerUserId: 'm1' },
    ];
    for (const verdict of ['SELF_AUTHORITY', 'REQUIRES_APPROVAL'] as const) {
      for (const f of facts) {
        const rec = compareAuthorityWithHierarchyTelemetry(
          {
            correlationId: 'c', tenantId: T1, actorUserId: 'u1',
            incumbentVerdict: verdict, incumbentReasonCode: 'R', incumbentCapacity: 'C',
          },
          f,
        );
        const blob = JSON.stringify([rec, toAuthorityHierarchyTelemetryEvent(rec, AT)]);
        for (const banned of ['ALLOW', 'DENY', 'hierarchyVerdict', 'hierarchyDecision']) {
          // `incumbentVerdict` yururlukteki kararin KAYDIdir; hiyerarsiden turetilmez.
          expect(blob.replace(/"incumbentVerdict":"[A-Z_]+"/g, '')).not.toContain(banned);
        }
      }
    }
  });
});

describe('compareAuthorityWithHierarchyTelemetry — nötr ölçüm, karar değil', () => {
  const input = (
    o: Partial<AuthorityHierarchyTelemetryInput> = {},
  ): AuthorityHierarchyTelemetryInput => ({
    correlationId: 'CHANGE_STATUS|LegalCase|c1',
    tenantId: T1,
    actorUserId: 'u1',
    incumbentVerdict: 'SELF_AUTHORITY',
    incumbentReasonCode: 'PARTNER_SELF_AUTHORITY',
    incumbentCapacity: 'PARTNER',
    ...o,
  });
  const hf = (o: Partial<ActorHierarchyFacts> = {}): ActorHierarchyFacts => ({
    actorIsActive: true,
    actorTenantId: T1,
    disposition: 'TOP_LEVEL',
    managerUserId: null,
    ...o,
  });

  it('TOP_LEVEL + SELF_AUTHORITY -> SAME_CLASS', () => {
    const r = compareAuthorityWithHierarchyTelemetry(input(), hf());
    expect(r.comparison).toBe('SAME_CLASS');
    expect(r.hierarchyDisposition).toBe('TOP_LEVEL');
    expect(r.uncomparableReason).toBeUndefined();
  });

  it('TOP_LEVEL + REQUIRES_APPROVAL -> DIFFERENT_CLASS', () => {
    const r = compareAuthorityWithHierarchyTelemetry(
      input({ incumbentVerdict: 'REQUIRES_APPROVAL' }), hf(),
    );
    expect(r.comparison).toBe('DIFFERENT_CLASS');
  });

  it('MANAGED + REQUIRES_APPROVAL -> SAME_CLASS', () => {
    const r = compareAuthorityWithHierarchyTelemetry(
      input({ incumbentVerdict: 'REQUIRES_APPROVAL' }),
      hf({ disposition: 'MANAGED', managerUserId: 'm1' }),
    );
    expect(r.comparison).toBe('SAME_CLASS');
  });

  it('MANAGED + SELF_AUTHORITY -> DIFFERENT_CLASS', () => {
    const r = compareAuthorityWithHierarchyTelemetry(
      input(), hf({ disposition: 'MANAGED', managerUserId: 'm1' }),
    );
    expect(r.comparison).toBe('DIFFERENT_CLASS');
    expect(r.hierarchyDisposition).toBe('MANAGED');
  });

  it('aktif kayit yok -> UNCOMPARABLE / MISSING_HIERARCHY', () => {
    const r = compareAuthorityWithHierarchyTelemetry(input(), hf({ disposition: null }));
    expect(r.comparison).toBe('UNCOMPARABLE');
    expect(r.uncomparableReason).toBe('MISSING_HIERARCHY');
    expect(r.hierarchyDisposition).toBe('MISSING_HIERARCHY');
  });

  it('pasif aktor -> UNCOMPARABLE / ACTOR_INACTIVE', () => {
    const r = compareAuthorityWithHierarchyTelemetry(input(), hf({ actorIsActive: false }));
    expect(r.comparison).toBe('UNCOMPARABLE');
    expect(r.uncomparableReason).toBe('ACTOR_INACTIVE');
  });

  it('baska tenant -> UNCOMPARABLE / CROSS_TENANT (pasiflikten ONCE)', () => {
    const r = compareAuthorityWithHierarchyTelemetry(
      input(), hf({ actorTenantId: T2, actorIsActive: false }),
    );
    expect(r.comparison).toBe('UNCOMPARABLE');
    expect(r.uncomparableReason).toBe('CROSS_TENANT');
  });

  it('hicbir cikti bir authorization karari TASIMAZ', () => {
    const cases: Array<[Partial<AuthorityHierarchyTelemetryInput>, Partial<ActorHierarchyFacts>]> = [
      [{}, {}],
      [{ incumbentVerdict: 'REQUIRES_APPROVAL' }, {}],
      [{}, { disposition: 'MANAGED', managerUserId: 'm1' }],
      [{}, { disposition: null }],
      [{}, { actorIsActive: false }],
      [{}, { actorTenantId: T2 }],
    ];
    for (const [i, f] of cases) {
      const r = compareAuthorityWithHierarchyTelemetry(input(i), hf(f));
      const keys = Object.keys(r);
      expect(keys).not.toContain('hierarchyVerdict');
      expect(keys).not.toContain('hierarchyDecision');
      expect(keys).not.toContain('decision');
      expect(keys).not.toContain('severity');
      expect(r.accessAffected).toBe(false);
      expect(r.decisionAffected).toBe(false);
      expect(['SAME_CLASS', 'DIFFERENT_CLASS', 'UNCOMPARABLE']).toContain(r.comparison);
    }
  });

  it('observedActionCode karsilastirmaya GIRMEZ (sonuc actionCode ile degismez)', () => {
    const a = compareAuthorityWithHierarchyTelemetry(
      input({ observedActionCode: 'CHANGE_STATUS' }), hf(),
    );
    const b = compareAuthorityWithHierarchyTelemetry(
      input({ observedActionCode: 'CLIENT_PAYOUT' }), hf(),
    );
    const c = compareAuthorityWithHierarchyTelemetry(input(), hf());
    expect(a.comparison).toBe(c.comparison);
    expect(b.comparison).toBe(c.comparison);
    expect(a.observedActionCode).toBe('CHANGE_STATUS');
    expect(c.observedActionCode).toBeUndefined();
  });
});

describe('toAuthorityHierarchyTelemetryEvent', () => {
  const rec = (o: Partial<ActorHierarchyFacts> = {}) =>
    compareAuthorityWithHierarchyTelemetry(
      {
        correlationId: 'CHANGE_STATUS|LegalCase|c1',
        tenantId: T1,
        actorUserId: 'u1',
        incumbentVerdict: 'SELF_AUTHORITY',
        incumbentReasonCode: 'PARTNER_SELF_AUTHORITY',
        incumbentCapacity: 'PARTNER',
        observedActionCode: 'CHANGE_STATUS',
      },
      { actorIsActive: true, actorTenantId: T1, disposition: 'MANAGED', managerUserId: 'm1', ...o },
    );

  it('kapali-kume kodlar tasir, saati cagiran verir, karar alani YOK', () => {
    const e = toAuthorityHierarchyTelemetryEvent(rec(), '2026-07-28T20:00:00.000Z');
    expect(e.eventType).toBe('OFFICE_CAP02_AUTHORITY_HIERARCHY_TELEMETRY');
    expect(e.observedAt).toBe('2026-07-28T20:00:00.000Z');
    expect(e.comparison).toBe('DIFFERENT_CLASS');
    expect(e.accessAffected).toBe(false);
    expect(e.decisionAffected).toBe(false);
    expect(Object.keys(e)).not.toContain('hierarchyVerdict');
    expect(Object.keys(e)).not.toContain('severity');
  });

  it('uncomparableReason yalniz UNCOMPARABLE iken tasinir', () => {
    const withReason = toAuthorityHierarchyTelemetryEvent(rec({ disposition: null }), AT);
    expect(withReason.uncomparableReason).toBe('MISSING_HIERARCHY');
    const without = toAuthorityHierarchyTelemetryEvent(rec(), AT);
    expect(Object.keys(without)).not.toContain('uncomparableReason');
  });
});
