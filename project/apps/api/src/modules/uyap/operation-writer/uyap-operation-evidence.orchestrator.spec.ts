import { UyapOperationEvidenceOrchestrator } from './uyap-operation-evidence.orchestrator';
import { UyapAuthoritySnapshot } from '../authority/uyap-authority-snapshot.types';

/**
 * P05C-P04 — orchestrator flag-gating + TX-1 kompozisyon (DB'siz unit).
 *
 * UYAP-AUTHORITY-FRESHNESS-TX-I01 UYARLAMASI: TX-1 artık ilk adım olarak authority
 * revalidation çalıştırır. Bu dosyanın konusu KOMPOZİSYONDUR (lock order, envelope,
 * idempotency key formu, link girdileri) — tazelik davranışı kendi spec'inde
 * (`uyap-authority-freshness-tx.spec.ts`) test edilir. Bu yüzden buraya "her zaman
 * taze" bir snapshot servisi stub'ı verilir; senaryoların anlamı DEĞİŞMEDİ.
 */
function makeConfig(map: Record<string, string>) {
  return { get: (k: string) => map[k] };
}

/** Yapısal olarak geçerli, içeriği bu dosyanın konusu olmayan snapshot. */
const FIXTURE_SNAPSHOT = {
  snapshotVersion: 'UYAP-AUTHORITY-SNAPSHOT/v1',
  evaluatedAt: new Date('2026-06-01T00:00:00.000Z'),
  tenantId: 'tenant-1',
  authenticatedUserId: 'user-1',
  actionCode: 'UYAP_SEND',
  actingLawyer: {
    actingLawyerId: 'lawyer-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    isActive: true,
    lawyerUpdatedAt: new Date('2026-06-01T00:00:00.000Z'),
  },
  caseState: {
    caseId: 'case-1',
    tenantId: 'tenant-1',
    caseStatus: 'DERDEST',
    isArchived: false,
    allowUyapActions: true,
    caseUpdatedAt: new Date('2026-06-01T00:00:00.000Z'),
  },
  clientIds: ['client-1'],
  authorityEvidence: [],
  expenseBlocks: [],
  systemAvailability: { explicitlyConfigured: true, available: true },
  authorityVersion: 'UYAP-SEND-AUTHORITY/v1',
  authorityDigest: 'f'.repeat(64),
} as unknown as UyapAuthoritySnapshot;

function makeOrchestrator(cfg: Record<string, string>) {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
  const operationWriter = {
    createOperationWithFirstAttemptWithinTransaction: jest.fn(async () => ({
      operation: { id: 'op-1' },
      firstAttempt: { id: 'att-1' },
      created: true,
    })),
  };
  const linkWriter = {
    linkWithinTransaction: jest.fn(async () => ({ link: { id: 'l-1' }, created: true })),
  };
  const authoritySnapshots = {
    revalidate: jest.fn(async () => ({ fresh: true, snapshot: FIXTURE_SNAPSHOT })),
  };
  const orch = new UyapOperationEvidenceOrchestrator(
    prisma as any,
    makeConfig(cfg) as any,
    operationWriter as any,
    linkWriter as any,
    authoritySnapshots as any,
  );
  return { orch, prisma, operationWriter, linkWriter, authoritySnapshots, tx };
}

const T = 'tenant-1';

describe('P05C-P04 orchestrator — isEnabled (flag matrix, default-OFF)', () => {
  it('global flag OFF → disabled (default)', () => {
    const { orch } = makeOrchestrator({});
    expect(orch.isEnabled(T, 'UYAP_SEND')).toBe(false);
  });

  it('global ON ama tenant allowlist boş → disabled', () => {
    const { orch } = makeOrchestrator({ UYAP_OPERATION_EVIDENCE_ENABLED: 'true' });
    expect(orch.isEnabled(T, 'UYAP_SEND')).toBe(false);
  });

  it('global ON + tenant allowlisted ama action allowlist boş → disabled', () => {
    const { orch } = makeOrchestrator({
      UYAP_OPERATION_EVIDENCE_ENABLED: 'true',
      UYAP_OPERATION_EVIDENCE_TENANT_ALLOWLIST: T,
    });
    expect(orch.isEnabled(T, 'UYAP_SEND')).toBe(false);
  });

  it('hepsi ON + allowlisted → enabled', () => {
    const { orch } = makeOrchestrator({
      UYAP_OPERATION_EVIDENCE_ENABLED: 'true',
      UYAP_OPERATION_EVIDENCE_TENANT_ALLOWLIST: `other, ${T}`,
      UYAP_OPERATION_EVIDENCE_ACTION_ALLOWLIST: 'UYAP_SEND, TRIGGER_HACIZ',
    });
    expect(orch.isEnabled(T, 'UYAP_SEND')).toBe(true);
    expect(orch.isEnabled(T, 'TRIGGER_HACIZ')).toBe(true);
  });

  it('tenant allowlist miss → disabled', () => {
    const { orch } = makeOrchestrator({
      UYAP_OPERATION_EVIDENCE_ENABLED: 'true',
      UYAP_OPERATION_EVIDENCE_TENANT_ALLOWLIST: 'other-tenant',
      UYAP_OPERATION_EVIDENCE_ACTION_ALLOWLIST: 'UYAP_SEND',
    });
    expect(orch.isEnabled(T, 'UYAP_SEND')).toBe(false);
  });

  it('action allowlist miss → disabled', () => {
    const { orch } = makeOrchestrator({
      UYAP_OPERATION_EVIDENCE_ENABLED: 'true',
      UYAP_OPERATION_EVIDENCE_TENANT_ALLOWLIST: T,
      UYAP_OPERATION_EVIDENCE_ACTION_ALLOWLIST: 'TRIGGER_HACIZ',
    });
    expect(orch.isEnabled(T, 'UYAP_SEND')).toBe(false);
  });
});

