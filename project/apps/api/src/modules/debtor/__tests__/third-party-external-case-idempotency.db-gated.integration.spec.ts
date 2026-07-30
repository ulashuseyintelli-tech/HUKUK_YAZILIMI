import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { ThirdPartyService } from '../third-party.service';
import { CaseDebtorLifecycleGuardService } from '../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';

// I15 PHASE A (DEBTOR-ENFORCEMENT-SEIZURE-GATE-RECONCILIATION-P1-I15, legacy TASK 09):
// ThirdPartyService.createExternalCase() onceden hicbir dedup icermiyordu (ne app-level
// ne DB-level). Bu spec, migration 20260730170000_debtor_external_case_logical_identity_unique
// + createExternalCase()'in findFirst on-kontrol + P2002 idempotent-replay deseninin
// GERCEKTEN calistigini disposable Postgres uzerinde kanitlar.

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('I15 Phase A DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('I15 Phase A — ExternalCase logical-identity idempotency', () => {
  jest.setTimeout(60_000);
  let prisma: PrismaClient;
  let service: ThirdPartyService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const lifecycleGuard = new CaseDebtorLifecycleGuardService(prisma as any);
    service = new ThirdPartyService(prisma as any, {} as any, lifecycleGuard);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createFixture(label: string, opts: { passive?: boolean } = {}) {
    const suffix = randomUUID();
    const tenantId = `i15-${label}-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: `I15 ${label}`, slug: tenantId } });
    const client = await prisma.client.create({
      data: { tenantId, displayName: 'I15 Client', type: 'INDIVIDUAL' },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `I15-${suffix.slice(0, 8)}`,
        type: 'GENERAL_EXECUTION',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
      },
    });
    const debtor = await prisma.debtor.create({
      data: { tenantId, type: 'INDIVIDUAL', firstName: 'Test', lastName: 'Borclu', name: 'Test Borclu' },
    });
    const caseDebtor = await prisma.caseDebtor.create({
      data: {
        caseId: caseRow.id,
        debtorId: debtor.id,
        lifecycleStatus: opts.passive ? 'PASSIVE' : 'ACTIVE',
      },
    });
    return { tenantId, caseId: caseRow.id, caseDebtorId: caseDebtor.id };
  }

  function dto(overrides: Record<string, unknown> = {}) {
    return {
      externalOffice: 'Ankara 5. İcra Dairesi',
      externalCaseNo: '2026/12345',
      counterpartyName: 'Karşı Taraf A.Ş.',
      claimAmount: 10000,
      claimCurrency: 'TRY',
      ...overrides,
    };
  }

  // TEST 1: same logical request retry -> one logical result
  it('TEST-1: aynı mantıksal istek retry edilirse tek satır döner (idempotent replay)', async () => {
    const fx = await createFixture('t1');
    const first = await service.createExternalCase(fx.tenantId, fx.caseDebtorId, dto());
    const second = await service.createExternalCase(fx.tenantId, fx.caseDebtorId, dto());
    expect(second.id).toBe(first.id);
    const count = await prisma.externalCase.count({ where: { caseDebtorId: fx.caseDebtorId } });
    expect(count).toBe(1);
  });

  // TEST 2: concurrent duplicate attempts -> one stored row. Yuksek eszamanlilik
  // (25 paralel cagri) app-level on-kontrolun race-pencerisini asip en az bir
  // cagriyi gercekten P2002 yakala-ve-replay dalina zorlar (2 paralel cagriyla
  // bu dalin her zaman tetiklenmedigi ampirik olarak dogrulandi).
  it('TEST-2: eşzamanlı çift istekte tek satır kalıcı olur (P2002 race yakalanır)', async () => {
    const fx = await createFixture('t2');
    const results = await Promise.all(
      Array.from({ length: 25 }, () => service.createExternalCase(fx.tenantId, fx.caseDebtorId, dto())),
    );
    const ids = new Set(results.map((r) => r.id));
    expect(ids.size).toBe(1);
    const count = await prisma.externalCase.count({ where: { caseDebtorId: fx.caseDebtorId } });
    expect(count).toBe(1);
  });

  // TEST 3: different tenant -> independently allowed
  it('TEST-3: farklı tenant aynı office+caseNo ile bağımsız satır oluşturabilir', async () => {
    const fx1 = await createFixture('t3a');
    const fx2 = await createFixture('t3b');
    const r1 = await service.createExternalCase(fx1.tenantId, fx1.caseDebtorId, dto());
    const r2 = await service.createExternalCase(fx2.tenantId, fx2.caseDebtorId, dto());
    expect(r1.id).not.toBe(r2.id);
  });

  // TEST 4: different CaseDebtor -> independently allowed
  it('TEST-4: aynı tenant içinde farklı CaseDebtor bağımsız satır oluşturabilir', async () => {
    const fx = await createFixture('t4');
    const suffix = randomUUID();
    const debtor2 = await prisma.debtor.create({
      data: {
        tenantId: fx.tenantId,
        type: 'INDIVIDUAL',
        firstName: 'Ikinci',
        lastName: `Borclu-${suffix}`,
        name: `Ikinci Borclu-${suffix}`,
      },
    });
    const caseDebtor2 = await prisma.caseDebtor.create({
      data: { caseId: fx.caseId, debtorId: debtor2.id, lifecycleStatus: 'ACTIVE' },
    });
    const r1 = await service.createExternalCase(fx.tenantId, fx.caseDebtorId, dto());
    const r2 = await service.createExternalCase(fx.tenantId, caseDebtor2.id, dto());
    expect(r1.id).not.toBe(r2.id);
  });

  // TEST 5: materially different external file -> allowed
  it('TEST-5: farklı externalCaseNo/externalOffice bağımsız satır oluşturabilir', async () => {
    const fx = await createFixture('t5');
    const r1 = await service.createExternalCase(fx.tenantId, fx.caseDebtorId, dto());
    const r2 = await service.createExternalCase(
      fx.tenantId,
      fx.caseDebtorId,
      dto({ externalCaseNo: '2026/99999' }),
    );
    const r3 = await service.createExternalCase(
      fx.tenantId,
      fx.caseDebtorId,
      dto({ externalOffice: 'İstanbul 3. İcra Dairesi' }),
    );
    expect(new Set([r1.id, r2.id, r3.id]).size).toBe(3);
  });

  // TEST 6: unauthorized (passive CaseDebtor) attempt -> zero rows
  it('TEST-6: pasif CaseDebtor üzerinde create reddedilir, hiçbir satır yazılmaz', async () => {
    const fx = await createFixture('t6', { passive: true });
    await expect(service.createExternalCase(fx.tenantId, fx.caseDebtorId, dto())).rejects.toThrow(
      'Pasif dosya borçlusu yeni operasyon hedefi olamaz.',
    );
    const count = await prisma.externalCase.count({ where: { caseDebtorId: fx.caseDebtorId } });
    expect(count).toBe(0);
  });

  // TEST 7: DB invariant remains effective if app pre-check is removed
  it('TEST-7: uygulama-katmanı ön-kontrolü baypas edilse bile DB constraint korur (P2002 replay)', async () => {
    const fx = await createFixture('t7');
    const data = {
      tenantId: fx.tenantId,
      caseDebtorId: fx.caseDebtorId,
      externalOffice: dto().externalOffice,
      externalCaseNo: dto().externalCaseNo,
      counterpartyName: dto().counterpartyName,
      claimAmount: dto().claimAmount,
      claimCurrency: 'TRY',
      attachmentStatus: 'HACIZ_TALEP' as const,
    };
    // Ön-kontrolü atlayıp doğrudan create çağırıyoruz (app pre-check YOK sayılıyor) —
    // ikinci doğrudan create DB constraint'e çarpmalı.
    await (prisma as any).externalCase.create({ data });
    await expect((prisma as any).externalCase.create({ data })).rejects.toThrow(
      Prisma.PrismaClientKnownRequestError,
    );
    const count = await prisma.externalCase.count({ where: { caseDebtorId: fx.caseDebtorId } });
    expect(count).toBe(1);
  });

  // TEST 8: app test turns red if DB invariant is removed (kanıt: constraint gerçekten var).
  // KRİTİK: her insert FARKLI bir "id" (PK) taşımalı — aksi halde ikinci insert'in
  // reddi composite constraint'ten değil, primary-key çakışmasından kaynaklanır ve
  // test yanlış şeyi kanıtlamış olur (bu spec'in ilk taslağında bu hata bizzat
  // mutasyon kontrolü sırasında yakalandı — bkz. Phase A final rapor, MUTATION-1).
  const insertExternalCaseRow = (tenantId: string, caseDebtorId: string) =>
    prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ExternalCase"
        ("id","tenantId","caseDebtorId","externalOffice","externalCaseNo","counterpartyName","claimAmount","claimCurrency","attachmentStatus","receivedAmount","createdAt","updatedAt")
      VALUES
        (${randomUUID()}, ${tenantId}, ${caseDebtorId}, 'Ankara 5. İcra Dairesi', '2026/77777', 'Karşı Taraf', 5000, 'TRY', 'HACIZ_TALEP', 0, now(), now())
    `);

  it('TEST-8: unique constraint doğrudan iki bağımsız (farklı id) INSERT ile ihlal edilemez (mutation-guard kanıtı)', async () => {
    const fx = await createFixture('t8');
    await insertExternalCaseRow(fx.tenantId, fx.caseDebtorId);
    await expect(insertExternalCaseRow(fx.tenantId, fx.caseDebtorId)).rejects.toThrow();
    const count = await prisma.externalCase.count({
      where: { caseDebtorId: fx.caseDebtorId, externalCaseNo: '2026/77777' },
    });
    expect(count).toBe(1);
  });

  // TEST 9 (ek): claimAmount farklı olsa bile aynı mantıksal kimlik replay döner
  it('TEST-9: aynı mantıksal kimlikte farklı claimAmount ile ikinci çağrı ilk satırı döner (create ezmez)', async () => {
    const fx = await createFixture('t9');
    const first = await service.createExternalCase(fx.tenantId, fx.caseDebtorId, dto({ claimAmount: 1000 }));
    const second = await service.createExternalCase(fx.tenantId, fx.caseDebtorId, dto({ claimAmount: 999999 }));
    expect(second.id).toBe(first.id);
    expect(Number(second.claimAmount)).toBe(1000);
  });
});
