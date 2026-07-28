/** @jest-environment node */
import 'reflect-metadata';
import { OfficeApprovalShadowService } from '../office-approval-shadow.service';

/**
 * OFFICE-P2-CAP02-AUTHORIZATION-SHADOW-CONSUMER-I01 — ReportingLine gözlem katmanı.
 *
 * Kanıtlanan sözleşme:
 *  1. Flag kapalı (unset / 'off' / bilinmeyen) → TAM DORMANT: ReportingLine okunmaz,
 *     audit yazılmaz, dönen sonuç birebir aynıdır.
 *  2. Flag 'observe' → karşılaştırma audit'e yazılır; dönen sonuç yine DEĞİŞMEZ.
 *  3. Gözlem katmanı approval gate'ten BAĞIMSIZDIR: gate 'off' iken bile ölçer.
 *  4. Gözlem HER TÜRLÜ hatada sessizdir; `enforce` fail-closed davranışını bozmaz.
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
const partner = () => u({ lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } });
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

/** Gözlem audit'ini (varsa) döndürür; approval gate'in kendi audit'inden ayırır. */
const shadowCall = (audit: { log: jest.Mock }) =>
  audit.log.mock.calls.find(
    (c) => c[0]?.action === 'OFFICE_CAP02_SELF_AUTHORITY_SHADOW_COMPARISON',
  )?.[0];

describe('ReportingLine gözlem katmanı — dormant davranışı', () => {
  it.each([undefined, '', 'off', 'on', 'ENFORCE', 'gibberish'])(
    'flag=%p → ReportingLine OKUNMAZ ve gözlem audit YAZILMAZ',
    async (shadowFlag) => {
      const { svc, prisma, audit } = make({ shadowFlag, user: partner() });
      const out = await svc.evaluate(baseInput);
      expect(prisma.reportingLine.findFirst).not.toHaveBeenCalled();
      expect(shadowCall(audit)).toBeUndefined();
      expect(out).toEqual({ flagMode: 'off', evaluated: false });
    },
  );

  it("flag 'observe' olsa bile dönen sonuç DEĞİŞMEZ (gate off)", async () => {
    const { svc } = make({ shadowFlag: 'observe', user: partner(), line: { disposition: 'TOP_LEVEL', managerUserId: null } });
    const out = await svc.evaluate(baseInput);
    expect(out).toEqual({ flagMode: 'off', evaluated: false });
  });
});