describe('P05C-P04 orchestrator — recordEvidence (TX-1 kompozisyon)', () => {
  const cmd = {
    tenantId: T,
    caseId: 'case-1',
    actorUserId: 'user-1',
    action: 'UYAP_SEND' as const,
    idempotencyToken: 'stable-token-123',
    cpeDecisionLogId: 'dec-1',
    // UYAP-AUTHORITY-FRESHNESS-TX-I01: TX-1 artık Phase 1 snapshot'ı ister.
    authoritySnapshot: FIXTURE_SNAPSHOT,
  };

  it('revalidation operation/link YAZIMINDAN ÖNCE çalışır (TX-1 aşama sırası)', async () => {
    const { orch, authoritySnapshots, operationWriter } = makeOrchestrator({});
    await orch.recordEvidence(cmd);

    const revalOrder = authoritySnapshots.revalidate.mock.invocationCallOrder[0];
    const opOrder =
      operationWriter.createOperationWithFirstAttemptWithinTransaction.mock.invocationCallOrder[0];
    expect(revalOrder).toBeLessThan(opOrder);
  });

  it('tek $transaction içinde operation → link sırasıyla çağırır (lock order)', async () => {
    const { orch, prisma, operationWriter, linkWriter } = makeOrchestrator({});
    const r = await orch.recordEvidence(cmd);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // operation önce, link sonra (lock ordering: operation-create → link)
    const opOrder = operationWriter.createOperationWithFirstAttemptWithinTransaction.mock.invocationCallOrder[0];
    const linkOrder = linkWriter.linkWithinTransaction.mock.invocationCallOrder[0];
    expect(opOrder).toBeLessThan(linkOrder);
    expect(r.operationReused).toBe(false);
  });

  it('envelope: actorUserId taşınır; actingLawyerId/signatureOwnerId NULL (P-E6 HOLD)', async () => {
    const { orch, operationWriter } = makeOrchestrator({});
    await orch.recordEvidence(cmd);
    const env = operationWriter.createOperationWithFirstAttemptWithinTransaction.mock.calls[0][1].envelope;
    expect(env.actorUserId).toBe('user-1');
    expect(env.actingLawyerId).toBeNull();
    expect(env.signatureOwnerId).toBeNull();
    expect(env.approverId).toBeNull();
    expect(env.operationType).toBe('UYAP_SEND');
  });

  it('branded key HTTP-form: idempotencyKey UYAP-OP/v1:HTTP:<hex>', async () => {
    const { orch, operationWriter } = makeOrchestrator({});
    await orch.recordEvidence(cmd);
    const key = operationWriter.createOperationWithFirstAttemptWithinTransaction.mock.calls[0][1].idempotencyKey;
    expect(String(key)).toMatch(/^UYAP-OP\/v1:HTTP:[0-9a-f]{64}$/);
  });

  it('aynı token farklı tenant → farklı key (namespace izolasyonu)', async () => {
    const a = makeOrchestrator({});
    const b = makeOrchestrator({});
    await a.orch.recordEvidence(cmd);
    await b.orch.recordEvidence({ ...cmd, tenantId: 'tenant-2' });
    const ka = a.operationWriter.createOperationWithFirstAttemptWithinTransaction.mock.calls[0][1].idempotencyKey;
    const kb = b.operationWriter.createOperationWithFirstAttemptWithinTransaction.mock.calls[0][1].idempotencyKey;
    expect(ka).not.toEqual(kb);
  });

  it('link için doğru referential girdiler geçer (actor YOK)', async () => {
    const { orch, linkWriter } = makeOrchestrator({});
    await orch.recordEvidence(cmd);
    const linkCmd = linkWriter.linkWithinTransaction.mock.calls[0][1];
    expect(linkCmd).toEqual({
      tenantId: T,
      caseId: 'case-1',
      operationId: 'op-1',
      attemptId: 'att-1',
      cpeDecisionLogId: 'dec-1',
    });
  });
});
