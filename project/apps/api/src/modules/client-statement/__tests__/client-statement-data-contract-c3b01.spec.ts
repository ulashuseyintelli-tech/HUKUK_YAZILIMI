/**
 * CAD C3-B01 — EKSTRE VERİ SÖZLEŞMESİ (characterization).
 *
 * Bu spec MEVCUT davranışı KİLİTLER; ürün davranışını değiştirmez. Amaç, C3-B02 (PDF) ve
 * C3-B03 (mail eki) render'ının üzerine kurulacağı sözleşmeyi test seviyesinde sabitlemek:
 *
 *  1. CLIENT-LEVEL vs CASE-LEVEL semantiği AYRIDIR ve karışmaz
 *     (ClientStatement.caseId = null → client-level; dolu → case-level).
 *  2. CLIENT-LEVEL satırlarda ClientStatementLine.caseId ZORUNLU doldurulur
 *     (şema nullable'dır; davranış kuralı burada kilitlenir).
 *  3. CASE-LEVEL satırlarda caseId taşınmaz (parent zaten dosyayı verir).
 *  4. TENANT/MÜVEKKIL İZOLASYONU: üretim ve okuma sorguları tenant-scoped'dır;
 *     başka müvekkilin CaseClient bağı projeksiyona giremez.
 *  5. İÇ ID SINIRI (POL-4 hazırlığı): satır kaydı refId/caseClientId/statementId gibi iç
 *     ID'leri TAŞIR; bunlar render'a GİRMEMELİDİR. Bu spec, render sözleşmesinin dışlaması
 *     gereken alanların EXACT listesini kilitler (C3-B02 bu listeyi tüketir).
 *
 * XL-B NOTU: "client-safe insan-okur dosya referansı" primitifi X2-B03'ün yazıcı olduğu
 * paylaşımlı sözleşmedir. C3 kendi kopyasını ÜRETMEZ; bu spec o primitifi VARSAYMAZ ve
 * dosya referansı üretimini TEST ETMEZ — yalnız iç ID'lerin render dışı kalması gereğini
 * kayda geçirir.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationDispatcherService } from '@/modules/client-notification/notification-dispatcher.service';
import { OfficeService } from '@/modules/office/office.service';
import { AuditService } from '@/modules/audit/audit.service';
import { ClientStatementService } from '../client-statement.service';

const D = (n: number) => new Prisma.Decimal(n);
const TENANT = 'tenant-1';
const OTHER_TENANT = 'tenant-2';
const CASE_A = 'case-a';
const CASE_B = 'case-b';
const CLIENT = 'client-1';
const USER = 'user-1';

/** Render sözleşmesinin DIŞLAMASI gereken iç alanlar (POL-4 sınırı, C3-B02 tüketir). */
export const C3_RENDER_FORBIDDEN_LINE_FIELDS = ['statementId', 'refId', 'refType', 'caseClientId', 'id'] as const;