describe('ReportingLine gözlem katmanı — karşılaştırma sonuçları', () => {
  const observe = (user: unknown, line: unknown) =>
    make({ shadowFlag: 'observe', user, line });

  it('PARTNER + TOP_LEVEL → MATCH', async () => {
    const { svc, audit } = observe(partner(), { disposition: 'TOP_LEVEL', managerUserId: null });
    await svc.evaluate(baseInput);
    const call = shadowCall(audit);
    expect(call.metadata.outcome).toBe('MATCH');
    expect(call.metadata.incumbentVerdict).toBe('SELF_AUTHORITY');
    expect(call.metadata.hierarchyVerdict).toBe('SELF_AUTHORITY');
    expect(call.metadata.severity).toBe('NONE');
  });

  it('PARTNER + MANAGED → HIERARCHY_WOULD_REQUIRE_APPROVAL', async () => {
    const { svc, audit } = observe(partner(), { disposition: 'MANAGED', managerUserId: 'm1' });
    await svc.evaluate(baseInput);
    const call = shadowCall(audit);
    expect(call.metadata.outcome).toBe('HIERARCHY_WOULD_REQUIRE_APPROVAL');
    expect(call.metadata.incumbentReasonCode).toBe('PARTNER_SELF_AUTHORITY');
    expect(call.metadata.hierarchyDisposition).toBe('MANAGED');
  });

  it('personel + TOP_LEVEL → HIERARCHY_WOULD_ALLOW', async () => {
    const { svc, audit } = observe(staff(), { disposition: 'TOP_LEVEL', managerUserId: null });
    await svc.evaluate(baseInput);
    const call = shadowCall(audit);
    expect(call.metadata.outcome).toBe('HIERARCHY_WOULD_ALLOW');
    expect(call.metadata.incumbentVerdict).toBe('REQUIRES_APPROVAL');
    expect(call.metadata.incumbentCapacity).toBe('SEKRETER');
  });

  it('aktif kayıt yok → MISSING_HIERARCHY (sessizce onay-gerekir SAYILMAZ)', async () => {
    const { svc, audit } = observe(partner(), null);
    await svc.evaluate(baseInput);
    const call = shadowCall(audit);
    expect(call.metadata.outcome).toBe('MISSING_HIERARCHY');
    expect(call.metadata.hierarchyVerdict).toBeNull();
    expect(call.metadata.severity).toBe('INFO');
  });

  it('bilinmeyen disposition değeri → MISSING_HIERARCHY (yanlış sınıflanmaz)', async () => {
    const { svc, audit } = observe(partner(), { disposition: 'FUTURE_VALUE', managerUserId: null });
    await svc.evaluate(baseInput);
    expect(shadowCall(audit).metadata.outcome).toBe('MISSING_HIERARCHY');
  });

  it('pasif aktör → ACTOR_INACTIVE', async () => {
    const { svc, audit } = observe(u({ isActive: false }), { disposition: 'TOP_LEVEL', managerUserId: null });
    await svc.evaluate(baseInput);
    const call = shadowCall(audit);
    expect(call.metadata.outcome).toBe('ACTOR_INACTIVE');
    // Yürürlükteki karar da onay istiyor → kritik değil.
    expect(call.metadata.severity).toBe('NONE');
  });

  it('başka tenant aktör → CROSS_TENANT', async () => {
    const { svc, audit } = observe(u({ tenantId: 't2' }), { disposition: 'TOP_LEVEL', managerUserId: null });
    await svc.evaluate(baseInput);
    expect(shadowCall(audit).metadata.outcome).toBe('CROSS_TENANT');
  });

  it('gözlem kaydı erişimi etkilemediğini kendi içinde taşır ve ham payload SIZDIRMAZ', async () => {
    const { svc, audit } = observe(partner(), { disposition: 'TOP_LEVEL', managerUserId: null });
    await svc.evaluate(baseInput);
    const call = shadowCall(audit);
    expect(call.metadata.accessAffected).toBe(false);
    expect(JSON.stringify(call)).not.toContain('ACIZ');
  });

  it('ReportingLine tenant-scoped ve yalnız AKTİF kayıt için sorgulanır', async () => {
    const { svc, prisma } = observe(partner(), { disposition: 'TOP_LEVEL', managerUserId: null });
    await svc.evaluate(baseInput);
    expect(prisma.reportingLine.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 't1', actorUserId: 'u1', validUntil: null },
      select: { disposition: true, managerUserId: true },
    });
  });
});

describe('ReportingLine gözlem katmanı — hata izolasyonu', () => {
  it('ReportingLine sorgusu patlarsa akış BOZULMAZ', async () => {
    const { svc } = make({ shadowFlag: 'observe', user: partner(), lineThrows: true });
    await expect(svc.evaluate(baseInput)).resolves.toEqual({ flagMode: 'off', evaluated: false });
  });

  it('gözlem audit yazımı patlarsa akış BOZULMAZ', async () => {
    const { svc } = make({
      shadowFlag: 'observe', user: partner(), auditThrows: true,
      line: { disposition: 'TOP_LEVEL', managerUserId: null },
    });
    await expect(svc.evaluate(baseInput)).resolves.toEqual({ flagMode: 'off', evaluated: false });
  });

  it("enforce fail-closed davranışı gözlem hatasından ETKİLENMEZ", async () => {
    const { svc, officeApproval } = make({
      gate: 'enforce', shadowFlag: 'observe', user: staff(), lineThrows: true,
    });
    const out = await svc.evaluate(baseInput);
    expect(out.block).toBe(true);
    expect(out.requestId).toBe('req-1');
    expect(officeApproval.createPendingRequest).toHaveBeenCalledTimes(1);
  });

  it("enforce + PARTNER: gözlem açıkken de ALLOW (request YOK)", async () => {
    const { svc, officeApproval } = make({
      gate: 'enforce', shadowFlag: 'observe', user: partner(),
      line: { disposition: 'MANAGED', managerUserId: 'm1' },
    });
    const out = await svc.evaluate(baseInput);
    // Gözlem "hiyerarşi onay isterdi" dese bile YÜRÜRLÜKTEKİ karar değişmez.
    expect(out.decision).toBe('ALLOW');
    expect(out.block).toBeUndefined();
    expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
  });
});
