/**
 * V28-FACTSTORE-SECURITY-P0-I01 — FactStore yikici temizleme guvenlik sozlesmesi.
 *
 * Kapanan yuzeyler:
 *   DELETE /icrabot/v28/facts/:caseId
 *   POST   /icrabot/v28/facts/:caseId/clear
 *
 * Bu suite mock cagri sayisini DEGIL gercek invariant'i dogrular: sahte Prisma
 * katmani `where` cumlesini gercekten uygular ve satirlari gercekten siler,
 * dolayisiyla "tenant kontrolu unutulmus" bir implementasyon buradan gecemez.
 *
 * NEDEN CASE UZERINDEN DOGRULAMA: `IcrabotCaseFact`/`IcrabotCaseFlag` satirlari
 * `tenantId` TASIMAZ ve `Case`'e Prisma relation'i YOKTUR; silme sorgusu kendi
 * basina bir tenant predicate'i tasiyamaz. Kapsam, silme ile AYNI transaction
 * icinde Case sahipligi dogrulanarak saglanir (TOCTOU'suz).
 *
 * @jest-environment node
 */
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FactStoreService } from '../factstore.service';
import { IcrabotV28UnsafeMutationGuard } from '../guards/v28-surface.guard';
import {
  ICRABOT_V28_UNSAFE_MUTATION_ENABLED,
} from '../outbox.constants';
import { OutboxScope } from '../outbox-scope';
import { FactStoreController } from '../v28-engine.controller';

const T1: OutboxScope = { kind: 'tenant', tenantId: 't1' };
const T2: OutboxScope = { kind: 'tenant', tenantId: 't2' };
const PLATFORM: OutboxScope = { kind: 'platform' };

type FactRow = { caseId: string; key: string; value: unknown };
type FlagRow = { caseId: string; key: string; value: boolean };
type AuditRow = Record<string, unknown>;
type CaseRow = { id: string; tenantId: string };

/** `where` cumlesini GERCEKTEN uygulayan minimal Prisma taklidi. */
function matches(r: Record<string, unknown>, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => r[k] === v);
}

function buildPrisma() {
  // t1 -> case-1 (2 fact + 1 flag) | t2 -> case-2 (1 fact)
  const cases: CaseRow[] = [
    { id: 'case-1', tenantId: 't1' },
    { id: 'case-2', tenantId: 't2' },
  ];
  const facts: FactRow[] = [
    { caseId: 'case-1', key: 'assets.vehicle.found', value: true },
    { caseId: 'case-1', key: 'engine.risk.score', value: 73 },
    { caseId: 'case-2', key: 'assets.bank.found', value: true },
  ];
  const flags: FlagRow[] = [{ caseId: 'case-1', key: 'HIGH_RISK', value: true }];
  const audits: AuditRow[] = [];

  const deleteManyFrom = <T extends Record<string, unknown>>(store: T[]) =>
    jest.fn(async ({ where }: any) => {
      const keep = store.filter((r) => !matches(r, where));
      const removed = store.length - keep.length;
      store.splice(0, store.length, ...keep);
      return { count: removed };
    });

  const tx = {
    case: {
      findFirst: jest.fn(async ({ where }: any) =>
        cases.find((c) => matches(c, where)) ?? null,
      ),
    },
    icrabotCaseFact: {
      findMany: jest.fn(async ({ where }: any) => facts.filter((r) => matches(r, where))),
      deleteMany: deleteManyFrom(facts),
    },
    icrabotCaseFlag: {
      findMany: jest.fn(async ({ where }: any) => flags.filter((r) => matches(r, where))),
      deleteMany: deleteManyFrom(flags),
    },
    icrabotFactAudit: {
      create: jest.fn(async ({ data }: any) => {
        audits.push(data);
        return data;
      }),
    },
  };

  const prisma = {
    // Gercek $transaction gibi: callback hata firlatirsa yazimlar geri alinir.
    $transaction: jest.fn(async (cb: any) => {
      const factsBefore = facts.map((r) => ({ ...r }));
      const flagsBefore = flags.map((r) => ({ ...r }));
      const auditsBefore = audits.length;
      try {
        return await cb(tx);
      } catch (e) {
        facts.splice(0, facts.length, ...factsBefore);
        flags.splice(0, flags.length, ...flagsBefore);
        audits.splice(auditsBefore, audits.length - auditsBefore);
        throw e;
      }
    }),
  } as any;

  return { prisma, tx, facts, flags, audits, cases };
}

