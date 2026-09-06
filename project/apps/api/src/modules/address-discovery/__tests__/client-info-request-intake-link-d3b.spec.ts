/**
 * D-3b ("Yol1", owner GO 2026-09-06) — BILGI TALEBI ↔ INTAKE ALTYAPISI BAGLANTISI.
 *
 * Owner talimati: "Bilgi talebine mevcut intake altyapisiyla baglanti ekle. Tenant/muvekkil/dosya
 * bagi, token sure/iptal/tekrar kullanim sozlesmesi ve review≠promotion ayrimi korunsun."
 *
 * Uygulanan davranis:
 *   - OPT-IN: `attachIntakeLink` verilmezse mevcut davranis (serbest metin yaniti) AYNEN kalir.
 *   - Link uretimi mevcut `ClientIntakeLinkService.createForClientWorkspace` ile yapilir; bu servis
 *     tenant/muvekkil/dosya sinirini, token hash'ini ve sure/iptal/tekrar-kullanim sozlesmesini
 *     kendi icinde uygular — BU SERVIS YENI SOZLESME URETMEZ.
 *   - Varsayilan kapsam bilgi talebinin dogal kapsamidir: ADDRESS + CONTACT (cagiran degistirebilir).
 *   - Ham token / form URL'i YALNIZ e-postaya girer; yanit govdesine, audit'e ve loga YAZILMAZ
 *     (yalniz `intakeLinkId`).
 *   - Otomatik (SISTEM) dosya-olusturma yolu aktor tasimaz → link URETMEZ; istemci bu yolu
 *     kullanarak yetki kapisini ASAMAZ.
 *   - review ≠ promotion: bu teslim intake review/promote yollarina DOKUNMAZ.
 *
 * Kanit sinifi: servis birim testleri (Prisma, e-posta saglayicisi ve intake servisi mock'lu);
 * gercek HTTP/DB/SMTP E2E DEGILDIR ve gercek aliciya e-posta GONDERILMEZ.
 */
import { ServiceUnavailableException } from '@nestjs/common';
import { ClientIntakeFieldCategory } from '@prisma/client';
import { ClientInfoRequestService } from '../client-info-request.service';
import {
  generateClientInfoEmailHtml,
  generateClientInfoEmailText,
} from '../templates/client-info-email.template';

type AnyRecord = Record<string, any>;

const TENANT = 'tenant-1';
const CLIENT_ID = 'client-1';
const CASE_ID = 'case-1';
const INTAKE_URL = 'https://portal.example.test/intake/RAW-TOKEN-XYZ';

const ADMIN = { userId: 'user-1', tenantId: TENANT, role: 'ADMIN' };
const DTO_BASE = { caseId: CASE_ID, clientId: CLIENT_ID, emailTo: 'muvekkil@example.test' } as any;

function buildHarness(opts: { emailOk?: boolean; expiresAt?: Date | null } = {}) {
  const { emailOk = true, expiresAt = null } = opts;
  const prisma: AnyRecord = {
    case: {
      findFirst: jest.fn().mockResolvedValue({
        id: CASE_ID,
        fileNumber: '2026/1',
        client: { id: CLIENT_ID, displayName: 'Muvekkil' },
        lawyers: [],
        debtors: [{ debtor: { id: 'debtor-1', name: 'Borclu', identityNo: '11111111111' } }],
      }),
      findUnique: jest.fn().mockResolvedValue({
        caseClients: [{ client: { id: CLIENT_ID, displayName: 'Muvekkil', email: 'muvekkil@example.test', contacts: [] } }],
        debtors: [{ debtor: { id: 'debtor-1', name: 'Borclu' } }],
      }),
    },
    client: { findFirst: jest.fn().mockResolvedValue({ id: CLIENT_ID, displayName: 'Muvekkil', email: 'muvekkil@example.test' }) },
    office: { findFirst: jest.fn().mockResolvedValue({ name: 'Buro' }) },
    clientInfoRequest: {
      create: jest.fn().mockResolvedValue({ id: 'req-1', clientId: CLIENT_ID, caseId: CASE_ID }),
      delete: jest.fn().mockResolvedValue({}),
    },
    clientNotification: { create: jest.fn().mockResolvedValue({}) },
    addressAuditLog: { create: jest.fn().mockResolvedValue({}) },
    tenant: { findUnique: jest.fn().mockResolvedValue({ settings: {} }) },
  };
  const emailProvider: AnyRecord = {
    send: jest.fn().mockResolvedValue(emailOk ? { success: true } : { success: false, errorMessage: 'smtp down' }),
  };
  const audit: AnyRecord = { log: jest.fn().mockResolvedValue(undefined) };
  const officeApproval: AnyRecord = { isApproverEligible: jest.fn().mockResolvedValue(true) };
  const intakeLink: AnyRecord = {
    createForClientWorkspace: jest.fn().mockResolvedValue({
      link: { id: 'link-1', expiresAt },
      rawToken: 'RAW-TOKEN-XYZ',
      intakeUrl: INTAKE_URL,
    }),
  };
  const service = new ClientInfoRequestService(
    prisma as any,
    emailProvider as any,
    audit as any,
    officeApproval as any,
    intakeLink as any,
  );
  return { service, prisma, emailProvider, audit, officeApproval, intakeLink };
}

