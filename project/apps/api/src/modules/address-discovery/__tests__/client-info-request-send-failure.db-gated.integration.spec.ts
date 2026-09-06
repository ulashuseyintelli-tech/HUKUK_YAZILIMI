/**
 * BILGI TALEBI GONDERIM DURUMU — KALICI DURUM DOGRULANMIS SONUCA DAYANIR (gercek PostgreSQL).
 *
 * KUSUR TARIHI (iki asama):
 *  1. Ilk halde talep kaydi `status: 'SENT'` olarak saglayici cagrisindan ONCE yaziliyor,
 *     basarisizlikta siliniyordu; silme hatasi YUTULUYORDU.
 *  2. Ilk duzeltme yalniz HATA MESAJINI ayirdi — silme basarisiz oldugunda DB'de "gonderildi"
 *     satiri KALMAYA devam ediyordu ve bu suite o yanlis durumu "beklenen sonuc" sayiyordu.
 *
 * GECERLI SOZLESME (owner GO 2026-09-06, adim 1): kayit GONDERIM DOGRULANDIKTAN SONRA olusur.
 *  - saglayici acikca basarili        → kayit yazilir, `sentAt` gercek gonderim anidir
 *  - saglayici acikca basarisiz       → kayit HIC OLUSMAZ
 *  - saglayici yanit vermez (belirsiz) → kayit HIC OLUSMAZ, otomatik tekrar gonderim YAPILMAZ
 *  - gonderim OK ama DB yazimi hatali → AYRI durum: kullaniciya "gonderilmedi" DENMEZ
 * Basarisiz talep kalici kayitta, listede ve detayda gorunmez; "gonderilmis talebe hatirlatma"
 * yoluna da giremez (kayit yoktur).
 *
 * E-posta saglayicisi SAHTEDIR; gercek aliciya gonderim YOKTUR.
 */
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { ClientIntakeLinkService } from '../../client-intake-link/client-intake-link.service';
import { EmailProviderService } from '../../notification/email-provider.service';
import { ClientInfoRequestService } from '../client-info-request.service';

const TEST_DATABASE_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DATABASE_URL) {
  throw new Error('INFO_REQUEST_SEND_STATUS_TEST_DATABASE_REQUIRED');
}
const describeWithDatabase = TEST_DATABASE_URL ? describe : describe.skip;

