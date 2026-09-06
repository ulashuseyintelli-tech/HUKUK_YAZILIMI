/**
 * BILGI TALEBI GONDERIM BASARISIZLIGI — BIRLESIK HATA DURUMU REGRESYONU (gercek PostgreSQL).
 *
 * KUSUR (duzeltme oncesi):
 *  - Talep kaydi `status: 'SENT'` olarak saglayici cagrisindan ONCE yaziliyordu.
 *  - Gonderim basarisiz olunca kayit siliniyordu, ama silme hatasi YUTULUYORDU
 *    (`.catch(() => {})`). Silme basarisiz oldugunda DB'de `SENT` satiri KALIRKEN kullaniciya
 *    "kayit olusturulmadi" deniyordu → **kalici durum ile hata mesaji CELISIYORDU.**
 *  - Saglayici istisna atarsa (sonuc BELIRSIZ) cagri yukari kacip kaydi da geride birakiyordu.
 *
 * Bu suite gercek PostgreSQL'e yazar ve kalici durumu GERI OKUR. E-posta saglayicisi sahtedir;
 * gercek aliciya gonderim YOKTUR.
 *
 * Beklenen (duzeltme sonrasi):
 *  - Basarisiz gonderim + temizlik BASARILI → kayit YOK, mesaj "kayit olusturulmadi".
 *  - Basarisiz gonderim + temizlik BASARISIZ → kayit KALIR, mesaj bunu SOYLER ve `requestId`
 *    verir; "kayit olusturulmadi" DENMEZ (mesaj kalici durumla celismez).
 *  - Belirsiz sonuc (saglayici istisnasi) BASARILI SAYILMAZ.
 *  - Basarili gonderim yolu DEGISMEZ.
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
  throw new Error('INFO_REQUEST_SEND_FAILURE_TEST_DATABASE_REQUIRED');
}
const describeWithDatabase = TEST_DATABASE_URL ? describe : describe.skip;

describeWithDatabase('D-3a gonderim basarisizligi: birlesik hata durumu (gercek PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let service: ClientInfoRequestService;
  let tenantId: string;
  let clientId: string;
  let caseId: string;
  let debtorId: string;
  let userId: string;

  /** Saglayici davranisi: 'ok' | 'fail' (success:false) | 'throw' (belirsiz sonuc). */
  let providerMode: 'ok' | 'fail' | 'throw';
  /** true ise `clientInfoRequest.delete` gercek bir DB hatasi gibi patlar (temizlik basarisiz). */
  let breakDelete: boolean;
  let auditCalls: any[];

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Gercek PrismaClient'i saran proxy: yalniz `clientInfoRequest.delete` kontrollu sekilde bozulur. */
  function buildPrismaProxy(): any {
    const infoRequestDelegate: any = new Proxy((prisma as any).clientInfoRequest, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop === 'delete' && typeof value === 'function') {
          return async (...args: any[]) => {
            if (breakDelete) {
              throw new Error('SIMULATED_DB_FAILURE: connection terminated during delete');
            }
            return value.apply(target, args);
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return new Proxy(prisma as any, {
      get(target, prop, receiver) {
        if (prop === 'clientInfoRequest') return infoRequestDelegate;
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  beforeEach(async () => {
    providerMode = 'ok';
    breakDelete = false;
    auditCalls = [];
    const sfx = randomUUID().slice(0, 8);

    const tenant = await prisma.tenant.create({
      data: { name: `SendFail ${sfx}`, slug: `send-fail-${sfx}` },
      select: { id: true },
    });
    tenantId = tenant.id;

    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `sendfail-${sfx}@test.invalid`,
        passwordHash: 'x'.repeat(20),
        name: 'Send',
        surname: 'Fail',
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
      data: { tenantId, fileNumber: `SENDFAIL-${sfx}`, type: 'GENERAL_EXECUTION', clientId, caseStatus: 'DERDEST' },
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
        if (providerMode === 'throw') throw new Error('SIMULATED_PROVIDER_TIMEOUT');
        if (providerMode === 'fail') return { success: false, errorMessage: 'SMTP 550 rejected' };
        return { success: true };
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

  const send = () =>
    service.createRequest(
      tenantId,
      { caseId, clientId, debtorId, emailTo: 'muvekkil@test.invalid' } as any,
      { userId, tenantId, role: 'ADMIN' } as any,
    );

  it('BASARISIZ GONDERIM + temizlik BASARILI: kayit YOK, mesaj kalici durumla TUTARLI', async () => {
    providerMode = 'fail';

    await expect(send()).rejects.toMatchObject({
      response: { reasonCode: 'CLIENT_INFO_REQUEST_EMAIL_FAILED' },
    });

    const rows = await prisma.clientInfoRequest.findMany({ where: { tenantId } });
    expect(rows).toHaveLength(0); // "kayit olusturulmadi" DOGRU
    // Basarisiz komut audit URETMEZ.
    expect(auditCalls).toHaveLength(0);
  });

  it('BIRLESIK HATA: gonderim basarisiz VE temizlik basarisiz → kayit KALIR, mesaj CELISMEZ', async () => {
    providerMode = 'fail';
    breakDelete = true;

    let caught: any;
    try {
      await send();
      throw new Error('BEKLENEN HATA ATILMADI');
    } catch (e: any) {
      caught = e;
    }

    const body = caught?.response ?? {};
    expect(body.reasonCode).toBe('CLIENT_INFO_REQUEST_EMAIL_FAILED_RECORD_RETAINED');
    expect(typeof body.requestId).toBe('string');
    // KRITIK: kalici durum ile mesaj CELISMEZ — "kayit olusturulmadi" DENMEZ.
    expect(body.message).not.toMatch(/kayıt oluşturulmadı/i);
    expect(body.message).toMatch(/KALDIRILAMADI/);

    // Kalici durum: kayit GERCEKTEN duruyor ve mesajin verdigi kimlikle bulunabiliyor.
    const rows = await prisma.clientInfoRequest.findMany({
      where: { tenantId },
      select: { id: true, status: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(body.requestId);
    expect(rows[0].status).toBe('SENT');
    expect(auditCalls).toHaveLength(0);
  });

  it('BELIRSIZ SONUC: saglayici istisnasi BASARILI SAYILMAZ', async () => {
    providerMode = 'throw';

    await expect(send()).rejects.toMatchObject({
      response: { reasonCode: 'CLIENT_INFO_REQUEST_EMAIL_FAILED' },
    });

    const rows = await prisma.clientInfoRequest.findMany({ where: { tenantId } });
    expect(rows).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });

  it('BASARILI GONDERIM: davranis DEGISMEDI (kayit SENT kalir, audit uretilir)', async () => {
    providerMode = 'ok';

    const created: any = await send();

    const rows = await prisma.clientInfoRequest.findMany({
      where: { tenantId },
      select: { id: true, status: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(created.id);
    expect(rows[0].status).toBe('SENT');
    expect(auditCalls.length).toBeGreaterThan(0);
  });
});