describe('V28-FACTSTORE-SECURITY-P0-I01 — clearCase tenant scope invariants', () => {
  describe('cross-tenant DENY', () => {
    it('SENARYO 1: yabanci tenant case temizlenemez; HICBIR satir silinmez, HICBIR audit yazilmaz', async () => {
      const { prisma, facts, flags, audits } = buildPrisma();
      const svc = new FactStoreService(prisma);

      await expect(
        svc.clearCase('case-1', { source: 'test' }, T2),
      ).rejects.toThrow(/Case not found/);

      // t1'in verisi AYNEN durur
      expect(facts.filter((r) => r.caseId === 'case-1')).toHaveLength(2);
      expect(flags.filter((r) => r.caseId === 'case-1')).toHaveLength(1);
      // yikici yol hic calismadigi icin audit de uretilmez
      expect(audits).toHaveLength(0);
    });

    it('SENARYO 2: var olmayan case ile yabanci case AYNI hatayi verir (enumeration oracle yok)', async () => {
      const { prisma } = buildPrisma();
      const svc = new FactStoreService(prisma);

      const messageOf = (caseId: string): Promise<string> =>
        svc
          .clearCase(caseId, { source: 'test' }, T2)
          .then(() => 'BEKLENMEYEN_BASARI')
          .catch((e: Error) => e.message);

      const foreign = await messageOf('case-1');
      const missing = await messageOf('yok-boyle-bir-case');

      expect(foreign).toBe('Case not found: case-1');
      expect(missing).toBe('Case not found: yok-boyle-bir-case');
      // Ayni sablon: "var ama senin degil" ile "hic yok" ayirt EDILEMEZ
      expect(foreign.replace('case-1', 'X')).toBe(
        missing.replace('yok-boyle-bir-case', 'X'),
      );
    });

    it('SENARYO 3: kapsam kontrolu silmeden ONCE calisir (deleteMany hic cagrilmaz)', async () => {
      const { prisma, tx } = buildPrisma();
      const svc = new FactStoreService(prisma);

      await expect(
        svc.clearCase('case-1', { source: 'test' }, T2),
      ).rejects.toThrow();

      expect(tx.icrabotCaseFact.deleteMany).not.toHaveBeenCalled();
      expect(tx.icrabotCaseFlag.deleteMany).not.toHaveBeenCalled();
      expect(tx.icrabotFactAudit.create).not.toHaveBeenCalled();
    });
  });

  describe('same-tenant PASS', () => {
    it('SENARYO 4: kendi case\'ini temizler; YALNIZ o case silinir, diger tenant etkilenmez', async () => {
      const { prisma, facts, flags } = buildPrisma();
      const svc = new FactStoreService(prisma);

      await expect(
        svc.clearCase('case-1', { source: 'test' }, T1),
      ).resolves.toBeUndefined();

      expect(facts.filter((r) => r.caseId === 'case-1')).toHaveLength(0);
      expect(flags.filter((r) => r.caseId === 'case-1')).toHaveLength(0);
      // t2'nin verisi DOKUNULMADAN kalir
      expect(facts.filter((r) => r.caseId === 'case-2')).toHaveLength(1);
    });

    it('SENARYO 5: silinen her fact/flag icin audit satiri yazilir (kanit korunur)', async () => {
      const { prisma, audits } = buildPrisma();
      const svc = new FactStoreService(prisma);

      await svc.clearCase('case-1', { source: 'test_harness' }, T1);

      expect(audits).toHaveLength(3); // 2 fact + 1 flag
      expect(audits.filter((a) => a.kind === 'fact')).toHaveLength(2);
      expect(audits.filter((a) => a.kind === 'flag')).toHaveLength(1);
      expect(audits.every((a) => a.newValue === null)).toBe(true);
      expect(audits.every((a) => a.caseId === 'case-1')).toBe(true);
    });

    it('SENARYO 6: platform kapsami (dahili) sahiplik sorgusu YAPMADAN gecer', async () => {
      const { prisma, tx, facts } = buildPrisma();
      const svc = new FactStoreService(prisma);

      await svc.clearCase('case-2', { source: 'internal' }, PLATFORM);

      expect(tx.case.findFirst).not.toHaveBeenCalled();
      expect(facts.filter((r) => r.caseId === 'case-2')).toHaveLength(0);
    });
  });

  describe('kapsam authority uretimi', () => {
    it('SENARYO 7: sahiplik sorgusu YALNIZ dogrulanmis tenantId ile kurulur', async () => {
      const { prisma, tx } = buildPrisma();
      const svc = new FactStoreService(prisma);

      await svc.clearCase('case-1', { source: 'test' }, T1);

      expect(tx.case.findFirst).toHaveBeenCalledWith({
        where: { id: 'case-1', tenantId: 't1' },
        select: { id: true },
      });
    });
  });
});

