/**
 * V28-TENANT-ISOLATION-SECURITY-CLOSEOUT-R01 / I02 — Timeline + EngineRun izolasyonu.
 *
 * Kapanan bulgular:
 *   TL-R01 cross-tenant timeline read (caseId)
 *   TL-R02 cross-tenant timeline read (runId / entryId — dolayli sahiplik)
 *   ER-R01 cross-tenant engine-run read (runId / caseId)
 *   ER-A01 global run aggregate (`GET /runs/stats` tum tenant'lari sayiyordu)
 *
 * Sahte Prisma katmani `where` cumlesini GERCEKTEN uygular; "tenant kontrolu
 * unutulmus" bir implementasyon buradan gecemez.
 *
 * @jest-environment node
 */
import { EngineRunService } from '../engine-run.service';
import { OutboxScope } from '../outbox-scope';
import { TimelineService } from '../timeline.service';

const T1: OutboxScope = { kind: 'tenant', tenantId: 't1' };
const T2: OutboxScope = { kind: 'tenant', tenantId: 't2' };
const PLATFORM: OutboxScope = { kind: 'platform' };

type Row = Record<string, any>;

function matches(r: Row, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const c: any = v;
      if ('in' in c) return c.in.includes(r[k]);
      if ('gte' in c) return r[k] >= c.gte;
    }
    return r[k] === v;
  });
}

function buildPrisma() {
  const cases: Row[] = [
    { id: 'case-1', tenantId: 't1' },
    { id: 'case-2', tenantId: 't2' },
  ];
  const runs: Row[] = [
    { id: 'run-1', caseId: 'case-1', ruleId: 'r', snapshotHash: 'h', status: 'succeeded', startedAt: new Date('2026-07-01'), finishedAt: new Date('2026-07-01') },
    { id: 'run-2', caseId: 'case-2', ruleId: 'r', snapshotHash: 'h', status: 'failed', startedAt: new Date('2026-07-01'), finishedAt: null },
  ];
  const entries: Row[] = [
    { id: 'e-1', caseId: 'case-1', runId: 'run-1', type: 'NOTE', severity: 'info', title: 'a', body: {}, source: 'system', createdAt: new Date('2026-07-01') },
    { id: 'e-2', caseId: 'case-2', runId: 'run-2', type: 'NOTE', severity: 'info', title: 'b', body: {}, source: 'system', createdAt: new Date('2026-07-01') },
  ];

  const caseModel = {
    findFirst: jest.fn(async ({ where }: any) => cases.find((c) => matches(c, where)) ?? null),
    findMany: jest.fn(async ({ where }: any) => cases.filter((c) => matches(c, where))),
  };
  const runModel = {
    findUnique: jest.fn(async ({ where }: any) => runs.find((r) => r.id === where.id) ?? null),
    findMany: jest.fn(async ({ where }: any) => runs.filter((r) => matches(r, where))),
  };
  const entryModel = {
    findUnique: jest.fn(async ({ where }: any) => entries.find((e) => e.id === where.id) ?? null),
    findMany: jest.fn(async ({ where }: any) => entries.filter((e) => matches(e, where))),
    groupBy: jest.fn(async ({ where }: any) => {
      const hit = entries.filter((e) => matches(e, where));
      const by: Record<string, number> = {};
      hit.forEach((e) => (by[e.type] = (by[e.type] ?? 0) + 1));
      return Object.entries(by).map(([type, _count]) => ({ type, _count }));
    }),
  };

  const prisma: Row = {
    case: caseModel,
    icrabotEngineRun: runModel,
    icrabotTimelineEntry: entryModel,
    // raw JOIN: tenant'a ait case'lerin run'lari
    $queryRaw: jest.fn(async (_strings: any, since: Date, tenantId: string) => {
      const tenantCaseIds = cases.filter((c) => c.tenantId === tenantId).map((c) => c.id);
      return runs
        .filter((r) => tenantCaseIds.includes(r.caseId) && r.startedAt >= since)
        .map((r) => ({ status: r.status, startedAt: r.startedAt, finishedAt: r.finishedAt }));
    }),
  };

  return { prisma: prisma as any, caseModel, runModel, entryModel, entries, runs };
}

