/**
 * DEBTOR-OUTBOX-SECURITY-P0-I01 — outbox tenant-scope guvenlik sozlesmesi.
 *
 * Kapanan bulgular: OUTBOX-F1, OUTBOX-F2, OUTBOX-F3, OUTBOX-F4.
 *
 * Bu suite mock cagri sayisini DEGIL gercek invariant'i dogrular: sahte Prisma
 * katmani `where` cumlesini gercekten uygular, dolayisiyla "tenant filtresi
 * unutulmus" bir implementasyon bu testlerden gecemez.
 *
 * Tasarim karari (owner-onayli): HTTP yuzeyi YALNIZ tenant-scoped'dir.
 * Platform-geneli isleme yalnizca dahili cron hattindadir; hicbir controller
 * `{kind:'platform'}` uretemez.
 *
 * @jest-environment node
 */
import { ActionHandlerService } from '../action-handler.service';
import { OutboxService } from '../outbox.service';
import {
  OutboxScope,
  outboxRowInScope,
  tenantScopeFromRequestUser,
} from '../outbox-scope';

const T1: OutboxScope = { kind: 'tenant', tenantId: 't1' };
const T2: OutboxScope = { kind: 'tenant', tenantId: 't2' };
const PLATFORM: OutboxScope = { kind: 'platform' };

type Row = {
  id: string;
  tenantId: string | null;
  caseId: string;
  status: string;
  actionType: string;
  payload: Record<string, unknown>;
  attemptCount: number;
  nextRetryAt: Date | null;
  idempotencyKey?: string | null;
  lastError?: unknown;
  runId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function row(over: Partial<Row> & { id: string }): Row {
  return {
    tenantId: 't1',
    caseId: 'case-1',
    status: 'pending',
    actionType: 'noop',
    payload: {},
    attemptCount: 0,
    nextRetryAt: null,
    idempotencyKey: null,
    lastError: null,
    runId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

/** `where` cumlesini GERCEKTEN uygulayan minimal Prisma taklidi. */
function matches(r: Row, where: any): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (k === 'OR') {
      if (!(v as any[]).some((w) => matches(r, w))) return false;
      continue;
    }
    const actual = (r as any)[k];
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const cond: any = v;
      if ('in' in cond && !cond.in.includes(actual)) return false;
      if ('lt' in cond && !(actual < cond.lt)) return false;
      if ('lte' in cond && !(actual !== null && actual <= cond.lte)) return false;
    } else if (actual !== v) {
      return false;
    }
  }
  return true;
}

function buildPrisma(rows: Row[]) {
  const model = {
    findMany: jest.fn(async ({ where, take }: any) =>
      rows.filter((r) => matches(r, where)).slice(0, take ?? 100),
    ),
    findFirst: jest.fn(async ({ where }: any) =>
      rows.find((r) => matches(r, where)) ?? null,
    ),
    findUnique: jest.fn(async ({ where }: any) =>
      rows.find((r) => r.id === where.id) ?? null,
    ),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const r = rows.find((x) => x.id === where.id);
      if (r) Object.assign(r, data);
      return r;
    }),
    groupBy: jest.fn(async ({ where }: any) => {
      const hit = rows.filter((r) => matches(r, where));
      const by: Record<string, number> = {};
      hit.forEach((r) => (by[r.status] = (by[r.status] ?? 0) + 1));
      return Object.entries(by).map(([status, _count]) => ({ status, _count }));
    }),
  };
  return { prisma: { icrabotOutboxAction: model } as any, model, rows };
}

