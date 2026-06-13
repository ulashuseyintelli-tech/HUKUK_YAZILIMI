/**
 * G2 BACKFILL çekirdeği — unit testler (DB'siz, mock prisma).
 *
 * Kapsam: plan (eligible/NAFAKA/unmarked-skip/idempotent), arg-guard (dry-run
 * default + --apply kilidi), runBackfill (DRY-RUN yazmaz / APPLY yazar / hata eşiği),
 * runRollback (allocation reddi / dry-run silmez).
 */

import {
  planBackfillForCase,
  parseBackfillArgs,
  runBackfill,
  runRollback,
  generateRunId,
} from '../due-to-claimitem-backfill.core';

const due = (over: Partial<any> = {}) => ({
  id: 'd1',
  type: 'PRINCIPAL',
  description: 'Ana Para',
  amount: 1000,
  dueDate: new Date('2026-01-01'),
  currency: 'TRY',
  sortOrder: 0,
  ...over,
});

describe('planBackfillForCase', () => {
  it('eligible (Due, 0 ClaimItem) → doğru ClaimItem + işaret; NAFAKA atlanır', () => {
    const plan = planBackfillForCase({
      tenantId: 't1',
      caseId: 'c1',
      dues: [
        due({ id: 'd1', type: 'PRINCIPAL', amount: 1000, currency: 'TRY', sortOrder: 0 }),
        due({ id: 'd2', type: 'INTEREST', amount: 200, currency: 'USD', sortOrder: 1 }),
        due({ id: 'd3', type: 'NAFAKA', amount: 500, currency: 'TRY', sortOrder: 2 }),
      ],
      existingClaimItems: [],
      runId: 'run-X',
      now: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(plan.skipCase).toBe(false);
    expect(plan.nafakaSkipped).toBe(1);
    expect(plan.alreadyBackfilled).toBe(0);
    expect(plan.toCreate).toHaveLength(2);

    const [p0, p1] = plan.toCreate as any[];
    expect(p0.itemType).toBe('PRINCIPAL');
    expect(p0.tenantId).toBe('t1');
    expect(p0.caseId).toBe('c1');
    expect(p0.currency).toBe('TRY');
    expect(p0.sortOrder).toBe(0);
    expect(p0.metadata.backfill).toEqual({
      sourceDueId: 'd1',
      runId: 'run-X',
      mappedFrom: 'PRINCIPAL',
      at: '2026-06-14T00:00:00.000Z',
    });
    // Q2: currency korunur (TRY default override)
    expect(p1.currency).toBe('USD');
    expect(p1.itemType).toBe('INTEREST');
  });

  it('işaretsiz ClaimItem varsa TÜM dosya atlanır (Q1)', () => {
    const plan = planBackfillForCase({
      tenantId: 't1',
      caseId: 'c1',
      dues: [due()],
      existingClaimItems: [{ metadata: null }, { metadata: { foo: 'bar' } }],
      runId: 'run-X',
    });
    expect(plan.skipCase).toBe(true);
    expect(plan.reason).toBe('HAS_UNMARKED_CLAIMITEM');
    expect(plan.toCreate).toHaveLength(0);
  });

  it('idempotent: bu Due için backfill ClaimItem varsa atlanır', () => {
    const plan = planBackfillForCase({
      tenantId: 't1',
      caseId: 'c1',
      dues: [due({ id: 'd1' }), due({ id: 'd2', type: 'HARC' })],
      existingClaimItems: [{ metadata: { backfill: { sourceDueId: 'd1', runId: 'prev' } } }],
      runId: 'run-X',
    });
    expect(plan.skipCase).toBe(false);
    expect(plan.alreadyBackfilled).toBe(1);
    expect(plan.toCreate).toHaveLength(1);
    expect((plan.toCreate[0] as any).itemType).toBe('FEE'); // d2 HARC→FEE
  });
});

describe('parseBackfillArgs (kilitler)', () => {
  it('varsayılan = DRY-RUN', () => {
    const o = parseBackfillArgs([]);
    expect(o.apply).toBe(false);
    expect(o.maxErrors).toBe(0);
  });

  it('--apply (tenant/confirm yok) → REDDET', () => {
    expect(() => parseBackfillArgs(['--apply'])).toThrow();
  });

  it('--apply --tenant <id> → OK', () => {
    const o = parseBackfillArgs(['--apply', '--tenant', 't1']);
    expect(o.apply).toBe(true);
    expect(o.tenantId).toBe('t1');
  });

  it('--apply --all-tenants (confirm yok) → REDDET', () => {
    expect(() => parseBackfillArgs(['--apply', '--all-tenants'])).toThrow();
  });

  it('--apply --all-tenants --confirm-prod-backfill → OK', () => {
    const o = parseBackfillArgs(['--apply', '--all-tenants', '--confirm-prod-backfill']);
    expect(o.apply).toBe(true);
    expect(o.allTenants).toBe(true);
    expect(o.confirmProd).toBe(true);
  });

  it('--max-errors negatif → REDDET', () => {
    expect(() => parseBackfillArgs(['--max-errors', '-1'])).toThrow();
  });

  it('--rollback --apply (tenant yok) → backfill kilidi bypass (rollback modu)', () => {
    const o = parseBackfillArgs(['--rollback', 'run-X', '--apply']);
    expect(o.rollbackRunId).toBe('run-X');
    expect(o.apply).toBe(true);
  });
});

describe('runBackfill (mock prisma)', () => {
  function mockPrisma(cases: any[]) {
    const txCreate = jest.fn(async ({ data }: any) => data);
    const prisma: any = {
      case: { findMany: jest.fn(async () => cases) },
      claimItem: { create: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn({ claimItem: { create: txCreate } })),
    };
    return { prisma, txCreate };
  }

  const eligibleCase = {
    id: 'c1',
    tenantId: 't1',
    dues: [
      due({ id: 'd1', type: 'PRINCIPAL', amount: 1000 }),
      due({ id: 'd2', type: 'INTEREST', amount: 200, currency: 'USD' }),
    ],
    claimItems: [],
  };

  it('DRY-RUN → HİÇBİR yazma yapmaz (plan var, create yok)', async () => {
    const { prisma, txCreate } = mockPrisma([eligibleCase]);
    const report = await runBackfill(prisma, parseBackfillArgs([]));

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(txCreate).not.toHaveBeenCalled();
    expect(report.mode).toBe('DRY-RUN');
    expect(report.claimItemsPlanned).toBe(2);
    expect(report.claimItemsCreated).toBe(0);
    expect(report.eligibleCases).toBe(1);
  });

  it('APPLY → per-case tx ile yazar (currency korunur)', async () => {
    const { prisma, txCreate } = mockPrisma([eligibleCase]);
    const report = await runBackfill(prisma, parseBackfillArgs(['--apply', '--tenant', 't1']));

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txCreate).toHaveBeenCalledTimes(2);
    expect(report.claimItemsCreated).toBe(2);
    const second = txCreate.mock.calls[1][0].data;
    expect(second.currency).toBe('USD');
  });

  it('isaretsiz ClaimItem olan dosya → atlanir + manuel rapor', async () => {
    const skipCase = { id: 'c2', tenantId: 't1', dues: [due({ id: 'd9' })], claimItems: [{ metadata: null }] };
    const { prisma, txCreate } = mockPrisma([skipCase]);
    const report = await runBackfill(prisma, parseBackfillArgs(['--apply', '--tenant', 't1']));

    expect(txCreate).not.toHaveBeenCalled();
    expect(report.skippedCases_haveUnmarkedClaimItem).toBe(1);
    expect(report.manualReviewCaseIds).toContain('c2');
  });

  it('hata eşiği: create patlarsa errors kaydeder ve max-errors aşılınca durur', async () => {
    const c1 = { id: 'c1', tenantId: 't1', dues: [due({ id: 'd1' })], claimItems: [] };
    const c2 = { id: 'c2', tenantId: 't1', dues: [due({ id: 'd2' })], claimItems: [] };
    const prisma: any = {
      case: { findMany: jest.fn(async () => [c1, c2]) },
      claimItem: { create: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
      $transaction: jest.fn(async () => {
        throw new Error('db patladı');
      }),
    };
    const report = await runBackfill(prisma, parseBackfillArgs(['--apply', '--tenant', 't1']));
    // maxErrors=0 → ilk hatadan sonra (errors.length=1 > 0) durur
    expect(report.errors.length).toBe(1);
    expect(report.claimItemsCreated).toBe(0);
  });
});

describe('runRollback (mock prisma)', () => {
  function mockPrisma(items: any[]) {
    const del = jest.fn(async () => ({}));
    const prisma: any = {
      case: { findMany: jest.fn() },
      claimItem: { create: jest.fn(), findMany: jest.fn(async () => items), delete: del },
      $transaction: jest.fn(),
    };
    return { prisma, del };
  }

  const items = [
    { id: 'x1', _count: { ledgerAllocations: 0 } },
    { id: 'x2', _count: { ledgerAllocations: 2 } },
  ];

  it('APPLY → allocationsizi siler, allocationliyi REDDEDER (Q3)', async () => {
    const { prisma, del } = mockPrisma(items);
    const report = await runRollback(prisma, parseBackfillArgs(['--rollback', 'run-X', '--apply']));
    expect(report.matched).toBe(2);
    expect(report.deleted).toBe(1);
    expect(report.refused_hasAllocations).toBe(1);
    expect(report.refusedIds).toEqual(['x2']);
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith({ where: { id: 'x1' } });
  });

  it('DRY-RUN → hiç silmez', async () => {
    const { prisma, del } = mockPrisma(items);
    const report = await runRollback(prisma, parseBackfillArgs(['--rollback', 'run-X']));
    expect(del).not.toHaveBeenCalled();
    expect(report.deleted).toBe(0);
    expect(report.refused_hasAllocations).toBe(1);
  });
});

describe('generateRunId', () => {
  it('deterministik biçim (bf- öneki, : ve . yok)', () => {
    const id = generateRunId(new Date('2026-06-14T12:34:56.789Z'));
    expect(id).toBe('bf-2026-06-14T12-34-56-789Z');
  });
});
