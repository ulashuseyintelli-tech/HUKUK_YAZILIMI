import {
  compareShadowDecision,
  summarizeShadowEvidence,
  toShadowAuditEvent,
  SHADOW_NEVER_CHANGES_ACCESS,
  type HierarchyFacts,
  type ShadowEvaluationInput,
} from '../office-cap02-authorization-shadow.core';

/**
 * OFFICE-P2-CAP02-AUTHORIZATION-SHADOW doğrulama matrisi.
 * Owner'ın §16 test listesinin tamamı + kanıt toplama + audit olayı.
 */

const T1 = 'tenant-one';
const T2 = 'tenant-two';
const AT = '2026-07-28T00:00:00.000Z';

const input = (o: Partial<ShadowEvaluationInput> = {}): ShadowEvaluationInput => ({
  correlationId: 'corr-1',
  tenantId: T1,
  subjectUserId: 'u-manager',
  targetActorUserId: 'u-actor',
  legacyDecision: 'ALLOW',
  globalAccessReason: null,
  ...o,
});

const facts = (o: Partial<HierarchyFacts> = {}): HierarchyFacts => ({
  subjectIsActive: true,
  subjectTenantId: T1,
  targetIsActive: true,
  targetTenantId: T1,
  subjectManagesTarget: true,
  targetDisposition: 'MANAGED',
  ...o,
});

describe('SHADOW erişimi asla değiştirmez', () => {
  it('sabit ve audit olayı bunu görünür kılar', () => {
    expect(SHADOW_NEVER_CHANGES_ACCESS).toBe(true);
    const ev = toShadowAuditEvent(compareShadowDecision(input(), facts()), AT);
    expect(ev.accessAffected).toBe(false);
  });

  it('karşılaştırma kaydı bir KARAR alanı içermez', () => {
    const r = compareShadowDecision(input(), facts());
    expect(Object.keys(r)).not.toContain('decision');
    expect(Object.keys(r)).not.toContain('effectiveDecision');
  });
});

describe('same-tenant MANAGED kapsamı', () => {
  it('amir kendi personeline erişiyor, legacy ALLOW -> MATCH', () => {
    const r = compareShadowDecision(input(), facts());
    expect(r).toMatchObject({ outcome: 'MATCH', hierarchyDecision: 'ALLOW', severity: 'NONE' });
  });

  it('amir OLMAYAN kişi, legacy DENY -> MATCH', () => {
    const r = compareShadowDecision(input({ legacyDecision: 'DENY' }), facts({ subjectManagesTarget: false }));
    expect(r).toMatchObject({ outcome: 'MATCH', hierarchyDecision: 'DENY' });
  });
});

describe('TOP_LEVEL kapsamı', () => {
  it('TOP_LEVEL hedefe amir olmayan erişim DENY ile eşleşir', () => {
    const r = compareShadowDecision(
      input({ legacyDecision: 'DENY' }),
      facts({ targetDisposition: 'TOP_LEVEL', subjectManagesTarget: false }),
    );
    expect(r).toMatchObject({ outcome: 'MATCH', hierarchyDecision: 'DENY' });
  });

  it('TOP_LEVEL hedefe legacy ALLOW verirse FALSE_DENY olarak işaretlenir', () => {
    const r = compareShadowDecision(
      input({ legacyDecision: 'ALLOW' }),
      facts({ targetDisposition: 'TOP_LEVEL', subjectManagesTarget: false }),
    );
    expect(r).toMatchObject({ outcome: 'FALSE_DENY', severity: 'CRITICAL' });
  });
});

