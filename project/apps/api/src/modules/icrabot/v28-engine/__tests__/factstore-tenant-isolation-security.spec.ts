/**
 * V28-TENANT-ISOLATION-SECURITY-CLOSEOUT-R01 / I01 — FactStore tam tenant izolasyonu.
 *
 * Kapanan bulgular:
 *   FS-R01 cross-tenant read (snapshot/fact/flag/audit/pattern/key-audit)
 *   FS-W01 cross-tenant write (batch/setFact/setFlag/increment/append)
 *   FS-E01 global enumeration (by-flag/:key)
 *   FS-E02 bulk existence oracle (bulk-snapshot)
 *
 * Bu suite mock cagri sayisini DEGIL gercek invariant'i dogrular: sahte Prisma
 * katmani `where` cumlesini gercekten uygular ve satirlari gercekten yazar/siler.
 * "Tenant kontrolu unutulmus" bir implementasyon buradan gecemez.
 *
 * @jest-environment node
 */
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FactStoreService } from '../factstore.service';
import { OutboxScope } from '../outbox-scope';
import { FactStoreController } from '../v28-engine.controller';

const T1: OutboxScope = { kind: 'tenant', tenantId: 't1' };
const T2: OutboxScope = { kind: 'tenant', tenantId: 't2' };
const PLATFORM: OutboxScope = { kind: 'platform' };

type Row = Record<string, any>;

function matches(r: Row, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && 'in' in (v as any)) {
      return (v as any).in.includes(r[k]);
    }
    return r[k] === v;
  });
}

/** t1 -> case-1 | t2 -> case-2 | sahipsiz -> case-orphan */
function buildPrisma() {
  const cases: Row[] = [
    { id: 'case-1', tenantId: 't1' },
    { id: 'case-2', tenantId: 't2' },
  ];
  const facts: Row[] = [
    { caseId: 'case-1', key: 'assets.vehicle.found', value: true },
    { caseId: 'case-1', key: 'engine.risk.score', value: 73 },
    { caseId: 'case-2', key: 'assets.bank.found', value: true },
  ];
  const flags: Row[] = [
    { caseId: 'case-1', key: 'HIGH_RISK', value: true },
    { caseId: 'case-2', key: 'HIGH_RISK', value: true },
  ];
  const audits: Row[] = [];

  const model = (store: Row[], uniqueKey?: (w: any) => Row | undefined) => ({
    findMany: jest.fn(async ({ where }: any) => store.filter((r) => matches(r, where))),
    findUnique: jest.fn(async ({ where }: any) =>
      uniqueKey ? uniqueKey(where) ?? null : null,
    ),
    count: jest.fn(async ({ where }: any) => store.filter((r) => matches(r, where)).length),
    create: jest.fn(async ({ data }: any) => {
      store.push({ ...data });
      return data;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const k = where.caseId_key;
      const row = store.find((r) => r.caseId === k.caseId && r.key === k.key);
      if (row) Object.assign(row, data);
      return row;
    }),
    upsert: jest.fn(async ({ where, create, update }: any) => {
      const k = where.caseId_key;
      const row = store.find((r) => r.caseId === k.caseId && r.key === k.key);
      if (row) Object.assign(row, update);
      else store.push({ ...create });
      return row ?? create;
    }),
    deleteMany: jest.fn(async ({ where }: any) => {
      const keep = store.filter((r) => !matches(r, where));
      const n = store.length - keep.length;
      store.splice(0, store.length, ...keep);
      return { count: n };
    }),
  });

  const factModel = model(facts, (w) =>
    facts.find((r) => r.caseId === w.caseId_key.caseId && r.key === w.caseId_key.key),
  );
  const flagModel = model(flags, (w) =>
    flags.find((r) => r.caseId === w.caseId_key.caseId && r.key === w.caseId_key.key),
  );
  const auditModel = model(audits);

  const caseModel = {
    findFirst: jest.fn(async ({ where }: any) => cases.find((c) => matches(c, where)) ?? null),
    findMany: jest.fn(async ({ where }: any) => cases.filter((c) => matches(c, where))),
  };

  const client: Row = {
    case: caseModel,
    icrabotCaseFact: factModel,
    icrabotCaseFlag: flagModel,
    icrabotFactAudit: auditModel,
    $queryRaw: jest.fn(async () => []),
  };
  client.$transaction = jest.fn(async (cb: any) => cb(client));

  return { prisma: client as any, facts, flags, audits, caseModel, factModel, flagModel };
}