describe('D-3b — opt-in: varsayilan davranis DEGISMEZ', () => {
  it('attachIntakeLink verilmezse link URETILMEZ ve e-posta serbest-metin yonergesi tasir', async () => {
    const h = buildHarness();
    await h.service.createRequest(TENANT, DTO_BASE, ADMIN);
    expect(h.intakeLink.createForClientWorkspace).not.toHaveBeenCalled();
    const sent = h.emailProvider.send.mock.calls[0][0];
    expect(sent.text).toContain('Bilgilerinizi bu e-postaya yanıt olarak iletebilirsiniz.');
    expect(sent.text).not.toContain('güvenli formumuz');
  });

  it('attachIntakeLink:false acikca verilirse de link URETILMEZ', async () => {
    const h = buildHarness();
    await h.service.createRequest(TENANT, { ...DTO_BASE, attachIntakeLink: false }, ADMIN);
    expect(h.intakeLink.createForClientWorkspace).not.toHaveBeenCalled();
  });
});

describe('D-3b — baglanti uretimi mevcut intake sozlesmesini TUKETIR', () => {
  it('tenant/muvekkil/dosya bagi ve aktor ile cagrilir; varsayilan kapsam ADDRESS + CONTACT', async () => {
    const h = buildHarness();
    await h.service.createRequest(TENANT, { ...DTO_BASE, attachIntakeLink: true }, ADMIN);

    expect(h.intakeLink.createForClientWorkspace).toHaveBeenCalledTimes(1);
    const [tenantId, clientId, caseId, userId, dto] = h.intakeLink.createForClientWorkspace.mock.calls[0];
    expect(tenantId).toBe(TENANT);
    expect(clientId).toBe(CLIENT_ID);
    expect(caseId).toBe(CASE_ID);
    expect(userId).toBe('user-1'); // link createdById = gercek aktor
    expect(dto.scope).toEqual([ClientIntakeFieldCategory.ADDRESS, ClientIntakeFieldCategory.CONTACT]);
  });

  it('cagiran kapsam/sure/kullanim verirse AYNEN intake servisine gecer (sozlesme burada URETILMEZ)', async () => {
    const h = buildHarness();
    await h.service.createRequest(
      TENANT,
      {
        ...DTO_BASE,
        attachIntakeLink: true,
        intakeScope: [ClientIntakeFieldCategory.ASSET],
        intakeExpiresAt: '2026-12-31T00:00:00.000Z',
        intakeMaxUses: 3,
      },
      ADMIN,
    );
    const dto = h.intakeLink.createForClientWorkspace.mock.calls[0][4];
    expect(dto).toEqual({
      scope: [ClientIntakeFieldCategory.ASSET],
      expiresAt: '2026-12-31T00:00:00.000Z',
      maxUses: 3,
    });
  });

  it('YOL1 URUN KARARI: sure verilmezse baglanti 7 GUN gecerlidir (suresiz DEGIL)', async () => {
    const h = buildHarness();
    const before = Date.now();
    await h.service.createRequest(TENANT, { ...DTO_BASE, attachIntakeLink: true }, ADMIN);
    const dto = h.intakeLink.createForClientWorkspace.mock.calls[0][4];

    expect(typeof dto.expiresAt).toBe('string');
    const deltaDays = (new Date(dto.expiresAt).getTime() - before) / (24 * 60 * 60 * 1000);
    expect(deltaDays).toBeGreaterThan(6.9);
    expect(deltaDays).toBeLessThan(7.1);
  });

  it('YOL1 KULLANILABILIRLIGI: cagiran KENDI govdesini yazsa da baglanti e-postaya GIRER', async () => {
    const h = buildHarness({ expiresAt: new Date('2026-10-15T00:00:00.000Z') });
    const customBody = 'Sayin muvekkilimiz, borclunun adresini bize iletir misiniz?';
    await h.service.createRequest(
      TENANT,
      { ...DTO_BASE, attachIntakeLink: true, emailBody: customBody },
      ADMIN,
    );

    // Saglayiciya giden metin: kullanicinin mesaji + baglanti blogu.
    const sent = h.emailProvider.send.mock.calls[0][0];
    expect(sent.text).toContain(customBody);
    expect(sent.text).toContain(INTAKE_URL);
    expect(sent.text).toContain('15.10.2026');

    // KALICI govde: kullanicinin mesaji AYNEN, baglanti YOK.
    const persisted = h.prisma.clientInfoRequest.create.mock.calls[0][0].data.emailBody;
    expect(persisted).toBe(customBody);
    expect(persisted).not.toContain(INTAKE_URL);
  });

  it('cagiran govdesi VARSA ve baglanti ISTENMEDIYSE metin AYNEN kalir', async () => {
    const h = buildHarness();
    const customBody = 'Kendi mesajim';
    await h.service.createRequest(TENANT, { ...DTO_BASE, emailBody: customBody }, ADMIN);
    const sent = h.emailProvider.send.mock.calls[0][0];
    expect(sent.text).toBe(customBody);
  });

  it('uretilen URL e-postaya girer; son gecerlilik tarihi gosterilir', async () => {
    const h = buildHarness({ expiresAt: new Date('2026-10-15T00:00:00.000Z') });
    await h.service.createRequest(TENANT, { ...DTO_BASE, attachIntakeLink: true }, ADMIN);
    const sent = h.emailProvider.send.mock.calls[0][0];
    expect(sent.text).toContain(INTAKE_URL);
    expect(sent.text).toContain('güvenli formumuz');
    expect(sent.text).toContain('15.10.2026');
    expect(sent.html).toContain(INTAKE_URL);
  });
});

