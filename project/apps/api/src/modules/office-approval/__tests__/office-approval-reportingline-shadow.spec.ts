/** @jest-environment node */
import 'reflect-metadata';
import { OfficeApprovalShadowService } from '../office-approval-shadow.service';

/**
 * OFFICE-P2-CAP02-SHADOW-NEUTRAL-TELEMETRY-REPAIR-I01 — ReportingLine telemetri katmanı.
 * OFFICE-P2-CAP02-TELEMETRY-CANARY-SCOPE-I01 — canary-scoped aktivasyon (bu dosya).
 *
 * OWNER KARARI (2026-07-28, OPTION A): `ReportingLine` yalnız organizasyonel hiyerarşi
 * gerçeğidir; ondan allow / deny / requiresApproval / selfAuthority KARARI ÜRETİLEMEZ.
 * Bu katman NÖTR bir sınıf karşılaştırması yapar ve hiçbir kararı etkilemez.
 *
 * Kanıtlanan sözleşme:
 *  1. Master flag kapalı → DB sorgusu 0, telemetri 0, authorization DEĞİŞMEZ.
 *  2. Master flag açık + tenant allowlist BOŞ/YANLIŞ → YİNE dormant (H1 sıkılaştırması).
 *  3. Master + tenant + (varsa) actor allowlist eşleşirse → SAME_CLASS / DIFFERENT_CLASS /
 *     UNCOMPARABLE kaydedilir; karar DEĞİŞMEZ.
 *  4. Telemetri hatası request'i etkilemez; `enforce` davranışı AYNEN kalır.
 */

// Aktivasyon çekirdeği tenantId/userId'nin cuid ŞEKLİNDE olmasını zorunlu kılar
// (malformed-config korumasının parçası) — bu yüzden test kimlikleri de o şekle uyar.
const T1 = 'ctenant1'.padEnd(24, '0'); // allowlisted tenant
const T2 = 'ctenant2'.padEnd(24, '0'); // allowlist DIŞINDA tenant
const U1 = 'cuser0001'.padEnd(24, '0');

const baseInput = {
  actorUserId: U1,
  tenantId: T1,
  actionCode: 'CHANGE_STATUS',
  targetType: 'LegalCase',
  targetRef: 'c1',
  payload: { status: 'ACIZ', reason: 'x' as string | null },
};

const u = (over: Record<string, unknown> = {}) => ({
  id: U1, isActive: true, tenantId: T1, lawyer: null, staffMember: null, ...over,
});
/** yürürlükteki karar → SELF_AUTHORITY */
const partner = () => u({ lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } });
/** yürürlükteki karar → REQUIRES_APPROVAL */
const staff = () => u({ staffMember: { staffType: 'SEKRETER' } });

const make = (opts: {
  gate?: string;
  shadowFlag?: string;
  tenantAllowlist?: string;
  actorAllowlist?: string;
  user?: unknown;
  line?: unknown;
  lineThrows?: boolean;
  auditThrows?: boolean;
}) => {
  const config = {
    get: jest.fn((k: string) => {
      if (k === 'OFFICE_APPROVAL_CHANGE_STATUS_GATE') return opts.gate;
      if (k === 'OFFICE_CAP02_REPORTINGLINE_SHADOW') return opts.shadowFlag;
      if (k === 'OFFICE_CAP02_REPORTINGLINE_SHADOW_TENANT_ALLOWLIST') return opts.tenantAllowlist;
      if (k === 'OFFICE_CAP02_REPORTINGLINE_SHADOW_ACTOR_ALLOWLIST') return opts.actorAllowlist;
      return undefined;
    }),
  };
  const findFirst = opts.lineThrows
    ? jest.fn().mockRejectedValue(new Error('reporting line boom'))
    : jest.fn().mockResolvedValue(opts.line ?? null);
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(opts.user ?? null) },
    reportingLine: { findFirst },
    officeApprovalRequest: { create: jest.fn() },
  };
  const audit = {
    log: opts.auditThrows
      ? jest.fn().mockRejectedValue(new Error('audit boom'))
      : jest.fn().mockResolvedValue(undefined),
  };
  const officeApproval = {
    createPendingRequest: jest.fn().mockResolvedValue({ id: 'req-1', status: 'PENDING_APPROVAL' }),
  };
  const svc = new OfficeApprovalShadowService(
    config as never, prisma as never, audit as never, officeApproval as never,
  );
  return { svc, prisma, audit, officeApproval };
};

/** Telemetri audit'ini döndürür; approval gate'in kendi audit'inden ayırır. */
const telemetry = (audit: { log: jest.Mock }) =>
  audit.log.mock.calls.find(
    (c) => c[0]?.action === 'OFFICE_CAP02_AUTHORITY_HIERARCHY_TELEMETRY',
  )?.[0];