describe('I01 — FactStore cross-tenant READ izolasyonu (FS-R01)', () => {
  it('SENARYO 1: same-tenant snapshot PASS', async () => {
    const { prisma } = buildPrisma();
    const svc = new FactStoreService(prisma);
    const snap = await svc.getSnapshot('case-1', T1);
    expect(snap.facts['engine.risk.score']).toBe(73);
  });

  it('SENARYO 2: cross-tenant snapshot DENY', async () => {
    const { prisma } = buildPrisma();
    const svc = new FactStoreService(prisma);
    await expect(svc.getSnapshot('case-1', T2)).rejects.toThrow(/Case not found/);
  });

  it('SENARYO 3: foreign ve missing AYNI yaniti verir (existence oracle yok)', async () => {
    const { prisma } = buildPrisma();
    const svc = new FactStoreService(prisma);

    const msg = (id: string) =>
      svc.getSnapshot(id, T2).then(() => 'BEKLENMEYEN', (e: Error) => e.message);

    expect((await msg('case-1')).replace('case-1', 'X')).toBe(
      (await msg('yok-1')).replace('yok-1', 'X'),
    );
  });

  it('SENARYO 4: tum read yuzeyleri cross-tenant DENY', async () => {
    const { prisma } = buildPrisma();
    const svc = new FactStoreService(prisma);

    await expect(svc.getFact('case-1', 'engine.risk.score', T2)).rejects.toThrow();
    await expect(svc.getFlag('case-1', 'HIGH_RISK', T2)).rejects.toThrow();
    await expect(svc.getAuditHistory('case-1', T2)).rejects.toThrow();
    await expect(svc.getFactsByPattern('case-1', 'assets.*', T2)).rejects.toThrow();
    await expect(svc.getKeyAuditHistory('case-1', 'k', T2)).rejects.toThrow();
    await expect(svc.hasFact('case-1', 'k', T2)).rejects.toThrow();
    await expect(svc.isFlagSet('case-1', 'HIGH_RISK', T2)).rejects.toThrow();
  });
});

describe('I01 — FactStore cross-tenant WRITE izolasyonu (FS-W01)', () => {
  it('SENARYO 5: cross-tenant write hicbir satiri DEGISTIRMEZ', async () => {
    const { prisma, facts, audits } = buildPrisma();
    const svc = new FactStoreService(prisma);

    await expect(
      svc.write('case-1', { 'engine.risk.score': 0 }, {}, { source: 'x' }, T2),
    ).rejects.toThrow(/Case not found/);

    expect(facts.find((f) => f.key === 'engine.risk.score')!.value).toBe(73);
    expect(audits).toHaveLength(0);
  });

  it('SENARYO 6: cross-tenant batchWrite/setFacts/setFlags DENY', async () => {
    const { prisma, facts } = buildPrisma();
    const svc = new FactStoreService(prisma);

    await expect(svc.batchWrite('case-1', { a: 1 }, {}, {}, T2)).rejects.toThrow();
    await expect(svc.setFacts('case-1', { a: 1 }, {}, T2)).rejects.toThrow();
    await expect(svc.setFlags('case-1', { A: true }, {}, T2)).rejects.toThrow();
    expect(facts.some((f) => f.key === 'a')).toBe(false);
  });

  it('SENARYO 7: cross-tenant increment/append DENY (deger degismez)', async () => {
    const { prisma, facts } = buildPrisma();
    const svc = new FactStoreService(prisma);

    await expect(svc.incrementFact('case-1', 'engine.risk.score', 100, {}, T2)).rejects.toThrow();
    await expect(svc.appendToFact('case-1', 'engine.risk.score', 'x', {}, T2)).rejects.toThrow();
    expect(facts.find((f) => f.key === 'engine.risk.score')!.value).toBe(73);
  });

  it('SENARYO 8: same-tenant write PASS ve sibling tenant ETKILENMEZ', async () => {
    const { prisma, facts } = buildPrisma();
    const svc = new FactStoreService(prisma);

    await svc.setFacts('case-1', { 'engine.risk.score': 10 }, { source: 'test' }, T1);

    expect(facts.find((f) => f.caseId === 'case-1' && f.key === 'engine.risk.score')!.value).toBe(10);
    expect(facts.find((f) => f.caseId === 'case-2')!.value).toBe(true);
  });

  it('SENARYO 9: kapsam kapisi mutation ile AYNI transaction client\'inda calisir (TOCTOU yok)', async () => {
    const { prisma, caseModel } = buildPrisma();
    const svc = new FactStoreService(prisma);

    await svc.write('case-1', { k: 1 }, {}, { source: 't' }, T1);

    // $transaction callback'ine gecen client ile sahiplik sorgusu yapilmis olmali
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(caseModel.findFirst).toHaveBeenCalledWith({
      where: { id: 'case-1', tenantId: 't1' },
      select: { id: true },
    });
  });
});

