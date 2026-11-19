import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { CaseService } from '../case.service';

/**
 * Borçlu bazlı bakiye ve kalem sorumluluk durumu okumaları borçluları KARARLI sırada verir: dosyaya eklenme zamanı,
 * eşitlikte kimlik. Disposable PostgreSQL; adlar ve tarihler SENTETİK.
 *
 * Ölçülen kusur (PR #3323 CI, 19.11.2026): iki okuyucu dosya borçlularını sıralama belirtmeden yüklüyordu; çıktıdaki
 * borçlu sırası veritabanının satır sırasına bağlıydı ve `claim-liability-collection … AT-16d` testi bir koşuda ters
 * sırayla kırıldı. Kullanıcı tarafında aynı dosyanın borçlu kartları iki okuma arasında yer değiştirebilirdi.
 *
 * Düzenek, eklenme zamanı sırasını satırların YAZILMA sırasının tersine kurar: sıralama belirtilmezse veritabanı
 * satırları yazıldığı sırayla döndürür ve beklenti tutmaz.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('DEBTOR-LEDGER-BALANCE-ORDER DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('Borçlu bakiyesi okumaları borçluları kararlı sırada verir (disposable PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let caseService: CaseService;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    // Bu iki okuma yalnız veritabanı istemcisini kullanır (kardeş emsal: claim-liability-collection … heldView).
    caseService = Object.assign(Object.create(CaseService.prototype), { prisma }) as CaseService;
  });

  afterAll(async () => {
    for (const tenantId of tenantIds) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  const at = (minute: number) => new Date(Date.UTC(2025, 5, 1, 9, minute, 0));

  /**
   * `rows`: satırların YAZILMA sırası. Her satır kendi eklenme zamanını (ve istenirse kimliğini) taşır; beklenen çıktı
   * sırası eklenme zamanına, eşitlikte kimliğe göredir.
   */
  async function fixture(label: string, rows: Array<{ key: string; createdAt: Date; id?: string; lifecycleStatus?: 'ACTIVE' | 'PASSIVE' }>) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-debtor-order-${label}-${suffix}`;
    tenantIds.push(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `Borçlu sırası ${label}`, slug: tenantId } });
    const legalCase = await prisma.case.create({
      data: { tenantId, fileNumber: `BS-${label}-${suffix}`, type: 'GENERAL_EXECUTION', currency: 'TRY' } as never,
    });
    const caseDebtorIdByKey = new Map<string, string>();
    for (const row of rows) {
      const debtor = await prisma.debtor.create({ data: { tenantId, type: 'INDIVIDUAL', name: `Sentetik Borçlu ${row.key}` } as never });
      const caseDebtor = await prisma.caseDebtor.create({
        data: {
          ...(row.id ? { id: `${row.id}-${suffix}` } : {}),
          caseId: legalCase.id,
          debtorId: debtor.id,
          role: 'ASIL_BORCLU',
          createdAt: row.createdAt,
          ...(row.lifecycleStatus ? { lifecycleStatus: row.lifecycleStatus } : {}),
        } as never,
      });
      caseDebtorIdByKey.set(caseDebtor.id, row.key);
    }
    // Dosyada kalem olsun: bakiye okuması her etkin borçluya satır üretir (ortak sorumluluk).
    await prisma.claimItem.create({
      data: {
        tenantId, caseId: legalCase.id, itemType: 'PRINCIPAL', description: 'Sentetik asıl alacak',
        originalAmount: '1000.00', demandedAmount: '1000.00', amount: '1000.00', currency: 'TRY', sortOrder: 1, isAllDebtorsLiable: true,
      } as never,
    });
    const keyOf = (caseDebtorId: string) => caseDebtorIdByKey.get(caseDebtorId) ?? '?';
    return { tenantId, caseId: legalCase.id, keyOf };
  }

  it('borçlu bazlı bakiye: sıra eklenme zamanına göredir, satırların yazılma sırasına göre değil', async () => {
    // Yazılma sırası C, A, B; eklenme zamanı sırası A, B, C.
    const f = await fixture('zaman', [
      { key: 'C', createdAt: at(30) },
      { key: 'A', createdAt: at(10) },
      { key: 'B', createdAt: at(20) },
    ]);
    const first = await caseService.getDebtorLedgerBalances(f.tenantId, f.caseId);
    expect(first.borclular.map((row) => f.keyOf(row.caseDebtorId))).toEqual(['A', 'B', 'C']);

    // Bir satır yeniden yazılsa da (veritabanında yeri değişir) sıra aynı kalır.
    await prisma.caseDebtor.updateMany({ where: { caseId: f.caseId }, data: { quickNote: 'Sentetik not' } as never });
    const second = await caseService.getDebtorLedgerBalances(f.tenantId, f.caseId);
    expect(second.borclular.map((row) => f.keyOf(row.caseDebtorId))).toEqual(['A', 'B', 'C']);
  });

  it('borçlu bazlı bakiye: eklenme zamanı eşitse kimlik sırası belirler; pasif borçlu yine listelenmez', async () => {
    const same = at(15);
    const f = await fixture('esit', [
      { key: 'Z', createdAt: same, id: 'cd-z' },
      { key: 'P', createdAt: at(5), id: 'cd-p', lifecycleStatus: 'PASSIVE' },
      { key: 'M', createdAt: same, id: 'cd-m' },
      { key: 'K', createdAt: same, id: 'cd-k' },
    ]);
    const balances = await caseService.getDebtorLedgerBalances(f.tenantId, f.caseId);
    expect(balances.borclular.map((row) => f.keyOf(row.caseDebtorId))).toEqual(['K', 'M', 'Z']);
  });

  it('kalem sorumluluk durumu: borçlu listesi aynı kararlı sıradadır', async () => {
    const f = await fixture('durum', [
      { key: 'C', createdAt: at(30) },
      { key: 'A', createdAt: at(10) },
      { key: 'B', createdAt: at(20) },
    ]);
    const state = await caseService.getClaimLiabilityState(f.tenantId, f.caseId);
    expect(state.borclular.map((row) => f.keyOf(row.caseDebtorId))).toEqual(['A', 'B', 'C']);
  });
});
