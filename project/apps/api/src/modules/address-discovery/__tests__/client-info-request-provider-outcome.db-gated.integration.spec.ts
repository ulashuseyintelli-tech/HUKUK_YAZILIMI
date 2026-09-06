/**
 * SAGLAYICI SONUCUNUN TALEP SERVISINE DOGRU TASINMASI (gercek `EmailProviderService`, gercek PostgreSQL).
 *
 * KUSUR: `EmailProviderService`'in SMTP/SendGrid/SES yollari istisnalari YAKALAYIP
 * `success:false` donduruyor (SendGrid timeout'u `errorCode:'NETWORK_ERROR'` ile). Talep servisi
 * ise `success:false`'in TAMAMINI kesin basarisizlik sayiyordu; "iletilmis olabilir" ayrimi yalniz
 * saglayici DISARI istisna firlatirsa calisiyordu. Onceki regresyon testi saglayici katmanini
 * tumuyle taklit edip dogrudan istisna firlattigi icin bu yanlis siniflandirmayi YAKALAMIYORDU.
 *
 * Bu suite `EmailProviderService`'i MOCK'LAMAZ: gercek servis kosar, yalniz DIS TASIMA cagrisi
 * (SendGrid icin `fetch`, SMTP icin `nodemailer`) test katmaninda kontrollu sekilde basarisiz
 * kilinir. Gercek aliciya gonderim YOKTUR.
 *
 * Beklenen:
 *  - HTTP yaniti alinan ret (400)      → KESIN ret  → `CLIENT_INFO_REQUEST_EMAIL_FAILED`
 *  - Yanit kaybi / timeout (abort)     → BELIRSIZ   → `CLIENT_INFO_REQUEST_EMAIL_INDETERMINATE`
 *  - Baglanti hic kurulmadi (ECONNREFUSED) → KESIN ret → `..._EMAIL_FAILED`
 *  - Kabul (202)                       → kayit yazilir
 * Basarisiz ve belirsiz sonuclarin HICBIRI kalici `SENT` kaydi olusturmaz; belirsizlikte
 * saglayiciya IKINCI cagri yapilmaz.
 */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
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
  throw new Error('INFO_REQUEST_PROVIDER_OUTCOME_TEST_DATABASE_REQUIRED');
}
const describeWithDatabase = TEST_DATABASE_URL ? describe : describe.skip;

/** SendGrid yapilandirmasi — gercek servis bu degerlerle `fetch` yolunu secer. */
const SENDGRID_CONFIG: Record<string, string> = {
  EMAIL_PROVIDER: 'sendgrid',
  SENDGRID_API_KEY: 'SG.test-key-not-real',
  EMAIL_FROM: 'noreply@test.invalid',
  EMAIL_FROM_NAME: 'Test Buro',
};

function abortError(): Error {
  const e = new Error('The operation was aborted');
  e.name = 'AbortError';
  return e;
}

function connRefused(): Error {
  const e: any = new Error('fetch failed');
  e.cause = { code: 'ECONNREFUSED' };
  return e;
}