describe('D-3b — ham token/URL sizmaz (yanit, audit, DB kaydi)', () => {
  it('yanit govdesi yalniz link KIMLIGINI tasir; ham token/URL YOK', async () => {
    const h = buildHarness();
    const res: any = await h.service.createRequest(TENANT, { ...DTO_BASE, attachIntakeLink: true }, ADMIN);
    expect(res.intakeLinkId).toBe('link-1');
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain('RAW-TOKEN-XYZ');
    expect(serialized).not.toContain(INTAKE_URL);
  });

  it('audit metadata link kimligini tasir, ham token/URL TASIMAZ', async () => {
    const h = buildHarness();
    await h.service.createRequest(TENANT, { ...DTO_BASE, attachIntakeLink: true }, ADMIN);
    const auditCall = h.audit.log.mock.calls[0][0];
    expect(auditCall.metadata).toMatchObject({ commandType: 'INFO_REQUEST_SEND', intakeLinkId: 'link-1' });
    const serialized = JSON.stringify(auditCall);
    expect(serialized).not.toContain('RAW-TOKEN-XYZ');
    expect(serialized).not.toContain(INTAKE_URL);
  });

  it('baglanti YOKSA audit intakeLinkId null tasir', async () => {
    const h = buildHarness();
    await h.service.createRequest(TENANT, DTO_BASE, ADMIN);
    expect(h.audit.log.mock.calls[0][0].metadata.intakeLinkId).toBeNull();
  });
});