describeWithDatabase('D-3a gonderim durumu: kalici kayit dogrulanmis sonuca dayanir (gercek PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let service: ClientInfoRequestService;
  let tenantId: string;
  let clientId: string;
  let caseId: string;
  let debtorId: string;
  let userId: string;

  /**
   * Saglayici davranisi:
   *   'ok'            → kabul (`success:true` + ACCEPTED)
   *   'fail'          → DOGRULANABILIR ret (`success:false` + REJECTED)
   *   'throw'         → saglayici katmani disina istisna (yanit yok → belirsiz)
   *   'silentFailure' → `success:false` AMA kesinlik BILDIRMEYEN saglayici (eski sozlesme)
   */
  let providerMode: 'ok' | 'fail' | 'throw' | 'silentFailure';
  /** true ise `clientInfoRequest.create` gercek bir DB hatasi gibi patlar. */
  let breakCreate: boolean;
  /** Cagri sirasi kaniti: 'send' ve 'create' olaylari olus sirasiyla. */
  let callOrder: string[];
  /** Saglayiciya kac kez gidildi (kor otomatik tekrar gonderim olcumu). */
  let sendCount: number;
  let auditCalls: any[];

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Gercek PrismaClient'i saran proxy: `clientInfoRequest.create/delete` gozlenir, create bozulabilir. */
  function buildPrismaProxy(): any {
    const delegate: any = new Proxy((prisma as any).clientInfoRequest, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop === 'create' && typeof value === 'function') {
          return async (...args: any[]) => {
            callOrder.push('create');
            if (breakCreate) {
              throw new Error('SIMULATED_DB_FAILURE: connection terminated during create');
            }
            return value.apply(target, args);
          };
        }
        if (prop === 'delete' && typeof value === 'function') {
          return async (...args: any[]) => {
            callOrder.push('delete');
            return value.apply(target, args);
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return new Proxy(prisma as any, {
      get(target, prop, receiver) {
        if (prop === 'clientInfoRequest') return delegate;
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  beforeEach(async () => {
    providerMode = 'ok';
    breakCreate = false;
    callOrder = [];
    sendCount = 0;
    auditCalls = [];
    const sfx = randomUUID().slice(0, 8);

    const tenant = await prisma.tenant.create({
      data: { name: `SendStatus ${sfx}`, slug: `send-status-${sfx}` },
      select: { id: true },
    });
    tenantId = tenant.id;

    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `sendstatus-${sfx}@test.invalid`,
        passwordHash: 'x'.repeat(20),
        name: 'Send',
        surname: 'Status',
        role: 'ADMIN',
      },
      select: { id: true },
    });
    userId = user.id;

    const client = await prisma.client.create({
      data: {
        tenantId,
        type: 'INDIVIDUAL',
        firstName: 'Gonderim',
        lastName: 'Probe',
        displayName: 'Gonderim Probe',
        name: 'Gonderim Probe',
        email: 'muvekkil@test.invalid',
        isActive: true,
      },
      select: { id: true },
    });
    clientId = client.id;

    const kase = await prisma.case.create({
      data: { tenantId, fileNumber: `SENDST-${sfx}`, type: 'GENERAL_EXECUTION', clientId, caseStatus: 'DERDEST' },
      select: { id: true },
    });
    caseId = kase.id;
    await prisma.caseClient.create({ data: { caseId, clientId } });

    const debtor = await prisma.debtor.create({
      data: { tenantId, name: 'Borclu Probe', type: 'INDIVIDUAL' },
      select: { id: true },
    });
    debtorId = debtor.id;
    await prisma.caseDebtor.create({ data: { caseId, debtorId } });

    const emailProvider = {
      send: jest.fn(async () => {
        callOrder.push('send');
        sendCount += 1;
        if (providerMode === 'throw') throw new Error('SIMULATED_PROVIDER_TIMEOUT');
        if (providerMode === 'fail') {
          // DOGRULANABILIR ret: sunucu 550 ile acikca reddetti.
          return { success: false, errorMessage: 'SMTP 550 rejected', deliveryOutcome: 'REJECTED' };
        }
        if (providerMode === 'silentFailure') {
          // Kesinlik BILDIRMEYEN saglayici — `success:false` tek basina kesin ret KANITI DEGILDIR.
          return { success: false, errorMessage: 'sebep bildirilmedi' };
        }
        return { success: true, deliveryOutcome: 'ACCEPTED' };
      }),
    };
    const audit = {
      log: jest.fn(async (input: any) => {
        auditCalls.push(input);
      }),
      logInTransaction: jest.fn(),
    };
    const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(true) };
    const intakeLink = { createForClientWorkspace: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ClientInfoRequestService,
        { provide: PrismaService, useValue: buildPrismaProxy() },
        { provide: EmailProviderService, useValue: emailProvider },
        { provide: AuditService, useValue: audit },
        { provide: OfficeApprovalService, useValue: officeApproval },
        { provide: ClientIntakeLinkService, useValue: intakeLink },
      ],
    }).compile();
    service = moduleRef.get(ClientInfoRequestService);
  });

  afterEach(async () => {
    await prisma.clientInfoRequest.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.addressAuditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clientNotification.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.caseDebtor.deleteMany({ where: { case: { tenantId } } }).catch(() => undefined);
    await prisma.debtor.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.caseClient.deleteMany({ where: { case: { tenantId } } }).catch(() => undefined);
    await prisma.case.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.client.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  });

  const actor = { userId: '', tenantId: '', role: 'ADMIN' };
  const send = () =>
    service.createRequest(
      tenantId,
      { caseId, clientId, debtorId, emailTo: 'muvekkil@test.invalid' } as any,
      { ...actor, userId, tenantId },
    );

  async function persistedRows() {
    return prisma.clientInfoRequest.findMany({
      where: { tenantId },
      select: { id: true, status: true, sentAt: true },
    });
  }

  it('SIRA: saglayici cagrisi kalici yazmadan ONCE gelir', async () => {
    providerMode = 'ok';
    await send();
    expect(callOrder).toEqual(['send', 'create']);
    expect(callOrder.includes('delete')).toBe(false); // geri-alma yolu ARTIK YOK
  });

  it('SAGLAYICI DOGRULANABILIR RET BILDIRDI: kalici kayit HIC OLUSMAZ', async () => {
    providerMode = 'fail';

    await expect(send()).rejects.toMatchObject({
      response: { reasonCode: 'CLIENT_INFO_REQUEST_EMAIL_FAILED' },
    });

    expect(await persistedRows()).toHaveLength(0);
    expect(callOrder).toEqual(['send']); // create'e HIC gidilmedi
    expect(auditCalls).toHaveLength(0); // basarisiz komut audit uretmez
  });

  it('KESINLIK BILDIRMEYEN saglayici: `success:false` tek basina KESIN RET SAYILMAZ', async () => {
    // FAIL-SAFE: alan yoksa belirsiz kabul edilir. Aksi halde iletilmis olabilecek bir gonderim
    // "gonderilemedi" diye bildirilir ve kullanici tekrar gonderir (mukerrer e-posta).
    providerMode = 'silentFailure';

    await expect(send()).rejects.toMatchObject({
      response: { reasonCode: 'CLIENT_INFO_REQUEST_EMAIL_INDETERMINATE' },
    });
    expect(await persistedRows()).toHaveLength(0);
    expect(sendCount).toBe(1);
    expect(auditCalls).toHaveLength(0);
  });

  it('BELIRSIZ SONUC: kayit OLUSMAZ, AYRI reasonCode, KOR OTOMATIK TEKRAR GONDERIM YOK', async () => {
    providerMode = 'throw';

    let caught: any;
    try {
      await send();
      throw new Error('BEKLENEN HATA ATILMADI');
    } catch (e: any) {
      caught = e;
    }
    const body = caught?.response ?? {};

    expect(body.reasonCode).toBe('CLIENT_INFO_REQUEST_EMAIL_INDETERMINATE');
    // Belirsizlik kullaniciya ACIKCA soylenir; "gonderilemedi" kesinligi iddia EDILMEZ.
    expect(body.message).toMatch(/DOĞRULANAMADI/);
    expect(body.message).toMatch(/iletilmiş olabilir/);
    expect(await persistedRows()).toHaveLength(0);
    expect(sendCount).toBe(1); // otomatik yeniden deneme YOK
    expect(auditCalls).toHaveLength(0);
  });

  it('GONDERIM OK ama DB YAZIMI HATALI: AYRI durum — kullaniciya "gonderilmedi" DENMEZ', async () => {
    providerMode = 'ok';
    breakCreate = true;

    let caught: any;
    try {
      await send();
      throw new Error('BEKLENEN HATA ATILMADI');
    } catch (e: any) {
      caught = e;
    }
    const body = caught?.response ?? {};

    expect(body.reasonCode).toBe('CLIENT_INFO_REQUEST_SENT_BUT_NOT_RECORDED');
    expect(body.message).toMatch(/GÖNDERİLDİ/);
    expect(body.message).toMatch(/Tekrar göndermeyin/);
    // Yanlis "gonderilmedi" ifadesi YOK (mukerrer gonderime yol acardi).
    expect(body.message).not.toMatch(/gönderilemedi/i);
    expect(await persistedRows()).toHaveLength(0);
    expect(sendCount).toBe(1);
  });

  it('BASARILI GONDERIM: kayit SENT olarak yazilir, sentAt gonderimden SONRADIR', async () => {
    providerMode = 'ok';
    const before = new Date();

    const created: any = await send();

    const rows = await persistedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(created.id);
    expect(rows[0].status).toBe('SENT');
    expect(rows[0].sentAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(created.emailSent).toBe(true);
    expect(auditCalls.length).toBeGreaterThan(0);
  });

  it('LISTE/DETAY: basarisiz gonderim hicbir okuma yolunda GORUNMEZ', async () => {
    providerMode = 'fail';
    await expect(send()).rejects.toBeDefined();

    const list: any[] = await service.getRequestsForCase(tenantId, caseId);
    expect(list).toHaveLength(0);
    expect(await persistedRows()).toHaveLength(0);
  });

  it('HATIRLATMA: basarisiz gonderim "gonderilmis talebe hatirlatma" yoluna GIREMEZ', async () => {
    providerMode = 'fail';
    await expect(send()).rejects.toBeDefined();

    // Kayit olusmadigi icin hatirlatilacak talep de yoktur.
    const rows = await persistedRows();
    expect(rows).toHaveLength(0);
    await expect(
      service.sendReminder(tenantId, 'olmayan-talep-id', { ...actor, userId, tenantId } as any),
    ).rejects.toThrow(/bulunamadı/i);
  });

  it('BASARILI sonra HATIRLATMA: pozitif yol KORUNUR', async () => {
    providerMode = 'ok';
    const created: any = await send();

    const reminded: any = await service.sendReminder(tenantId, created.id, {
      ...actor,
      userId,
      tenantId,
    } as any);
    expect(reminded).toBeDefined();

    const row = await prisma.clientInfoRequest.findUniqueOrThrow({
      where: { id: created.id },
      select: { reminderCount: true, reminderSentAt: true },
    });
    expect(row.reminderCount).toBe(1);
    expect(row.reminderSentAt).not.toBeNull();
  });
});
