/**
 * D-3b GUVENLIK REGRESYONU — INTAKE TOKEN SIZINTISI (gercek PostgreSQL).
 *
 * KUSUR (duzeltme oncesi): bilgi talebi e-postasinin GOVDESI intake baglantisiyla (ham token
 * tasiyan URL) uretiliyor, AYNI govde `ClientInfoRequest.emailBody` olarak DB'ye yaziliyor ve
 * create yaniti `...request` ile bu alani geri donduruyordu; liste/detay uclari da ayni alani
 * okuyordu. Sonuc: KULLANILABILIR token uygulama DB'sinde ve API yanitlarinda.
 *
 * Bu suite MOCK KAYIT KULLANMAZ: gercek PostgreSQL'e yazar ve YAZILAN alani geri okur. Sabit
 * kayit donduren bir mock bu kusuru YAKALAYAMAZDI (nitekim ilk mock tabanli suite kaciridi).
 * E-posta saglayicisi sahtedir; gercek aliciya gonderim YOKTUR.
 *
 * Beklenen (duzeltme sonrasi):
 *  - DB'deki `emailBody` ham token/URL TASIMAZ; ama "guvenli form baglantisi" bilgisi kaybolmaz.
 *  - create yaniti, liste ve detay yanitlari ham token/URL TASIMAZ.
 *  - Saglayiciya giden govde baglantiyi TASIR (islev korunur).
 *  - Audit metadata yalniz `intakeLinkId` tasir.
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
import { INTAKE_URL_REDACTED } from '../client-info-request-redaction';

const TEST_DATABASE_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DATABASE_URL) {
  throw new Error('INFO_REQUEST_TOKEN_LEAK_TEST_DATABASE_REQUIRED');
}
const describeWithDatabase = TEST_DATABASE_URL ? describe : describe.skip;

/** Gercek token uzunlugunda, ayirt edilebilir sahte token. */
const RAW_TOKEN = 'TOKEN-LEAK-PROBE-abcdefghijklmnopqrstuvwx';
const INTAKE_URL = `https://portal.example.test/intake/${RAW_TOKEN}`;

