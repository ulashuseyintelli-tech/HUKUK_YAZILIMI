import { PrismaClient } from '@prisma/client';

/**
 * POLICY-CPE-DECISION-COMPOSITE-KEY-P05C-P01 — disposable PostgreSQL 16 integration.
 *
 * Index'in gercekten UNIQUE olarak kuruldugunu, kolon siralamasini, mevcut FK/PK'nin
 * korundugunu ve migration'in HIC veri yazmadigini DB seviyesinde dogrular.
 * Ayrica arastirma sorusunun ikinci yarisini AMPIRIK olarak gosterir: `id` PK oldugu icin
 * (id, caseId) ikilisi hicbir veri durumunda cakisamaz.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/hukuk_test
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe('P05C-P01 — CpeDecisionLog composite key (DB)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

  let tenantId: string;
  let caseId: string;
  let otherCaseId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    tenantId = (await prisma.tenant.create({ data: { name: 'P05C A', slug: `p05c-${stamp}` } })).id;
    caseId = (
      await prisma.case.create({
        data: { tenantId, fileNumber: `P05C-${stamp}`, type: 'GENERAL_EXECUTION' },
      })
    ).id;
    otherCaseId = (
      await prisma.case.create({
        data: { tenantId, fileNumber: `P05C-OTHER-${stamp}`, type: 'GENERAL_EXECUTION' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.cpeDecisionLog.deleteMany({ where: { caseId: { in: [caseId, otherCaseId] } } });
    await prisma.case.deleteMany({ where: { id: { in: [caseId, otherCaseId] } } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const newLog = (id: string, targetCaseId: string) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO "CpeDecisionLog" ("id","caseId","actionCode","scope","allowed","code","reason","factsUsedKeys")
       VALUES ($1,$2,'UYAP_QUERY','CASE',true,'OK','test',ARRAY[]::text[])`,
      id,
      targetCaseId,
    );

  it('unique index dogru isim + kolon sirasi ile KURULDU', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ indexname: string; indexdef: string }>>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE tablename = 'CpeDecisionLog' AND indexname = 'CpeDecisionLog_id_caseId_key'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/CREATE UNIQUE INDEX/);
    // Postgres indexdef'i normalize eder: kucuk harfli tanimlayici tirnaksiz doner (id),
    // camelCase olan tirnakli kalir ("caseId"). Kolon SIRASI korunur.
    expect(rows[0].indexdef).toMatch(/btree \("?id"?, "caseId"\)/);
  });

  it('tenantId kolonu YOK (kolon eklenmedi)', async () => {
    const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'CpeDecisionLog'`,
    );
    expect(cols.map((c) => c.column_name)).not.toContain('tenantId');
  });

  it('mevcut PK ve Case FK KORUNDU', async () => {
    const cons = await prisma.$queryRawUnsafe<Array<{ conname: string; contype: string }>>(
      `SELECT conname, contype FROM pg_constraint WHERE conrelid = '"CpeDecisionLog"'::regclass`,
    );
    const names = cons.map((c) => c.conname);
    expect(names).toContain('CpeDecisionLog_pkey');
    expect(names).toContain('CpeDecisionLog_caseId_fkey');
  });

  it('normal yazim BOZULMADI (index write-path’i kirmaz)', async () => {
    await expect(newLog('p05c-log-1', caseId)).resolves.toBeDefined();
    const row = await prisma.cpeDecisionLog.findUnique({ where: { id: 'p05c-log-1' } });
    expect(row?.caseId).toBe(caseId);
  });

  it('AMPIRIK: ayni id ikinci kez yazilamaz — bu nedenle (id, caseId) cakismasi IMKANSIZ', async () => {
    await newLog('p05c-log-2', caseId);
    // ayni id + FARKLI caseId dahi PK tarafindan reddedilir → composite ikili asla duplicate olamaz
    await expect(newLog('p05c-log-2', otherCaseId)).rejects.toThrow();
  });

  it('composite unique uzerinden tekil erisim calisir (gelecek FK hedefi)', async () => {
    await newLog('p05c-log-3', caseId);
    const row = await prisma.cpeDecisionLog.findUnique({
      where: { id_caseId: { id: 'p05c-log-3', caseId } },
    });
    expect(row?.id).toBe('p05c-log-3');
  });

  it('migration HIC veri yazmadi (yalnizca test verisi mevcut)', async () => {
    const seeded = await prisma.cpeDecisionLog.count({ where: { caseId: { in: [caseId, otherCaseId] } } });
    const total = await prisma.cpeDecisionLog.count();
    expect(total).toBe(seeded); // migration kaynakli ek satir YOK
  });
});