describe('D-3b — yetki ve SISTEM yolu: kapi ASILAMAZ', () => {
  it('VIEWER: yetki reddi link uretiminden ONCE gelir (intake servisi HIC cagrilmaz)', async () => {
    const h = buildHarness();
    h.officeApproval.isApproverEligible.mockResolvedValue(false);
    await expect(
      h.service.createRequest(TENANT, { ...DTO_BASE, attachIntakeLink: true }, { ...ADMIN, role: 'VIEWER' }),
    ).rejects.toBeTruthy();
    expect(h.intakeLink.createForClientWorkspace).not.toHaveBeenCalled();
    expect(h.emailProvider.send).not.toHaveBeenCalled();
  });

  it('otomatik SISTEM yolu aktor tasimaz → attachIntakeLink istense bile link URETILMEZ', async () => {
    const h = buildHarness();
    // Sistem yolu DTO'yu kendisi kurar (attachIntakeLink gondermez); yine de savunma olarak
    // aktorsuz cagri link uretmemelidir.
    await (h.service as any).createRequestUnchecked(TENANT, { ...DTO_BASE, attachIntakeLink: true }, null);
    expect(h.intakeLink.createForClientWorkspace).not.toHaveBeenCalled();
    expect(h.emailProvider.send).toHaveBeenCalledTimes(1);
  });

  it('sendAutoRequestOnCaseCreate link URETMEZ (mevcut otomatik davranis korunur)', async () => {
    const h = buildHarness();
    await h.service.sendAutoRequestOnCaseCreate(TENANT, CASE_ID);
    expect(h.intakeLink.createForClientWorkspace).not.toHaveBeenCalled();
    expect(h.emailProvider.send).toHaveBeenCalledTimes(1);
  });
});

describe('D-3b — saglayici basarisizligi: baglanti uretilse bile gonderim KAYDEDILMEZ', () => {
  it('e-posta basarisiz -> talep kaydi HIC OLUSMAZ, 503, audit YOK (baglanti uretilmis olsa bile)', async () => {
    const h = buildHarness({ emailOk: false });
    await expect(
      h.service.createRequest(TENANT, { ...DTO_BASE, attachIntakeLink: true }, ADMIN),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    // GONDERIM-SONRA-YAZ: kayit yazilmadigi icin geri-alma da YOK.
    expect(h.prisma.clientInfoRequest.create).not.toHaveBeenCalled();
    expect(h.prisma.clientInfoRequest.delete).not.toHaveBeenCalled();
    expect(h.audit.log).not.toHaveBeenCalled();
    // Baglanti gonderimden ONCE uretilir (govdeye girer); basarisiz gonderimde kullanilmadan
    // kalir ve kendi suresi (7 gun) dolar — token yalniz e-postada oldugu icin erisilemez.
    expect(h.intakeLink.createForClientWorkspace).toHaveBeenCalledTimes(1);
  });
});

describe('D-3b — sablon sozlesmesi (saf)', () => {
  const base = {
    clientName: 'Muvekkil',
    debtorName: 'Borclu',
    caseNumber: '2026/1',
    lawyerName: 'Av. X',
    firmName: 'Buro',
  };

  it('intakeUrl yoksa metin ve HTML onceki yonergeyi tasir', () => {
    expect(generateClientInfoEmailText(base)).toContain('Bilgilerinizi bu e-postaya yanıt olarak iletebilirsiniz.');
    expect(generateClientInfoEmailHtml(base)).toContain('Bilgilerinizi bu e-postaya yanıt olarak iletebilirsiniz.');
  });

  it('intakeUrl varsa baglanti gosterilir ve serbest-metin secenegi KORUNUR', () => {
    const text = generateClientInfoEmailText({ ...base, intakeUrl: INTAKE_URL });
    expect(text).toContain(INTAKE_URL);
    expect(text).toContain('Dilerseniz bu e-postaya yanıt olarak da iletebilirsiniz.');
    const html = generateClientInfoEmailHtml({ ...base, intakeUrl: INTAKE_URL });
    expect(html).toContain(`href="${INTAKE_URL}"`);
  });

  it('gecersiz/eksik tarih blogu bozmaz', () => {
    const text = generateClientInfoEmailText({ ...base, intakeUrl: INTAKE_URL, intakeExpiresAt: 'gecersiz' });
    expect(text).toContain(INTAKE_URL);
    expect(text).not.toContain('tarihine kadar geçerlidir');
  });
});