describe('cross-tenant denial prediction', () => {
  it('target başka tenant ta, legacy DENY -> CROSS_TENANT_DENIED / severity NONE', () => {
    const r = compareShadowDecision(
      input({ legacyDecision: 'DENY' }),
      facts({ targetTenantId: T2 }),
    );
    expect(r).toMatchObject({ outcome: 'CROSS_TENANT_DENIED', hierarchyDecision: 'DENY', severity: 'NONE' });
  });

  it('cross-tenant iken legacy ALLOW verirse KRITIK', () => {
    const r = compareShadowDecision(input({ legacyDecision: 'ALLOW' }), facts({ subjectTenantId: T2 }));
    expect(r).toMatchObject({ outcome: 'CROSS_TENANT_DENIED', severity: 'CRITICAL' });
  });

  it('tenant kontrolü global-access istisnasından ÖNCE gelir', () => {
    const r = compareShadowDecision(
      input({ legacyDecision: 'ALLOW', globalAccessReason: 'ADMIN_ROLE' }),
      facts({ targetTenantId: T2 }),
    );
    expect(r.outcome).toBe('CROSS_TENANT_DENIED');
    expect(r.severity).toBe('CRITICAL');
  });
});

describe('pasif principal', () => {
  it('pasif subject + legacy ALLOW -> FALSE_DENY / CRITICAL', () => {
    const r = compareShadowDecision(input(), facts({ subjectIsActive: false }));
    expect(r).toMatchObject({ outcome: 'FALSE_DENY', hierarchyDecision: 'DENY', severity: 'CRITICAL' });
    expect(r.reason).toMatch(/subject pasif/);
  });

  it('pasif target + legacy ALLOW -> FALSE_DENY / CRITICAL', () => {
    const r = compareShadowDecision(input(), facts({ targetIsActive: false }));
    expect(r.outcome).toBe('FALSE_DENY');
    expect(r.reason).toMatch(/target pasif/);
  });

  it('pasif subject + legacy DENY -> MATCH', () => {
    const r = compareShadowDecision(input({ legacyDecision: 'DENY' }), facts({ subjectIsActive: false }));
    expect(r).toMatchObject({ outcome: 'MATCH', severity: 'NONE' });
  });
});

describe('missing hierarchy — sessizce DENY sayılmaz', () => {
  it('aktif ReportingLine kaydı yoksa MISSING_HIERARCHY', () => {
    const r = compareShadowDecision(input(), facts({ subjectManagesTarget: null, targetDisposition: null }));
    expect(r).toMatchObject({ outcome: 'MISSING_HIERARCHY', hierarchyDecision: null, severity: 'INFO' });
  });

  it('MISSING_HIERARCHY, legacy DENY olsa bile MATCH sayılmaz', () => {
    const r = compareShadowDecision(
      input({ legacyDecision: 'DENY' }),
      facts({ subjectManagesTarget: null, targetDisposition: null }),
    );
    expect(r.outcome).toBe('MISSING_HIERARCHY');
    expect(r.outcome).not.toBe('MATCH');
  });

  it('MISSING_HIERARCHY hiçbir zaman CRITICAL değildir', () => {
    for (const legacy of ['ALLOW', 'DENY'] as const) {
      const r = compareShadowDecision(
        input({ legacyDecision: legacy }),
        facts({ subjectManagesTarget: null, targetDisposition: null }),
      );
      expect(r.severity).not.toBe('CRITICAL');
    }
  });
});

describe('global-access istisnası', () => {
  it.each(['ADMIN_ROLE', 'SELF_ACCESS', 'SYSTEM_INTERNAL'] as const)(
    '%s ile verilen erişim FALSE_ALLOW sayılmaz',
    (reason) => {
      const r = compareShadowDecision(
        input({ legacyDecision: 'ALLOW', globalAccessReason: reason }),
        facts({ subjectManagesTarget: false }),
      );
      expect(r).toMatchObject({ outcome: 'GLOBAL_ACCESS_EXCEPTION', hierarchyDecision: null, severity: 'INFO' });
    },
  );
});