const buildPrisma = () => ({
  case: { findFirst: jest.fn().mockResolvedValue({ id: CASE_A }) },
  client: { findFirst: jest.fn().mockResolvedValue({ id: CLIENT }) },
  caseClient: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  caseBalance: { findFirst: jest.fn().mockResolvedValue({ id: 'cb-1' }) },
  balanceLedger: {
    aggregate: jest.fn().mockResolvedValue({ _sum: { amount: D(0) } }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  expenseRequest: { findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: null } }) },
  expensePayment: { findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
  collectionDisposition: { findMany: jest.fn().mockResolvedValue([]) },
  collectionDispositionLine: { findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
  clientPayout: { findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
  clientOffset: { findMany: jest.fn().mockResolvedValue([]) },
  clientStatement: {
    create: jest.fn().mockResolvedValue({ id: 'st-1' }),
    update: jest.fn(),
    findFirst: jest.fn().mockResolvedValue({ id: 'st-1', lines: [] }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  clientStatementLine: { createMany: jest.fn() },
  $executeRaw: jest.fn().mockResolvedValue(1),
  $transaction: jest.fn(),
});

describe('CAD C3-B01 — ekstre veri sözleşmesi (characterization)', () => {
  let service: ClientStatementService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();
    (prisma.$transaction as jest.Mock).mockImplementation((fn: any) => fn(prisma));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientStatementService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationDispatcherService, useValue: { dispatch: jest.fn().mockResolvedValue({ status: 'sent' }) } },
        { provide: OfficeService, useValue: { getOrCreate: jest.fn().mockResolvedValue({ name: 'Test Büro' }) } },
        { provide: AuditService, useValue: { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn() } },
      ],
    }).compile();
    service = module.get(ClientStatementService);
  });

  const period = { periodStart: '2026-06-01T00:00:00Z', periodEnd: '2026-06-30T23:59:59Z' };

  /** İki farklı dosyadan proceeds üreten client-level kurulum. */
  const seedClientLevelProceeds = () => {
    prisma.caseClient.findMany.mockResolvedValue([
      { id: 'cc-a', caseId: CASE_A },
      { id: 'cc-b', caseId: CASE_B },
    ]);
    prisma.collectionDispositionLine.findMany.mockResolvedValue([
      { id: 'dl-a', amount: D(100), caseClientId: 'cc-a', disposition: { caseId: CASE_A, postedAt: new Date('2026-06-05') } },
      { id: 'dl-b', amount: D(50), caseClientId: 'cc-b', disposition: { caseId: CASE_B, postedAt: new Date('2026-06-10') } },
    ]);
  };

  // ---------------------------------------------------------------------------------------
  // 1-2-3. CLIENT-LEVEL vs CASE-LEVEL ayrımı
  // ---------------------------------------------------------------------------------------
  it('[B01-1] client-level ekstre başlığı caseId=null taşır (scope ayrımı)', async () => {
    seedClientLevelProceeds();
    await service.createClientLevel(TENANT, CLIENT, USER, period as any);

    const header = prisma.clientStatement.create.mock.calls[0][0].data;
    expect(header.caseId).toBeNull();
    expect(header.clientId).toBe(CLIENT);
    expect(header.tenantId).toBe(TENANT);
  });

  it('[B01-2] client-level SATIRLARDA caseId ZORUNLU doldurulur (şema nullable — davranış kuralı)', async () => {
    seedClientLevelProceeds();
    await service.createClientLevel(TENANT, CLIENT, USER, period as any);

    const lines = prisma.clientStatementLine.createMany.mock.calls[0][0].data;
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l.caseId).toBeTruthy(); // null/undefined/'' KABUL EDİLMEZ
    }
    // satırlar geldikleri dosyayı taşır (karışmaz)
    expect(new Set(lines.map((l: any) => l.caseId))).toEqual(new Set([CASE_A, CASE_B]));
  });

  it('[B01-3] case-level ekstre başlığı caseId taşır; satırlar dosya kimliğini TEKRARLAMAZ', async () => {
    prisma.balanceLedger.findMany.mockResolvedValue([
      { id: 'l1', amount: D(50), type: 'CREDIT', description: 'avans', createdAt: new Date(1000) },
    ]);
    await service.create(TENANT, CASE_A, USER, { clientId: CLIENT, ...period } as any);

    const header = prisma.clientStatement.create.mock.calls[0][0].data;
    expect(header.caseId).toBe(CASE_A);
    const lines = prisma.clientStatementLine.createMany.mock.calls[0][0].data;
    for (const l of lines) {
      expect(l.caseId ?? null).toBeNull(); // parent zaten dosyayı verir
    }
  });

  it('[B01-4] iki scope AYRI kilit/sayım namespace kullanır (client-level ≠ case-level çakışması)', async () => {
    seedClientLevelProceeds();
    await service.createClientLevel(TENANT, CLIENT, USER, period as any);
    const countArgs = prisma.clientStatement.count.mock.calls[0][0].where;
    expect(countArgs.caseId).toBeNull(); // IS NULL — case-level kayıtları saymaz
    expect(countArgs.tenantId).toBe(TENANT);
    expect(countArgs.clientId).toBe(CLIENT);
  });

  // ---------------------------------------------------------------------------------------
  // 4. Tenant / müvekkil izolasyonu
  // ---------------------------------------------------------------------------------------
  it('[B01-5] client-level toplama sorgusu tenant-scoped: başka tenant bağı projeksiyona giremez', async () => {
    seedClientLevelProceeds();
    await service.createClientLevel(TENANT, CLIENT, USER, period as any);

    const ccWhere = prisma.caseClient.findMany.mock.calls[0][0].where;
    expect(ccWhere.clientId).toBe(CLIENT);           // yalnız bu müvekkil
    expect(ccWhere.client).toEqual({ tenantId: TENANT }); // tenant sınırı
    // proceeds sorgusu yalnız bu müvekkilin caseClient id'leriyle sınırlı
    const dlWhere = prisma.collectionDispositionLine.findMany.mock.calls.at(-1)![0].where;
    expect(dlWhere.caseClientId.in.sort()).toEqual(['cc-a', 'cc-b']);
    // Tenant sınırı NESTED ilişkide taşınır (line'ın tenantId kolonu yoktur; parent
    // disposition zorunlu ilişkidir → scoped parent burada geçerli kanıttır).
    expect(dlWhere.disposition.tenantId).toBe(TENANT);
    expect(dlWhere.disposition.status).toBe('POSTED');
    expect(dlWhere.disposition.manualReversalRequiredAt).toBeNull();
  });

  it('[B01-6] findOne tenant-scoped okur (cross-tenant erişim yok)', async () => {
    prisma.clientStatement.findFirst.mockResolvedValue({ id: 'st-1', lines: [] });
    await service.findOne(TENANT, 'st-1');
    const where = prisma.clientStatement.findFirst.mock.calls.at(-1)![0].where;
    expect(where).toEqual({ id: 'st-1', tenantId: TENANT });
    expect(where.tenantId).not.toBe(OTHER_TENANT);
  });

  it('[B01-7] listByClient tenant + müvekkil sınırında listeler', async () => {
    await service.listByClient(TENANT, CLIENT);
    const where = prisma.clientStatement.findMany.mock.calls.at(-1)![0].where;
    expect(where.tenantId).toBe(TENANT);
    expect(where.clientId).toBe(CLIENT);
  });

  // ---------------------------------------------------------------------------------------
  // 5. İç ID sınırı — render sözleşmesi hazırlığı (POL-4)
  // ---------------------------------------------------------------------------------------
  it('[B01-8] persist edilen satır iç ID taşır → render bu alanları DIŞLAMAK zorundadır', async () => {
    seedClientLevelProceeds();
    await service.createClientLevel(TENANT, CLIENT, USER, period as any);

    const lines = prisma.clientStatementLine.createMany.mock.calls[0][0].data;
    // Kayıt katmanı iç referansları taşır (kanıt): statementId + caseClientId mevcut.
    expect(lines[0].statementId).toBeTruthy();
    expect('caseClientId' in lines[0]).toBe(true);
    // Render sözleşmesinin dışlayacağı EXACT alan listesi (C3-B02 tüketir).
    expect([...C3_RENDER_FORBIDDEN_LINE_FIELDS]).toEqual(['statementId', 'refId', 'refType', 'caseClientId', 'id']);
  });

  it('[B01-9] client-level satır seti YALNIZ bu müvekkilin dosyalarından gelir (çapraz müvekkil sızıntısı yok)', async () => {
    prisma.caseClient.findMany.mockResolvedValue([{ id: 'cc-a', caseId: CASE_A }]);
    prisma.collectionDispositionLine.findMany.mockResolvedValue([
      { id: 'dl-a', amount: D(100), caseClientId: 'cc-a', disposition: { caseId: CASE_A, postedAt: new Date('2026-06-05') } },
    ]);
    await service.createClientLevel(TENANT, CLIENT, USER, period as any);

    const lines = prisma.clientStatementLine.createMany.mock.calls[0][0].data;
    const allowedCaseIds = new Set([CASE_A]);
    for (const l of lines) {
      if (l.caseId) expect(allowedCaseIds.has(l.caseId)).toBe(true);
      if (l.caseClientId) expect(l.caseClientId).toBe('cc-a');
    }
  });
});