/** Master açık + T1 allowlisted (owner'ın PHASE H1 canary tenant'ı budur). */
const observe = (user: unknown, line: unknown) =>
  make({ shadowFlag: 'observe', tenantAllowlist: T1, user, line });

// ---------------------------------------------------------------------------
// flag OFF
// ---------------------------------------------------------------------------
describe('flag OFF', () => {
  it.each([undefined, '', 'off', 'on', 'OBSERVE_LATER', 'gibberish'])(
    'flag=%p → DB query 0, telemetry emit 0, authorization unchanged',
    async (shadowFlag) => {
      const { svc, prisma, audit } = make({ shadowFlag, user: partner() });
      const out = await svc.evaluate(baseInput);
      expect(prisma.reportingLine.findFirst).toHaveBeenCalledTimes(0);
      expect(telemetry(audit)).toBeUndefined();
      expect(out).toEqual({ flagMode: 'off', evaluated: false });
    },
  );

  it('enforce gate + telemetri kapalı → karar ve response AYNEN', async () => {
    const { svc, officeApproval } = make({ gate: 'enforce', user: staff() });
    const out = await svc.evaluate(baseInput);
    expect(out.block).toBe(true);
    expect(out.requestId).toBe('req-1');
    expect(officeApproval.createPendingRequest).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// flag ON — owner'in tam karsilastirma matrisi
// ---------------------------------------------------------------------------
describe('flag ON — sinif karsilastirmasi', () => {
  it('TOP_LEVEL + incumbent SELF_AUTHORITY → SAME_CLASS', async () => {
    const { svc, audit } = observe(partner(), { disposition: 'TOP_LEVEL', managerUserId: null });
    await svc.evaluate(baseInput);
    const m = telemetry(audit).metadata;
    expect(m.comparison).toBe('SAME_CLASS');
    expect(m.incumbentVerdict).toBe('SELF_AUTHORITY');
    expect(m.hierarchyDisposition).toBe('TOP_LEVEL');
    expect(m.uncomparableReason).toBeUndefined();
  });

  it('TOP_LEVEL + incumbent REQUIRES_APPROVAL → DIFFERENT_CLASS', async () => {
    const { svc, audit } = observe(staff(), { disposition: 'TOP_LEVEL', managerUserId: null });
    await svc.evaluate(baseInput);
    const m = telemetry(audit).metadata;
    expect(m.comparison).toBe('DIFFERENT_CLASS');
    expect(m.incumbentVerdict).toBe('REQUIRES_APPROVAL');
    expect(m.incumbentCapacity).toBe('SEKRETER');
  });

  it('MANAGED + incumbent REQUIRES_APPROVAL → SAME_CLASS', async () => {
    const { svc, audit } = observe(staff(), { disposition: 'MANAGED', managerUserId: 'm1' });
    await svc.evaluate(baseInput);
    expect(telemetry(audit).metadata.comparison).toBe('SAME_CLASS');
  });

  it('MANAGED + incumbent SELF_AUTHORITY → DIFFERENT_CLASS', async () => {
    const { svc, audit } = observe(partner(), { disposition: 'MANAGED', managerUserId: 'm1' });
    await svc.evaluate(baseInput);
    const m = telemetry(audit).metadata;
    expect(m.comparison).toBe('DIFFERENT_CLASS');
    expect(m.incumbentReasonCode).toBe('PARTNER_SELF_AUTHORITY');
    expect(m.hierarchyDisposition).toBe('MANAGED');
  });

  it('missing hierarchy → UNCOMPARABLE', async () => {
    const { svc, audit } = observe(partner(), null);
    await svc.evaluate(baseInput);
    const m = telemetry(audit).metadata;
    expect(m.comparison).toBe('UNCOMPARABLE');
    expect(m.uncomparableReason).toBe('MISSING_HIERARCHY');
    expect(m.hierarchyDisposition).toBe('MISSING_HIERARCHY');
  });

  it('bilinmeyen disposition degeri → UNCOMPARABLE (sessizce siniflanmaz)', async () => {
    const { svc, audit } = observe(partner(), { disposition: 'FUTURE_VALUE', managerUserId: null });
    await svc.evaluate(baseInput);
    expect(telemetry(audit).metadata.uncomparableReason).toBe('MISSING_HIERARCHY');
  });

  it('inactive actor → UNCOMPARABLE', async () => {
    const { svc, audit } = observe(u({ isActive: false }), { disposition: 'TOP_LEVEL', managerUserId: null });
    await svc.evaluate(baseInput);
    const m = telemetry(audit).metadata;
    expect(m.comparison).toBe('UNCOMPARABLE');
    expect(m.uncomparableReason).toBe('ACTOR_INACTIVE');
  });

  it('cross-tenant → UNCOMPARABLE', async () => {
    const { svc, audit } = observe(u({ tenantId: T2 }), { disposition: 'TOP_LEVEL', managerUserId: null });
    await svc.evaluate(baseInput);
    const m = telemetry(audit).metadata;
    expect(m.comparison).toBe('UNCOMPARABLE');
    expect(m.uncomparableReason).toBe('CROSS_TENANT');
  });
});

// ---------------------------------------------------------------------------
// kayit icerigi — politika cagrisimi TASIMAZ
// ---------------------------------------------------------------------------
describe('telemetri kaydi bir authorization karari TASIMAZ', () => {
  it('yasakli alan/deger adlari kayitta YOK', async () => {
    const { svc, audit } = observe(partner(), { disposition: 'MANAGED', managerUserId: 'm1' });
    await svc.evaluate(baseInput);
    const serialized = JSON.stringify(telemetry(audit));
    for (const banned of [
      'hierarchyVerdict',
      'HIERARCHY_WOULD_ALLOW',
      'HIERARCHY_WOULD_REQUIRE_APPROVAL',
      'hierarchyDecision',
      'FALSE_ALLOW',
      'FALSE_DENY',
    ]) {
      expect(serialized).not.toContain(banned);
    }
  });

  it('erisim ve karar etkilenmedigini kendi icinde tasir; ham payload SIZDIRMAZ', async () => {
    const { svc, audit } = observe(partner(), { disposition: 'TOP_LEVEL', managerUserId: null });
    await svc.evaluate(baseInput);
    const call = telemetry(audit);
    expect(call.metadata.accessAffected).toBe(false);
    expect(call.metadata.decisionAffected).toBe(false);
    expect(JSON.stringify(call)).not.toContain('ACIZ');
  });

  it('actionCode yalniz gozlem baglami olarak tasinir', async () => {
    const { svc, audit } = observe(partner(), { disposition: 'TOP_LEVEL', managerUserId: null });
    await svc.evaluate(baseInput);
    expect(telemetry(audit).metadata.observedActionCode).toBe('CHANGE_STATUS');
  });

  it('ReportingLine tenant-scoped ve yalniz AKTIF kayit icin sorgulanir', async () => {
    const { svc, prisma } = observe(partner(), { disposition: 'TOP_LEVEL', managerUserId: null });
    await svc.evaluate(baseInput);
    expect(prisma.reportingLine.findFirst).toHaveBeenCalledWith({
      where: { tenantId: T1, actorUserId: U1, validUntil: null },
      select: { disposition: true, managerUserId: true },
    });
  });
});

// ---------------------------------------------------------------------------
// OFFICE-P2-CAP02-TELEMETRY-CANARY-SCOPE-I01 — aktivasyon matrisi
// ---------------------------------------------------------------------------
describe('canary-scoped aktivasyon — master flag TEK BASINA yetmez', () => {
  it('master ON + tenant allowlist YOK -> dormant (H1 sikilastirmasi)', async () => {
    const { svc, prisma, audit } = make({ shadowFlag: 'observe', user: partner() });
    await svc.evaluate(baseInput);
    expect(prisma.reportingLine.findFirst).toHaveBeenCalledTimes(0);
    expect(telemetry(audit)).toBeUndefined();
  });

  it('master ON + tenant allowlist BOS string -> dormant', async () => {
    const { svc, prisma, audit } = make({ shadowFlag: 'observe', tenantAllowlist: '  ', user: partner() });
    await svc.evaluate(baseInput);
    expect(prisma.reportingLine.findFirst).toHaveBeenCalledTimes(0);
    expect(telemetry(audit)).toBeUndefined();
  });

  it('master ON + YANLIS tenant allowlist -> dormant', async () => {
    const { svc, prisma, audit } = make({ shadowFlag: 'observe', tenantAllowlist: T2, user: partner() });
    await svc.evaluate(baseInput);
    expect(prisma.reportingLine.findFirst).toHaveBeenCalledTimes(0);
    expect(telemetry(audit)).toBeUndefined();
  });

  it('master ON + DOGRU tenant allowlist -> tam olarak 1 evaluation / 1 event', async () => {
    const { svc, prisma, audit } = make({ shadowFlag: 'observe', tenantAllowlist: T1, user: partner() });
    await svc.evaluate(baseInput);
    expect(prisma.reportingLine.findFirst).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(telemetry(audit)).toBeDefined();
  });

  it('malformed tenant allowlist (slug) -> dormant, tenant "eslesse" bile', async () => {
    const { svc, prisma, audit } = make({
      shadowFlag: 'observe', tenantAllowlist: 'local-development-office', user: partner(),
    });
    await svc.evaluate(baseInput);
    expect(prisma.reportingLine.findFirst).toHaveBeenCalledTimes(0);
    expect(telemetry(audit)).toBeUndefined();
  });

  it('actor allowlist MISMATCH -> dormant (tenant dogru olsa bile)', async () => {
    const { svc, prisma, audit } = make({
      shadowFlag: 'observe', tenantAllowlist: T1, actorAllowlist: 'cotheractor'.padEnd(24, '0'),
      user: partner(),
    });
    await svc.evaluate(baseInput);
    expect(prisma.reportingLine.findFirst).toHaveBeenCalledTimes(0);
    expect(telemetry(audit)).toBeUndefined();
  });

  it('actor allowlist MATCH -> 1 event', async () => {
    const { svc, audit } = make({
      shadowFlag: 'observe', tenantAllowlist: T1, actorAllowlist: U1, user: partner(),
    });
    await svc.evaluate(baseInput);
    expect(telemetry(audit)).toBeDefined();
  });

  it('malformed actor allowlist -> dormant, tenant dogru olsa bile', async () => {
    const { svc, prisma, audit } = make({
      shadowFlag: 'observe', tenantAllowlist: T1, actorAllowlist: 'not-an-id', user: partner(),
    });
    await svc.evaluate(baseInput);
    expect(prisma.reportingLine.findFirst).toHaveBeenCalledTimes(0);
    expect(telemetry(audit)).toBeUndefined();
  });

  it('TELLI-HUKUK-benzeri baska tenant, allowlist T1 iken HICBIR sorgu/olay ALMAZ', async () => {
    const otherTenantInput = { ...baseInput, tenantId: T2 };
    const { svc, prisma, audit } = make({ shadowFlag: 'observe', tenantAllowlist: T1, user: partner() });
    await svc.evaluate(otherTenantInput);
    expect(prisma.reportingLine.findFirst).toHaveBeenCalledTimes(0);
    expect(telemetry(audit)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// hata izolasyonu
// ---------------------------------------------------------------------------
describe('telemetry failure → request unaffected', () => {
  it('ReportingLine sorgusu patlarsa akis BOZULMAZ', async () => {
    const { svc } = make({ shadowFlag: 'observe', user: partner(), lineThrows: true });
    await expect(svc.evaluate(baseInput)).resolves.toEqual({ flagMode: 'off', evaluated: false });
  });

  it('telemetri yazimi patlarsa akis BOZULMAZ', async () => {
    const { svc } = make({
      shadowFlag: 'observe', user: partner(), auditThrows: true,
      line: { disposition: 'TOP_LEVEL', managerUserId: null },
    });
    await expect(svc.evaluate(baseInput)).resolves.toEqual({ flagMode: 'off', evaluated: false });
  });
});

describe('enforce mode behavior unchanged', () => {
  it('telemetri hatasi enforce fail-closed davranisini ETKILEMEZ', async () => {
    const { svc, officeApproval } = make({
      gate: 'enforce', shadowFlag: 'observe', user: staff(), lineThrows: true,
    });
    const out = await svc.evaluate(baseInput);
    expect(out.block).toBe(true);
    expect(out.requestId).toBe('req-1');
    expect(officeApproval.createPendingRequest).toHaveBeenCalledTimes(1);
  });

  it('DIFFERENT_CLASS olcusu enforce kararini DEGISTIRMEZ', async () => {
    const { svc, audit, officeApproval } = make({
      gate: 'enforce', shadowFlag: 'observe', tenantAllowlist: T1, user: partner(),
      line: { disposition: 'MANAGED', managerUserId: 'm1' },
    });
    const out = await svc.evaluate(baseInput);
    // Telemetri "ayrisiyor" der; yururlukteki karar yine ALLOW kalir.
    expect(telemetry(audit).metadata.comparison).toBe('DIFFERENT_CLASS');
    expect(out.decision).toBe('ALLOW');
    expect(out.block).toBeUndefined();
    expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
  });

  it('SAME_CLASS olcusu de enforce blogunu DEGISTIRMEZ', async () => {
    const { svc, audit, officeApproval } = make({
      gate: 'enforce', shadowFlag: 'observe', tenantAllowlist: T1, user: staff(),
      line: { disposition: 'MANAGED', managerUserId: 'm1' },
    });
    const out = await svc.evaluate(baseInput);
    expect(telemetry(audit).metadata.comparison).toBe('SAME_CLASS');
    expect(out.block).toBe(true);
    expect(officeApproval.createPendingRequest).toHaveBeenCalledTimes(1);
  });
});
