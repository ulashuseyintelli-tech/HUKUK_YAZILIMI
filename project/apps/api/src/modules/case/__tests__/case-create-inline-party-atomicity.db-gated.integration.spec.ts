/**
 * DAR ATOMİKLİK — GERÇEK GERİ ALMA KANITI (gerçek PostgreSQL, disposable/test DB).
 *
 * Birim testleri (`case-create-inline-party-atomicity.spec.ts`,
 * `common/__tests__/party-write-tx-participation.spec.ts`) YALNIZCA "hangi client ile yazıldığını"
 * kanıtlar. Bir yazmanın gerçekten GERİ ALINDIĞINI ancak veritabanı söyleyebilir; bu suite onu ölçer.
 *
 * Owner GO 2026-09-12 (madde 2): "Sonraki hata; yeni taraf, ofis, adres ve audit satırlarını
 * bırakmamalı; yeniden etkinleştirilmiş kaydı da önceki durumuna döndürmeli. Başarı yolu, mevcut
 * taraflar ve bağımsız create çağrıları korunmalı."
 *
 * HATA ENJEKSİYONU: `domainEventIngestService.appendInTransaction` (tx adım 8.5) fırlatılır. Bu,
 * TÜM taraf yazmalarından ve `case.create`'ten SONRA gelen GERÇEK bir transaction-içi hata
 * noktasıdır; yamadan ÖNCE bu hata dosyayı geri alır, taraf/ofis/adres/audit satırlarını bırakırdı.
 *
 * GÜVENLİK: yalnız `TEST_DATABASE_URL` ile koşar (`test-db-env` fail-closed; dev `hukuk_db` YASAK).
 * Her koşum kendi sentetik tenant'ında çalışır; gerçek müşteri verisine dokunulmaz.
 */

import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { LawyerService } from '../../lawyer/lawyer.service';
import { ClientService } from '../../client/client.service';
import { DebtorService } from '../../debtor/debtor.service';
import { CaseService } from '../case.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
const describeWithDatabase = TEST_DB_URL ? describe : describe.skip;

/** Taraf sayaçları — hata sonrası "hiçbiri kalmadı" iddiasının ölçüm birimi. */
async function partyCounts(prisma: PrismaClient, tenantId: string) {
  const [lawyers, offices, clients, contacts, addresses, debtors, cases, audits] = await Promise.all([
    prisma.lawyer.count({ where: { tenantId } }),
    prisma.office.count({ where: { tenantId } }),
    prisma.client.count({ where: { tenantId } }),
    prisma.clientContact.count({ where: { client: { tenantId } } }),
    prisma.clientAddress.count({ where: { client: { tenantId } } }),
    prisma.debtor.count({ where: { tenantId } }),
    prisma.case.count({ where: { tenantId } }),
    prisma.auditLog.count({ where: { tenantId } }),
  ]);
  return { lawyers, offices, clients, contacts, addresses, debtors, cases, audits };
}