describeWithDatabase('D-3b guvenlik: intake token DB/yanit/audit sizintisi (gercek PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let service: ClientInfoRequestService;
  let sent: Array<{ to: string; subject: string; text: string; html?: string }>;
  let auditCalls: any[];
  let tenantId: string;
  let clientId: string;
  let caseId: string;
  let debtorId: string;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    sent = [];
    auditCalls = [];
    const sfx = randomUUID().slice(0, 8);

    const tenant = await prisma.tenant.create({
      data: { name: `TokenLeak ${sfx}`, slug: `token-leak-${sfx}` },
      select: { id: true },
    });
    tenantId = tenant.id;

    const user = await prisma.user.create({
      data: { tenantId, email: `leak-${sfx}@test.invalid`, passwordHash: 'x'.repeat(20), name: 'Leak', surname: 'Probe', role: 'ADMIN' },
      select: { id: true },
    });
    userId = user.id;

    const client = await prisma.client.create({
      data: {
        tenantId,
        type: 'INDIVIDUAL',
        firstName: 'Leak',
        lastName: 'Probe',
        displayName: 'Leak Probe',
        name: 'Leak Probe',
        email: 'muvekkil@test.invalid',
        isActive: true,
      },
      select: { id: true },
    });
    clientId = client.id;

    const kase = await prisma.case.create({
      data: { tenantId, fileNumber: `LEAK-${sfx}`, type: 'GENERAL_EXECUTION', clientId, caseStatus: 'DERDEST' },
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

    const prismaService = prisma as unknown as PrismaService;
    const emailProvider = {
      send: jest.fn(async (payload: any) => {
        sent.push(payload);
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
    // Intake link servisi: GERCEK URL/token uretimi taklit edilir (link kaydi bu suite'in konusu
    // degil; olculen sey govdenin nereye yazildigi).
    const intakeLink = {
      createForClientWorkspace: jest.fn(async () => ({
        link: { id: `link-${randomUUID().slice(0, 8)}`, expiresAt: null },
        rawToken: RAW_TOKEN,
        intakeUrl: INTAKE_URL,
      })),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ClientInfoRequestService,
        { provide: PrismaService, useValue: prismaService },
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

  async function createWithLink() {
    return service.createRequest(
      tenantId,
      { caseId, clientId, debtorId, emailTo: 'muvekkil@test.invalid', attachIntakeLink: true } as any,
      { ...actor, userId, tenantId },
    );
  }

  it('KALICI KAYIT: DB\'ye yazilan emailBody ham token/URL TASIMAZ (yazilan alan geri okunur)', async () => {
    const created: any = await createWithLink();

    // Mock degil: kaydi DB'den GERI OKU.
    const row = await prisma.clientInfoRequest.findUniqueOrThrow({
      where: { id: created.id },
      select: { id: true, emailBody: true, emailSubject: true },
    });

    expect(row.emailBody).not.toContain(RAW_TOKEN);
    expect(row.emailBody).not.toContain(INTAKE_URL);
    expect(row.emailBody).not.toContain('/intake/');
    // Islev kaybolmaz: talep metninin kendisi durur.
    expect(row.emailBody).toContain('Borçlu');
    expect(row.emailSubject).not.toContain(RAW_TOKEN);
  });

  it('SAGLAYICI: gonderilen govde baglantiyi TASIR (islev korunur)', async () => {
    await createWithLink();
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain(INTAKE_URL);
    expect(sent[0].html).toContain(INTAKE_URL);
  });

  it('CREATE YANITI: ham token/URL DONMEZ; yalniz intakeLinkId doner', async () => {
    const created: any = await createWithLink();
    const serialized = JSON.stringify(created);
    expect(serialized).not.toContain(RAW_TOKEN);
    expect(serialized).not.toContain(INTAKE_URL);
    expect(created.intakeLinkId).toMatch(/^link-/);
  });

  it('LISTE YOLU: ham token/URL DONMEZ', async () => {
    await createWithLink();
    const rows: any[] = await service.getRequestsForCase(tenantId, caseId);
    expect(rows).toHaveLength(1);
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(RAW_TOKEN);
    expect(serialized).not.toContain(INTAKE_URL);
  });

  it('DETAY YOLU: ham token/URL DONMEZ', async () => {
    const created: any = await createWithLink();
    const detail: any = await service.getRequest(tenantId, created.id);
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain(RAW_TOKEN);
    expect(serialized).not.toContain(INTAKE_URL);
  });

  it('SAVUNMA KATMANI: duzeltme ONCESI yazilmis (token tasiyan) kayit da redakte donuyor', async () => {
    const created: any = await createWithLink();
    // Duzeltme oncesi durumu birebir taklit et: gövdeye kullanilabilir baglanti YAZ.
    await prisma.clientInfoRequest.update({
      where: { id: created.id },
      data: { emailBody: `Eski kayit\n\nBaglanti: ${INTAKE_URL}\n\nSaygilarimizla` },
    });

    const detail: any = await service.getRequest(tenantId, created.id);
    expect(JSON.stringify(detail)).not.toContain(RAW_TOKEN);
    expect(detail.emailBody).toContain(INTAKE_URL_REDACTED);

    const rows: any[] = await service.getRequestsForCase(tenantId, caseId);
    expect(JSON.stringify(rows)).not.toContain(RAW_TOKEN);
  });

  it('AUDIT ve YAN KAYITLAR: ham token/URL TASIMAZ', async () => {
    await createWithLink();
    expect(JSON.stringify(auditCalls)).not.toContain(RAW_TOKEN);
    expect(auditCalls[0].metadata).toMatchObject({ commandType: 'INFO_REQUEST_SEND' });
    expect(auditCalls[0].metadata.intakeLinkId).toMatch(/^link-/);

    const notifications = await prisma.clientNotification.findMany({ where: { tenantId }, select: { subject: true, body: true } });
    expect(JSON.stringify(notifications)).not.toContain(RAW_TOKEN);
    const auditRows = await prisma.addressAuditLog.findMany({ where: { tenantId }, select: { details: true, noteText: true } });
    expect(JSON.stringify(auditRows)).not.toContain(RAW_TOKEN);
  });

  it('BAGLANTISIZ talep: davranis DEGISMEDI (govde ayni, baglanti yok)', async () => {
    const created: any = await service.createRequest(
      tenantId,
      { caseId, clientId, debtorId, emailTo: 'muvekkil@test.invalid' } as any,
      { ...actor, userId, tenantId },
    );
    const row = await prisma.clientInfoRequest.findUniqueOrThrow({ where: { id: created.id }, select: { emailBody: true } });
    expect(row.emailBody).toContain('Bilgilerinizi bu e-postaya yanıt olarak iletebilirsiniz.');
    expect(sent[0].text).toBe(row.emailBody);
    expect(created.intakeLinkId).toBeUndefined();
  });
});