describe('false positive / false negative', () => {
  it('FALSE_ALLOW: hiyerarşi ALLOW, legacy DENY -> yetki genişlemesi riski', () => {
    const r = compareShadowDecision(input({ legacyDecision: 'DENY' }), facts({ subjectManagesTarget: true }));
    expect(r).toMatchObject({ outcome: 'FALSE_ALLOW', severity: 'CRITICAL' });
    expect(r.reason).toMatch(/yetki genis/i);
  });

  it('FALSE_DENY: hiyerarşi DENY, legacy ALLOW -> erişim kaybı riski', () => {
    const r = compareShadowDecision(input({ legacyDecision: 'ALLOW' }), facts({ subjectManagesTarget: false }));
    expect(r).toMatchObject({ outcome: 'FALSE_DENY', severity: 'CRITICAL' });
    expect(r.reason).toMatch(/erisim kayb/i);
  });
});

describe('kanıt toplama', () => {
  const mk = (o: Partial<ShadowEvaluationInput>, f: Partial<HierarchyFacts> = {}) =>
    compareShadowDecision(input(o), facts(f));

  it('oranlar yalnız KARŞILAŞTIRILABİLİR olaylar üzerinden hesaplanır', () => {
    const s = summarizeShadowEvidence([
      mk({}), // MATCH
      mk({ legacyDecision: 'DENY' }, { subjectManagesTarget: true }), // FALSE_ALLOW
      mk({}, { subjectManagesTarget: null, targetDisposition: null }), // MISSING_HIERARCHY
      mk({ globalAccessReason: 'ADMIN_ROLE' }), // GLOBAL_ACCESS_EXCEPTION
    ]);
    expect(s.total).toBe(4);
    expect(s.comparableTotal).toBe(2); // MISSING + GLOBAL sayılmaz
    expect(s.falseAllowRate).toBeCloseTo(0.5);
    expect(s.falseDenyRate).toBe(0);
  });

  it('acceptance gate tek bir CRITICAL ile düşer', () => {
    expect(summarizeShadowEvidence([mk({})]).acceptanceGatePass).toBe(true);
    const withCritical = summarizeShadowEvidence([
      mk({}),
      mk({ legacyDecision: 'DENY' }, { subjectManagesTarget: true }),
    ]);
    expect(withCritical.criticalCount).toBe(1);
    expect(withCritical.acceptanceGatePass).toBe(false);
  });

  it('yalnız MISSING_HIERARCHY den oluşan kanıt gate i düşürmez ama oran üretmez', () => {
    const s = summarizeShadowEvidence([
      mk({}, { subjectManagesTarget: null, targetDisposition: null }),
      mk({}, { subjectManagesTarget: null, targetDisposition: null }),
    ]);
    expect(s.comparableTotal).toBe(0);
    expect(s.falseAllowRate).toBe(0);
    expect(s.acceptanceGatePass).toBe(true);
  });

  it('boş kanıt seti sıfır bölme üretmez', () => {
    const s = summarizeShadowEvidence([]);
    expect(s).toMatchObject({ total: 0, comparableTotal: 0, falseAllowRate: 0, falseDenyRate: 0 });
  });
});

describe('provider-neutral audit olayı', () => {
  it('kimlik/kişisel alan taşımaz, yalnız opak correlationId', () => {
    const ev = toShadowAuditEvent(compareShadowDecision(input(), facts()), AT);
    expect(ev.correlationId).toBe('corr-1');
    const keys = Object.keys(ev);
    for (const forbidden of ['subjectUserId', 'targetActorUserId', 'email', 'name', 'tckn']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('observedAt dışarıdan verilir — modül sistem saatini okumaz', () => {
    const ev = toShadowAuditEvent(compareShadowDecision(input(), facts()), '2026-01-01T00:00:00.000Z');
    expect(ev.observedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('eventType sabit ve provider bağımsızdır', () => {
    const ev = toShadowAuditEvent(compareShadowDecision(input(), facts()), AT);
    expect(ev.eventType).toBe('OFFICE_CAP02_AUTHORIZATION_SHADOW_COMPARISON');
  });
});