describe('I02 — Timeline cross-tenant izolasyonu (TL-R01)', () => {
  it('SENARYO 1: same-tenant timeline PASS', async () => {
    const { prisma } = buildPrisma();
    const svc = new TimelineService(prisma);
    const page = await svc.getTimelinePaged('case-1', T1);
    expect(page.items.map((i) => i.entry_id)).toEqual(['e-1']);
  });

  it('SENARYO 2: cross-tenant timeline DENY', async () => {
    const { prisma } = buildPrisma();
    const svc = new TimelineService(prisma);
    await expect(svc.getTimelinePaged('case-1', T2)).rejects.toThrow(/Case not found/);
  });

  it('SENARYO 3: stats/summary/legacy-getTimeline de cross-tenant DENY', async () => {
    const { prisma } = buildPrisma();
    const svc = new TimelineService(prisma);
    await expect(svc.getStats('case-1', T2)).rejects.toThrow();
    await expect(svc.getRecentSummary('case-1', T2)).rejects.toThrow();
    await expect(svc.getTimeline('case-1', T2)).rejects.toThrow();
  });

  it('SENARYO 4: foreign ve missing case AYNI yaniti verir', async () => {
    const { prisma } = buildPrisma();
    const svc = new TimelineService(prisma);
    const msg = (id: string) =>
      svc.getStats(id, T2).then(() => 'BEKLENMEYEN', (e: Error) => e.message);
    expect((await msg('case-1')).replace('case-1', 'X')).toBe(
      (await msg('yok')).replace('yok', 'X'),
    );
  });
});

describe('I02 — Timeline dolayli sahiplik: runId / entryId (TL-R02)', () => {
  it('SENARYO 5: cross-tenant entryId -> null (varlik sizintisi yok)', async () => {
    const { prisma } = buildPrisma();
    const svc = new TimelineService(prisma);

    await expect(svc.getEntry('e-1', T1)).resolves.not.toBeNull();
    // yabanci entry ve hic olmayan entry AYNI sonucu verir
    await expect(svc.getEntry('e-1', T2)).resolves.toBeNull();
    await expect(svc.getEntry('yok', T2)).resolves.toBeNull();
  });

  it('SENARYO 6: cross-tenant runId -> bos liste', async () => {
    const { prisma } = buildPrisma();
    const svc = new TimelineService(prisma);

    expect((await svc.getTimelineByRun('run-1', T1)).map((e: Row) => e.id)).toEqual(['e-1']);
    expect(await svc.getTimelineByRun('run-1', T2)).toEqual([]);
    expect(await svc.getTimelineByRun('yok', T2)).toEqual([]);
  });

  it('SENARYO 7: kapsam disi runId icin timeline sorgusu HIC calismaz', async () => {
    const { prisma, entryModel } = buildPrisma();
    const svc = new TimelineService(prisma);
    await svc.getTimelineByRun('run-1', T2);
    expect(entryModel.findMany).not.toHaveBeenCalled();
  });
});

describe('I02 — EngineRun izolasyonu (ER-R01)', () => {
  it('SENARYO 8: same-tenant run PASS, cross-tenant DENY', async () => {
    const { prisma } = buildPrisma();
    const svc = new EngineRunService(prisma);

    await expect(svc.getRun('run-1', T1)).resolves.toMatchObject({ run_id: 'run-1' });
    await expect(svc.getRun('run-1', T2)).rejects.toThrow(/Engine run not found/);
  });

  it('SENARYO 9: foreign run ile missing run AYNI hatayi verir', async () => {
    const { prisma } = buildPrisma();
    const svc = new EngineRunService(prisma);
    const msg = (id: string) =>
      svc.getRun(id, T2).then(() => 'BEKLENMEYEN', (e: Error) => e.message);
    expect((await msg('run-1')).replace('run-1', 'X')).toBe(
      (await msg('yok')).replace('yok', 'X'),
    );
  });

  it('SENARYO 10: getRunsByCaseId cross-tenant DENY', async () => {
    const { prisma } = buildPrisma();
    const svc = new EngineRunService(prisma);
    await expect(svc.getRunsByCaseId('case-1', T2)).rejects.toThrow();
    expect((await svc.getRunsByCaseId('case-1', T1)).map((r) => r.run_id)).toEqual(['run-1']);
  });
});

describe('I02 — Global run aggregate kapatildi (ER-A01)', () => {
  it('SENARYO 11: stats YALNIZ cagiranin tenant\'ini sayar', async () => {
    const { prisma } = buildPrisma();
    const svc = new EngineRunService(prisma);

    const s1 = await svc.getStats(T1, 30000);
    expect(s1.total).toBe(1);
    expect(s1.succeeded).toBe(1);
    expect(s1.failed).toBe(0); // t2'nin failed run'i SIZMAZ

    const s2 = await svc.getStats(T2, 30000);
    expect(s2.total).toBe(1);
    expect(s2.failed).toBe(1);
    expect(s2.succeeded).toBe(0);
  });

  it('SENARYO 12: tenant kapsaminda global findMany KULLANILMAZ (JOIN yolu)', async () => {
    const { prisma, runModel } = buildPrisma();
    const svc = new EngineRunService(prisma);

    await svc.getStats(T1, 30000);

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(runModel.findMany).not.toHaveBeenCalled();
  });

  it('SENARYO 13: platform kapsami (dahili) tum run\'lari gorebilir', async () => {
    const { prisma, runModel } = buildPrisma();
    const svc = new EngineRunService(prisma);

    const all = await svc.getStats(PLATFORM, 30000);

    expect(all.total).toBe(2);
    expect(runModel.findMany).toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