describe('V28-FACTSTORE-SECURITY-P0-I01 — guard wiring ve HTTP davranisi', () => {
  it('her iki yikici ucta da UNSAFE MUTATION guard kayitli (bypass regresyonu)', () => {
    for (const method of ['clearCase', 'clearCasePost']) {
      const guards =
        Reflect.getMetadata(
          GUARDS_METADATA,
          (FactStoreController as any).prototype[method],
        ) ?? [];
      expect(guards).toContain(IcrabotV28UnsafeMutationGuard);
    }
  });

  describe('runtime HTTP', () => {
    let app: INestApplication;
    let tenantId = 't1';
    const factStore = { clearCase: jest.fn().mockResolvedValue(undefined) };
    const originalFlag = process.env[ICRABOT_V28_UNSAFE_MUTATION_ENABLED];

    beforeAll(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [FactStoreController],
        providers: [
          { provide: FactStoreService, useValue: factStore },
          IcrabotV28UnsafeMutationGuard,
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate(context: ExecutionContext) {
            context.switchToHttp().getRequest().user = {
              id: 'user-1',
              tenantId,
              role: 'ADMIN',
            };
            return true;
          },
        })
        .compile();

      app = moduleRef.createNestApplication();
      await app.init();
    });

    beforeEach(() => {
      tenantId = 't1';
      delete process.env[ICRABOT_V28_UNSAFE_MUTATION_ENABLED];
      jest.clearAllMocks();
    });

    afterAll(async () => {
      await app.close();
      if (originalFlag === undefined) delete process.env[ICRABOT_V28_UNSAFE_MUTATION_ENABLED];
      else process.env[ICRABOT_V28_UNSAFE_MUTATION_ENABLED] = originalFlag;
    });

    it.each([
      ['delete', '/icrabot/v28/facts/case-1'],
      ['post', '/icrabot/v28/facts/case-1/clear'],
    ])('SENARYO 8: %s %s flag kapaliyken servise ULASMADAN 403', async (verb, path) => {
      const response = await (request(app.getHttpServer()) as any)[verb](path).send({});

      expect(response.status).toBe(403);
      expect(JSON.stringify(response.body)).not.toContain('ICRABOT_V28_');
      expect(factStore.clearCase).not.toHaveBeenCalled();
    });

    it.each([
      ['delete', '/icrabot/v28/facts/case-1'],
      ['post', '/icrabot/v28/facts/case-1/clear'],
    ])('SENARYO 9: %s %s flag acikken kapsam JWT tenant\'indan uretilir', async (verb, path) => {
      process.env[ICRABOT_V28_UNSAFE_MUTATION_ENABLED] = 'true';

      const response = await (request(app.getHttpServer()) as any)[verb](path).send({});

      expect(response.status).toBe(200);
      expect(factStore.clearCase).toHaveBeenCalledWith('case-1', {}, T1);
    });

    it('SENARYO 10: body\'deki sahte tenantId kapsami DEGISTIREMEZ', async () => {
      process.env[ICRABOT_V28_UNSAFE_MUTATION_ENABLED] = 'true';

      await request(app.getHttpServer())
        .post('/icrabot/v28/facts/case-1/clear')
        .send({ tenantId: 't2', meta: { tenantId: 't2' } });

      // kapsam daima dogrulanmis JWT tenant'i ('t1'), body'deki 't2' DEGIL
      expect(factStore.clearCase).toHaveBeenCalledWith(
        'case-1',
        { tenantId: 't2' },
        T1,
      );
    });

    it('SENARYO 11: JWT tenant\'i yoksa FAIL-CLOSED (servis cagrilmaz)', async () => {
      process.env[ICRABOT_V28_UNSAFE_MUTATION_ENABLED] = 'true';
      tenantId = '' as any;

      const response = await request(app.getHttpServer())
        .post('/icrabot/v28/facts/case-1/clear')
        .send({});

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(factStore.clearCase).not.toHaveBeenCalled();
    });
  });
});