describeWithDatabase('Saglayici sonucu → talep servisi (gercek EmailProviderService, gercek PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let service: ClientInfoRequestService;
  let emailProvider: EmailProviderService;
  let tenantId: string;
  let clientId: string;
  let caseId: string;
  let debtorId: string;
  let userId: string;
  let fetchCalls: number;
  let auditCalls: any[];

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    fetchCalls = 0;
    auditCalls = [];
    const sfx = randomUUID().slice(0, 8);

    const tenant = await prisma.tenant.create({
      data: { name: `ProvOutcome ${sfx}`, slug: `prov-outcome-${sfx}` },
      select: { id: true },
    });
    tenantId = tenant.id;

    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `prov-${sfx}@test.invalid`,
        passwordHash: 'x'.repeat(20),
        name: 'Prov',
        surname: 'Outcome',
        role: 'ADMIN',
      },
      select: { id: true },
    });
    userId = user.id;

    const client = await prisma.client.create({
      data: {
        tenantId,
        type: 'INDIVIDUAL',
        firstName: 'Saglayici',
        lastName: 'Probe',
        displayName: 'Saglayici Probe',
        name: 'Saglayici Probe',
        email: 'muvekkil@test.invalid',
        isActive: true,
      },
      select: { id: true },
    });
    clientId = client.id;

    const kase = await prisma.case.create({
      data: { tenantId, fileNumber: `PROV-${sfx}`, type: 'GENERAL_EXECUTION', clientId, caseStatus: 'DERDEST' },
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

    const audit = {
      log: jest.fn(async (input: any) => {
        auditCalls.push(input);
      }),
      logInTransaction: jest.fn(),
    };
    const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(true) };
    const intakeLink = { createForClientWorkspace: jest.fn() };
    const config = { get: jest.fn((key: string) => SENDGRID_CONFIG[key]) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ClientInfoRequestService,
        // GERCEK saglayici servisi — taklit EDILMEZ.
        EmailProviderService,
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: prisma as unknown as PrismaService },
        { provide: AuditService, useValue: audit },
        { provide: OfficeApprovalService, useValue: officeApproval },
        { provide: ClientIntakeLinkService, useValue: intakeLink },
      ],
    }).compile();
    service = moduleRef.get(ClientInfoRequestService);
    emailProvider = moduleRef.get(EmailProviderService);
    expect(emailProvider.providerName).toBe('sendgrid'); // gercek yol secildi
  });

  afterEach(async () => {
    (global as any).fetch = undefined;
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

  /** Dis tasima cagrisini (SendGrid HTTP) kontrollu kilar. */
  function stubTransport(behaviour: () => any) {
    (global as any).fetch = jest.fn(async () => {
      fetchCalls += 1;
      return behaviour();
    });
  }

  const send = () =>
    service.createRequest(
      tenantId,
      { caseId, clientId, debtorId, emailTo: 'muvekkil@test.invalid' } as any,
      { userId, tenantId, role: 'ADMIN' } as any,
    );

  const persisted = () =>
    prisma.clientInfoRequest.findMany({ where: { tenantId }, select: { id: true, status: true } });

  it('KABUL (202): kayit yazilir ve saglayici GERCEKTEN cagrildi', async () => {
    stubTransport(() => ({
      ok: true,
      status: 202,
      headers: { get: () => 'msg-1' },
      json: async () => ({}),
    }));

    const created: any = await send();

    expect(fetchCalls).toBe(1);
    const rows = await persisted();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(created.id);
    expect(rows[0].status).toBe('SENT');
  });

  it('KESIN RET (HTTP 400 yaniti alindi): EMAIL_FAILED, kayit YOK', async () => {
    stubTransport(() => ({
      ok: false,
      status: 400,
      headers: { get: () => null },
      json: async () => ({ errors: [{ message: 'Bad Request' }] }),
    }));

    await expect(send()).rejects.toMatchObject({
      response: { reasonCode: 'CLIENT_INFO_REQUEST_EMAIL_FAILED' },
    });
    expect(await persisted()).toHaveLength(0);
    expect(fetchCalls).toBe(1);
    expect(auditCalls).toHaveLength(0);
  });

  it('BELIRSIZ (timeout/abort — yanit KAYBOLDU): INDETERMINATE, kayit YOK, IKINCI cagri YOK', async () => {
    stubTransport(() => {
      throw abortError();
    });

    let caught: any;
    try {
      await send();
      throw new Error('BEKLENEN HATA ATILMADI');
    } catch (e: any) {
      caught = e;
    }
    const body = caught?.response ?? {};

    // KRITIK: gercek saglayici bu durumda `success:false` + `NETWORK_ERROR` doner.
    // Eski kod bunu KESIN RET sayiyor ve kullaniciya "gonderilemedi" diyordu.
    expect(body.reasonCode).toBe('CLIENT_INFO_REQUEST_EMAIL_INDETERMINATE');
    expect(body.message).toMatch(/DOĞRULANAMADI/);
    expect(body.message).toMatch(/iletilmiş olabilir/);
    expect(await persisted()).toHaveLength(0);
    expect(fetchCalls).toBe(1); // kor otomatik tekrar gonderim YOK
    expect(auditCalls).toHaveLength(0);
  });

  it('BAGLANTI HIC KURULMADI (ECONNREFUSED): KESIN ret olarak siniflanir', async () => {
    stubTransport(() => {
      throw connRefused();
    });

    await expect(send()).rejects.toMatchObject({
      response: { reasonCode: 'CLIENT_INFO_REQUEST_EMAIL_FAILED' },
    });
    expect(await persisted()).toHaveLength(0);
    expect(fetchCalls).toBe(1);
  });

  it('SAGLAYICI SOZLESMESI: `success` alani DEGISMEDI, kesinlik AYRI alanda', async () => {
    stubTransport(() => {
      throw abortError();
    });
    const timeoutResult = await emailProvider.send({ to: 'x@test.invalid', subject: 's', text: 't' });
    expect(timeoutResult.success).toBe(false); // mevcut sozlesme KORUNDU
    expect(timeoutResult.errorCode).toBe('NETWORK_ERROR');
    expect(timeoutResult.deliveryOutcome).toBe('INDETERMINATE');

    stubTransport(() => ({ ok: false, status: 400, headers: { get: () => null }, json: async () => ({}) }));
    const rejectResult = await emailProvider.send({ to: 'x@test.invalid', subject: 's', text: 't' });
    expect(rejectResult.success).toBe(false);
    expect(rejectResult.deliveryOutcome).toBe('REJECTED');

    stubTransport(() => ({ ok: true, status: 202, headers: { get: () => 'm' }, json: async () => ({}) }));
    const okResult = await emailProvider.send({ to: 'x@test.invalid', subject: 's', text: 't' });
    expect(okResult.success).toBe(true);
    expect(okResult.deliveryOutcome).toBe('ACCEPTED');
  });

  it('GECERSIZ ADRES: tasima cagrisi YAPILMAZ ve KESIN ret doner', async () => {
    stubTransport(() => ({ ok: true, status: 202, headers: { get: () => 'm' }, json: async () => ({}) }));
    const result = await emailProvider.send({ to: 'gecersiz-adres', subject: 's', text: 't' });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_EMAIL');
    expect(result.deliveryOutcome).toBe('REJECTED');
    expect(fetchCalls).toBe(0);
  });
});