describeWithDatabase('DAR ATOMİKLİK — gerçek DB üzerinde geri alma', () => {
  let prisma: PrismaService;
  let tenantId: string;
  let domainEventIngest: { appendInTransaction: jest.Mock };
  let caseService: CaseService;

  // `Case.sorumluPersonelId` boş bırakılırsa oluşturan kullanıcıya düşer (FK) → GERÇEK User gerekir.
  let actorId: string;

  beforeAll(async () => {
    prisma = new PrismaService({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    tenantId = `atom-${randomUUID().slice(0, 8)}`;
    await prisma.tenant.create({ data: { id: tenantId, name: `Atomiklik ${tenantId}`, slug: tenantId } });
    const actor = await prisma.user.create({
      data: { tenantId, email: `${tenantId}@test.invalid`, name: 'Test', surname: 'Aktor', role: 'ADMIN' },
    });
    actorId = actor.id;

    const audit = new AuditService(prisma);
    const officeApproval = {
      isF01ActorAuthorized: jest.fn(async () => true),
      isApproverEligible: jest.fn(async () => true),
    } as any;
    const lawyerService = new LawyerService(prisma, audit, officeApproval);
    const clientService = new ClientService(prisma, audit, officeApproval);
    const debtorService = new DebtorService(prisma, audit, officeApproval);
    domainEventIngest = { appendInTransaction: jest.fn(async () => undefined) };
    const noop = {
      sendAutoRequestOnCaseCreate: jest.fn(async () => undefined),
      createOpeningExpenseSet: jest.fn(async () => null),
      sendExpenseEmail: jest.fn(async () => undefined),
    } as any;

    caseService = new CaseService(
      prisma,
      audit,
      noop,
      {} as any,
      noop,
      domainEventIngest as any,
      {} as any,
      clientService,
      lawyerService,
      debtorService,
    );
    // Personel atama adımı bu suite'in konusu değil; sabitlenir.
    (caseService as any).assignCaseStaff = jest.fn(async () => ({ selectionProvided: false, assigned: [] }));
  });

  afterEach(async () => {
    // Sentetik tenant'ı ve altındaki her şeyi temizle (gerçek veriye dokunulmaz).
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.caseClient.deleteMany({ where: { case: { tenantId } } });
    await prisma.caseLawyer.deleteMany({ where: { case: { tenantId } } });
    await prisma.case.deleteMany({ where: { tenantId } });
    await prisma.clientContact.deleteMany({ where: { client: { tenantId } } });
    await prisma.clientAddress.deleteMany({ where: { client: { tenantId } } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.debtor.deleteMany({ where: { tenantId } });
    await prisma.lawyer.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.office.deleteMany({ where: { tenantId } });
    await prisma.task.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  const inlineDto = (fileNumber: string) => ({
    fileNumber,
    type: 'GENERAL_EXECUTION',
    lawyers: [{ name: 'Ada', surname: 'Lovelace', barNumber: `BR-${fileNumber}` }],
    creditors: [
      {
        type: 'INDIVIDUAL',
        name: 'Ahmet Yılmaz',
        phone: '5550001122',
        address: 'Kadıköy / İstanbul',
      },
    ],
  });

  it('SONRAKİ HATA: yeni avukat / ofis / müvekkil / iletişim / adres / audit satırlarının HİÇBİRİ kalmaz', async () => {
    const before = await partyCounts(prisma, tenantId);
    domainEventIngest.appendInTransaction.mockRejectedValueOnce(new Error('DOMAIN_EVENT_PATLADI'));

    await expect(
      caseService.create(tenantId, inlineDto('ATOM/1') as any, actorId, 'ADMIN'),
    ).rejects.toThrow('DOMAIN_EVENT_PATLADI');

    const after = await partyCounts(prisma, tenantId);
    expect(after).toEqual(before);
    // En kritik üçü ayrıca tek tek: sahipsiz ofis, sahipsiz müvekkil, audit artığı YOK.
    expect(after.offices).toBe(0);
    expect(after.clients).toBe(0);
    expect(after.lawyers).toBe(0);
    expect(after.audits).toBe(0);
    expect(after.cases).toBe(0);
  });

  it('SONRAKİ HATA: yeniden etkinleştirilmiş avukat ÖNCEKİ durumuna (pasif) döner ve REACTIVATE audit\'i kalmaz', async () => {
    const office = await prisma.office.create({ data: { tenantId, name: 'Büro' } });
    const pasif = await prisma.lawyer.create({
      data: { tenantId, officeId: office.id, name: 'Ada', surname: 'Lovelace', isActive: false },
    });
    const before = await partyCounts(prisma, tenantId);
    domainEventIngest.appendInTransaction.mockRejectedValueOnce(new Error('DOMAIN_EVENT_PATLADI'));

    await expect(
      caseService.create(tenantId, inlineDto('ATOM/2') as any, actorId, 'ADMIN'),
    ).rejects.toThrow('DOMAIN_EVENT_PATLADI');

    const sonra = await prisma.lawyer.findUniqueOrThrow({ where: { id: pasif.id } });
    expect(sonra.isActive).toBe(false); // reaktivasyon GERİ ALINDI
    expect(await prisma.auditLog.count({ where: { tenantId, action: 'LAWYER_REACTIVATE' } })).toBe(0);
    expect(await partyCounts(prisma, tenantId)).toEqual(before);
  });

  it('BAŞARI YOLU: taraflar, dosya ve audit satırları KALICI olur (+ süre ölçümü)', async () => {
    const basla = Date.now();
    const created: any = await caseService.create(tenantId, inlineDto('ATOM/3') as any, actorId, 'ADMIN');
    const sureMs = Date.now() - basla;

    expect(created?.id).toBeTruthy();
    const after = await partyCounts(prisma, tenantId);
    expect(after.cases).toBe(1);
    expect(after.lawyers).toBe(1);
    expect(after.clients).toBe(1);
    expect(after.offices).toBe(1); // ofis, avukatla AYNI transaction'da oluştu
    expect(after.audits).toBeGreaterThan(0);

    // Süre sınırı gerekçesi (owner: "timeout artışını doğruluk çözümü sayma") — ölçülen gerçek süre
    // seçilen 20 sn sınırının çok altında; sınır yalnız meşru işin kesilmemesi içindir.
    expect(sureMs).toBeLessThan(20_000);
    // eslint-disable-next-line no-console
    console.log(`[ATOMIKLIK] başarılı dosya oluşturma süresi: ${sureMs} ms (tx timeout sınırı 20000 ms)`);
  });

  it('BAĞIMSIZ create çağrıları KORUNUR: LawyerService.create (txCtx YOK) kendi transaction\'ında kalıcı yazar', async () => {
    const audit = new AuditService(prisma);
    const lawyerService = new LawyerService(prisma, audit, {
      isF01ActorAuthorized: jest.fn(async () => true),
    } as any);

    const created: any = await lawyerService.create(tenantId, { name: 'Grace', surname: 'Hopper' });

    expect(created?.id).toBeTruthy();
    expect(await prisma.lawyer.count({ where: { tenantId, isActive: true } })).toBe(1);
    expect(await prisma.office.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { tenantId, action: 'LAWYER_CREATE' } })).toBe(1);
  });
});