describe('DEBTOR-OUTBOX-SECURITY-P0-I01 — tenant scope invariants', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  // t1: 2 pending + 1 done + 1 dead | t2: 1 pending | tenantId=null: 1 pending
  const seed = (): Row[] => [
    row({ id: 'a-t1-pending', tenantId: 't1', status: 'pending' }),
    row({ id: 'a-t1-pending-2', tenantId: 't1', status: 'pending' }),
    row({ id: 'a-t1-done', tenantId: 't1', status: 'done' }),
    row({ id: 'a-t1-dead', tenantId: 't1', status: 'dead', attemptCount: 8 }),
    row({ id: 'a-t2-pending', tenantId: 't2', status: 'pending' }),
    row({ id: 'a-null-pending', tenantId: null, status: 'pending' }),
  ];

  describe('OUTBOX-F4 — read yuzeyleri', () => {
    it('SENARYO 1+2: same-tenant pending PASS, cross-tenant INVISIBLE', async () => {
      const { prisma, rows } = buildPrisma(seed());
      const svc = new OutboxService(prisma);

      const t1 = await svc.getPendingActions(T1);
      expect(t1.map((r: Row) => r.id).sort()).toEqual(['a-t1-pending', 'a-t1-pending-2']);
      expect(t1.some((r: Row) => r.tenantId !== 't1')).toBe(false);

      const t2 = await svc.getPendingActions(T2);
      expect(t2.map((r: Row) => r.id)).toEqual(['a-t2-pending']);
      expect(rows.length).toBe(6); // veri seti degismedi
    });

    it('SENARYO 15: tenantId=NULL satir tenant kapsaminda GORUNMEZ', async () => {
      const { prisma } = buildPrisma(seed());
      const svc = new OutboxService(prisma);
      const t1 = await svc.getPendingActions(T1);
      expect(t1.some((r: Row) => r.id === 'a-null-pending')).toBe(false);
      // fail-closed helper de ayni sonucu vermeli
      expect(outboxRowInScope({ tenantId: null }, T1)).toBe(false);
    });

    it('SENARYO 3+4: action detay same-tenant PASS, cross-tenant DENY (null)', async () => {
      const { prisma } = buildPrisma(seed());
      const svc = new OutboxService(prisma);
      await expect(svc.getAction(T1, 'a-t1-pending')).resolves.not.toBeNull();
      await expect(svc.getAction(T2, 'a-t1-pending')).resolves.toBeNull();
    });

    it('dead-letter, case listesi ve stats de tenant-scoped', async () => {
      const { prisma } = buildPrisma(seed());
      const svc = new OutboxService(prisma);

      expect((await svc.getDeadLetterQueue(T1)).map((r: Row) => r.id)).toEqual(['a-t1-dead']);
      expect(await svc.getDeadLetterQueue(T2)).toEqual([]);

      const byCase = await svc.getActionsByCaseId(T2, 'case-1');
      expect(byCase.every((r: Row) => r.tenantId === 't2')).toBe(true);

      const stats = await svc.getStats(T2);
      expect(stats.pending).toBe(1);
      expect(stats.dead).toBe(0); // t1'in dead satiri sizmaz
    });
  });

  describe('OUTBOX-F3 — replay / retry korumasi', () => {
    it('SENARYO 10: tamamlanmis (done) action replay DENY', async () => {
      const { prisma, rows } = buildPrisma(seed());
      const svc = new OutboxService(prisma);
      await expect(svc.retryDeadAction(T1, 'a-t1-done')).rejects.toThrow();
      expect(rows.find((r) => r.id === 'a-t1-done')!.status).toBe('done'); // mutasyon YOK
    });

    it('SENARYO 11: dead olmayan (pending) action retry DENY', async () => {
      const { prisma, rows } = buildPrisma(seed());
      const svc = new OutboxService(prisma);
      await expect(svc.retryDeadAction(T1, 'a-t1-pending')).rejects.toThrow();
      expect(rows.find((r) => r.id === 'a-t1-pending')!.attemptCount).toBe(0);
    });

    it('cross-tenant dead action retry DENY', async () => {
      const { prisma, rows } = buildPrisma(seed());
      const svc = new OutboxService(prisma);
      await expect(svc.retryDeadAction(T2, 'a-t1-dead')).rejects.toThrow();
      expect(rows.find((r) => r.id === 'a-t1-dead')!.status).toBe('dead');
    });

    it('SENARYO 12: bilinmeyen action FAIL-CLOSED', async () => {
      const { prisma } = buildPrisma(seed());
      const svc = new OutboxService(prisma);
      await expect(svc.retryDeadAction(T1, 'yok-boyle-bir-id')).rejects.toThrow();
    });

    it('gecerli dead action same-tenant retry PASS (pending + attempt sifirlanir)', async () => {
      const { prisma, rows } = buildPrisma(seed());
      const svc = new OutboxService(prisma);
      await svc.retryDeadAction(T1, 'a-t1-dead');
      const r = rows.find((x) => x.id === 'a-t1-dead')!;
      expect(r.status).toBe('pending');
      expect(r.attemptCount).toBe(0);
    });

    it('SENARYO 16: ayni dead action icin es zamanli retry -> EN FAZLA BIR basari', async () => {
      const { prisma, rows } = buildPrisma(seed());
      const svc = new OutboxService(prisma);
      const results = await Promise.allSettled([
        svc.retryDeadAction(T1, 'a-t1-dead'),
        svc.retryDeadAction(T1, 'a-t1-dead'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(rows.find((x) => x.id === 'a-t1-dead')!.status).toBe('pending');
    });
  });

  describe('OUTBOX-F2 — dispatch kapsam dogrulamasi', () => {
    function buildHandler(rows: Row[]) {
      const { prisma } = buildPrisma(rows);
      const outbox = {
        claimForProcessing: jest.fn(async () => true),
        markDone: jest.fn(async () => undefined),
        markFailed: jest.fn(async () => ({ isDead: false, attemptCount: 1 })),
        markDeadLetter: jest.fn(async () => undefined),
        markSent: jest.fn(async () => undefined),
      };
      const timeline = { addEntry: jest.fn(async () => undefined) };
      const factStore = { write: jest.fn(async () => undefined), setFacts: jest.fn(async () => undefined) };
      const svc = new ActionHandlerService(
        prisma,
        outbox as any,
        timeline as any,
        factStore as any,
      );
      return { svc, outbox, timeline, factStore };
    }

    it('SENARYO 6: cross-tenant dispatch DENY ve HICBIR state mutation uretmez', async () => {
      const { svc, outbox, timeline, factStore } = buildHandler(seed());
      const result = await svc.dispatch('a-t1-pending', T2);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      // varlik sizintisi yok: cross-tenant satir "unknown" olarak raporlanir
      expect(result.actionType).toBe('unknown');
      // fail-closed: claim/timeline/fact hicbiri tetiklenmez
      expect(outbox.claimForProcessing).not.toHaveBeenCalled();
      expect(outbox.markFailed).not.toHaveBeenCalled();
      expect(outbox.markDeadLetter).not.toHaveBeenCalled();
      expect(timeline.addEntry).not.toHaveBeenCalled();
      expect(factStore.write).not.toHaveBeenCalled();
    });

    it('tenantId=NULL satir tenant kapsaminda dispatch edilemez', async () => {
      const { svc, outbox } = buildHandler(seed());
      const result = await svc.dispatch('a-null-pending', T1);
      expect(result.success).toBe(false);
      expect(outbox.claimForProcessing).not.toHaveBeenCalled();
    });

    it('SENARYO 5+8: same-tenant ve platform dispatch kapsam kontrolunu GECER', async () => {
      const { svc } = buildHandler(seed());
      // 'noop' icin handler yok -> kapsam kontrolunden SONRAKI asamada duser.
      // Kritik olan: "not found/unknown" ile degil, gercek dispatch yolunda duser.
      const same = await svc.dispatch('a-t1-pending', T1);
      expect(same.actionType).toBe('noop');

      const platform = await svc.dispatch('a-t2-pending', PLATFORM);
      expect(platform.actionType).toBe('noop');
    });

    it('SENARYO 9: execute-direct baska tenant case icin DENY', async () => {
      const rows = seed();
      const { prisma } = buildPrisma(rows);
      // Case sahiplik sorgusu: yalniz (case-1, t1) eslesir
      prisma.case = {
        findFirst: jest.fn(async ({ where }: any) =>
          where.id === 'case-1' && where.tenantId === 't1' ? { id: 'case-1' } : null,
        ),
      };
      const svc = new ActionHandlerService(
        prisma,
        {} as any,
        { addEntry: jest.fn() } as any,
        { write: jest.fn() } as any,
      );
      const handler = jest.fn(async () => undefined);
      svc.register('TEST', handler as any);

      await expect(svc.executeDirectly('TEST', {}, 'case-1', T2)).rejects.toThrow(/Case not found/);
      expect(handler).not.toHaveBeenCalled();

      await expect(svc.executeDirectly('TEST', {}, 'case-1', T1)).resolves.toBeUndefined();
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('OUTBOX-F1/F2 — kapsam uretimi (authority kaynagi)', () => {
    it('SENARYO 13: kimlikli tenant yoksa FAIL-CLOSED', () => {
      expect(() => tenantScopeFromRequestUser(undefined)).toThrow(/tenantId/);
      expect(() => tenantScopeFromRequestUser(null)).toThrow(/tenantId/);
      expect(() => tenantScopeFromRequestUser({})).toThrow(/tenantId/);
      expect(() => tenantScopeFromRequestUser({ tenantId: '' })).toThrow(/tenantId/);
      expect(() => tenantScopeFromRequestUser({ tenantId: 123 })).toThrow(/tenantId/);
    });

    it('SENARYO 14: authority YALNIZ dogrulanmis user.tenantId; sahte alanlar yok sayilir', () => {
      const scope = tenantScopeFromRequestUser({
        tenantId: 't1',
        // istemcinin gonderebilecegi sahte alanlar:
        body: { tenantId: 't2' },
        query: { tenantId: 't2' },
      } as any);
      expect(scope).toEqual({ kind: 'tenant', tenantId: 't1' });
    });

    it('SENARYO 7: request user\'dan platform kapsami URETILEMEZ', () => {
      const scope = tenantScopeFromRequestUser({ tenantId: 't1', role: 'ADMIN' } as any);
      // Tenant ADMIN bile olsa uretilen kapsam daima tenant'tir -> global dispatch DENY
      expect(scope.kind).toBe('tenant');
      const forged = tenantScopeFromRequestUser({ tenantId: 't1', kind: 'platform' } as any);
      expect(forged.kind).toBe('tenant');
    });
  });
});
