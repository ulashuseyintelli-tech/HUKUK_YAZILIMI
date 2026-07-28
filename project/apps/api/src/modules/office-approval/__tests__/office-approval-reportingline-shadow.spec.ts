/** @jest-environment node */
import 'reflect-metadata';
import { OfficeApprovalShadowService } from '../office-approval-shadow.service';

/**
 * OFFICE-P2-CAP02-SHADOW-NEUTRAL-TELEMETRY-REPAIR-I01 — ReportingLine telemetri katmanı.
 *
 * OWNER KARARI (2026-07-28, OPTION A): `ReportingLine` yalnız organizasyonel hiyerarşi
 * gerçeğidir; ondan allow / deny / requiresApproval / selfAuthority KARARI ÜRETİLEMEZ.
 * Bu katman NÖTR bir sınıf karşılaştırması yapar ve hiçbir kararı etkilemez.
 *
 * Kanıtlanan sözleşme:
 *  1. Flag kapalı → DB sorgusu 0, telemetri 0, authorization DEĞİŞMEZ.
 *  2. Flag açık → SAME_CLASS / DIFFERENT_CLASS / UNCOMPARABLE kaydedilir; karar DEĞİŞMEZ.
 *  3. Telemetri hatası request'i etkilemez; `enforce` davranışı AYNEN kalır.
 */

const baseInput = {
  actorUserId: 'u1',
  tenantId: 't1',
  actionCode: 'CHANGE_STATUS',
  targetType: 'LegalCase',
  targetRef: 'c1',
  payload: { status: 'ACIZ', reason: 'x' as string | null },
};

const u = (over: Record<string, unknown> = {}) => ({
  id: 'u1', isActive: true, tenantId: 't1', lawyer: null, staffMember: null, ...over,
});
/** yürürlükteki karar → SELF_AUTHORITY */
const partner = () => u({ lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } });
/** yürürlükteki karar → REQUIRES_APPROVAL */
const staff = () => u({ staffMember: { staffType: 'SEKRETER' } });

const make = (opts: {
  gate?: string;
  shadowFlag?: string;
  user?: unknown;
  line?: unknown;
  lineThrows?: boolean;
  auditThrows?: boolean;
}) => {
  const config = {
    get: jest.fn((k: string) => {
      if (k === 'OFFICE_APPROVAL_CHANGE_STATUS_GATE') return opts.gate;
      if (k === 'OFFICE_CAP02_REPORTINGLINE_SHADOW') return opts.shadowFlag;
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

const observe = (user: unknown, line: unknown) => make({ shadowFlag: 'observe', user, line });

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
    const { svc, audit } = observe(u({ tenantId: 't2' }), { disposition: 'TOP_LEVEL', managerUserId: null });
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
      where: { tenantId: 't1', actorUserId: 'u1', validUntil: null },
      select: { disposition: true, managerUserId: true },
    });
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
      gate: 'enforce', shadowFlag: 'observe', user: partner(),
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
      gate: 'enforce', shadowFlag: 'observe', user: staff(),
      line: { disposition: 'MANAGED', managerUserId: 'm1' },
    });
    const out = await svc.evaluate(baseInput);
    expect(telemetry(audit).metadata.comparison).toBe('SAME_CLASS');
    expect(out.block).toBe(true);
    expect(officeApproval.createPendingRequest).toHaveBeenCalledTimes(1);
  });
});