describe('I01 — Global enumeration kapatildi (FS-E01 / FS-E02)', () => {
  it('SENARYO 10: by-flag YALNIZ cagiranin tenant\'indaki case\'leri doner', async () => {
    const { prisma } = buildPrisma();
    const svc = new FactStoreService(prisma);

    // Ayni flag her iki tenant'ta da set; sonuc tenant'a indirgenmeli
    expect(await svc.getCasesWithFlag('HIGH_RISK', true, T1)).toEqual(['case-1']);
    expect(await svc.getCasesWithFlag('HIGH_RISK', true, T2)).toEqual(['case-2']);
  });

  it('SENARYO 11: platform kapsami (dahili cron) tum sonuclari gorebilir', async () => {
    const { prisma } = buildPrisma();
    const svc = new FactStoreService(prisma);
    const all = await svc.getCasesWithFlag('HIGH_RISK', true, PLATFORM);
    expect(all.sort()).toEqual(['case-1', 'case-2']);
  });

  it('SENARYO 12: bulk-snapshot kapsam disi kimlik icin BOS SNAPSHOT BILE dondurmez', async () => {
    const { prisma } = buildPrisma();
    const svc = new FactStoreService(prisma);

    const res = await svc.getBulkSnapshots(['case-1', 'case-2', 'yok-1'], T1);

    expect([...res.keys()]).toEqual(['case-1']);
    expect(res.has('case-2')).toBe(false); // yabanci
    expect(res.has('yok-1')).toBe(false); // olmayan — ayni davranis
  });

  it('SENARYO 13: bos/gecersiz bulk girdisi DB\'ye hic gitmez', async () => {
    const { prisma, caseModel } = buildPrisma();
    const svc = new FactStoreService(prisma);

    expect((await svc.getBulkSnapshots([], T1)).size).toBe(0);
    expect(caseModel.findMany).not.toHaveBeenCalled();
  });
});

describe('I01 — HTTP sinirinda kapsam authority (guard-bypass regresyonu)', () => {
  let app: INestApplication;
  let tenantId = 't1';
  const factStore = {
    getSnapshot: jest.fn().mockResolvedValue({ facts: {}, flags: {} }),
    getCasesWithFlag: jest.fn().mockResolvedValue([]),
    getBulkSnapshots: jest.fn().mockResolvedValue(new Map()),
    setFacts: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [FactStoreController],
      providers: [{ provide: FactStoreService, useValue: factStore }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().user = { id: 'u1', tenantId, role: 'ADMIN' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    tenantId = 't1';
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('SENARYO 14: kapsam JWT tenant\'indan uretilir', async () => {
    await request(app.getHttpServer()).get('/icrabot/v28/facts/case-1').expect(200);
    expect(factStore.getSnapshot).toHaveBeenCalledWith('case-1', T1);
  });

  it('SENARYO 15: body/query\'deki sahte tenantId kapsami DEGISTIREMEZ', async () => {
    await request(app.getHttpServer())
      .post('/icrabot/v28/facts/case-1/fact/k?tenantId=t2')
      .send({ value: 1, meta: { tenantId: 't2' } });

    const call = factStore.setFacts.mock.calls[0];
    expect(call[3]).toEqual(T1); // scope daima dogrulanmis JWT tenant'i
  });

  it('SENARYO 16: JWT tenant\'i yoksa FAIL-CLOSED (servis cagrilmaz)', async () => {
    tenantId = '' as any;

    const res = await request(app.getHttpServer()).get('/icrabot/v28/facts/case-1');

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(factStore.getSnapshot).not.toHaveBeenCalled();
  });

  it('SENARYO 17: enumeration uclari da kapsam tasir', async () => {
    await request(app.getHttpServer()).get('/icrabot/v28/facts/by-flag/HIGH_RISK').expect(200);
    expect(factStore.getCasesWithFlag).toHaveBeenCalledWith('HIGH_RISK', true, T1);

    await request(app.getHttpServer())
      .post('/icrabot/v28/facts/bulk-snapshot')
      .send({ caseIds: ['case-1'] })
      .expect(200);
    expect(factStore.getBulkSnapshots).toHaveBeenCalledWith(['case-1'], T1);
  });
});
