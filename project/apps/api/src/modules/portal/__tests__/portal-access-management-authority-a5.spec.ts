/**
 * A5 — PORTAL ERİŞİM YÖNETİMİ YETKİ KAPISI (`createPortalUser` / `disablePortalUser`).
 *
 * ÖLÇÜLEN AÇIK (A1 envanteri, owner GO 2026-09-12): bu iki yol
 * `PortalService.assertCanManagePortalAccess` → `OfficeApprovalService.isApproverEligible`
 * kapısına tabidir, fakat **yetkisiz aktörün reddedildiği hiçbir spec'te İDDİA EDİLMEMİŞTİ**:
 * mevcut portal spec'lerinin tamamı `isApproverEligible`'ı `true` mock'lar (`portal-client-audit.spec.ts`
 * bunu açıkça yazar: "bu dosyanın odağı audit davranışı, capability DEĞİL") ve yalnız "aktör yok" dalı
 * test edilirdi. Yani kapı kaldırılsa mevcut testlerin hiçbiri düşmezdi.
 *
 * BU SPEC'İN SABİTLEDİĞİ:
 *  - yetkisiz aktör (`isApproverEligible=false`) → `ForbiddenException` ve **HİÇBİR YAZMA YOK**
 *    (transaction hiç açılmaz; portal kullanıcısı / müvekkil bayrağı / audit yazılmaz),
 *  - aktör hiç yoksa kapı **fail-closed**: yeterlilik DB'ye sorulmadan reddedilir,
 *  - kapı, kendisinden SONRA gelen okuma ve hesaplamalardan da önce gelir (e-posta çakışma probu
 *    yetkisiz aktörde hiç çalışmaz),
 *  - yetkili aktörde MEVCUT davranış aynen korunur (yazmalar + audit action'ları),
 *  - yeterlilik tam olarak `(actor.userId, tenantId)` ile sorgulanır.
 *
 * POLİTİKA DEĞİŞMEDİ: bu spec mevcut kuralı (PARTNER veya `canApproveOfficeActions`) yalnız SABİTLER;
 * `UserRole` elemesi gibi HENÜZ KARARI VERİLMEMİŞ konularda hiçbir beklenti üretmez (bkz. kayıt: B4/B5).
 */

import { ForbiddenException } from '@nestjs/common';
import { PortalService } from '../portal.service';

const TENANT = 't1';
const CLIENT_ID = 'c1';
const EMAIL = 'muvekkil@test.invalid';
const RAW_PASSWORD = 'CokGizliSifre!9988';
const ACTOR = { userId: 'u-1' };

function build(over: { eligible?: boolean; existingPortalUser?: any } = {}) {
  const currentClient = { id: CLIENT_ID, hasPortalAccess: false, portalUserId: null };
  const tx = {
    client: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...currentClient }),
      update: jest.fn().mockImplementation((a: any) => Promise.resolve({ ...currentClient, ...a.data, id: a.where.id })),
    },
    clientPortalUser: {
      create: jest.fn().mockImplementation((a: any) => Promise.resolve({ id: 'NEWPU', ...a.data })),
      update: jest.fn().mockImplementation((a: any) => Promise.resolve({ id: a.where.id, ...a.data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    client: { findFirst: jest.fn().mockResolvedValue({ id: CLIENT_ID, tenantId: TENANT, ...currentClient }) },
    clientPortalUser: {
      findFirst: jest.fn().mockResolvedValue(null), // e-posta çakışma probu
      findUnique: jest.fn().mockResolvedValue(over.existingPortalUser ?? null),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  const audit: any = { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn() };
  const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(over.eligible ?? true) };
  const svc = new PortalService(
    prisma as any,
    {} as any,
    audit as any,
    officeApproval as any,
    {} as any,
    {} as any,
  );
  return { svc, prisma, tx, audit, officeApproval };
}

/** Tek yerde toplanmış "hiçbir yazma olmadı" iddiası — iki yol için de aynı ölçüt. */
function expectNoWrite(h: ReturnType<typeof build>) {
  expect(h.prisma.$transaction).not.toHaveBeenCalled();
  expect(h.tx.clientPortalUser.create).not.toHaveBeenCalled();
  expect(h.tx.clientPortalUser.update).not.toHaveBeenCalled();
  expect(h.tx.clientPortalUser.updateMany).not.toHaveBeenCalled();
  expect(h.tx.client.update).not.toHaveBeenCalled();
  expect(h.audit.logInTransaction).not.toHaveBeenCalled();
  expect(h.audit.log).not.toHaveBeenCalled();
}

describe('A5 — createPortalUser yetki kapısı', () => {
  it('yetkisiz aktör (isApproverEligible=false) → Forbidden ve HİÇBİR YAZMA YOK', async () => {
    const h = build({ eligible: false });

    await expect(h.svc.createPortalUser(CLIENT_ID, EMAIL, RAW_PASSWORD, TENANT, ACTOR)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(h.officeApproval.isApproverEligible).toHaveBeenCalledWith(ACTOR.userId, TENANT);
    expectNoWrite(h);
  });

  it('aktör YOK → fail-closed: yeterlilik DB\'ye SORULMAZ, yazma yok', async () => {
    const h = build({ eligible: true });

    await expect(h.svc.createPortalUser(CLIENT_ID, EMAIL, RAW_PASSWORD, TENANT, undefined)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(h.officeApproval.isApproverEligible).not.toHaveBeenCalled();
    expectNoWrite(h);
  });

  it('kapı SONRAKİ okumalardan da ÖNCE: yetkisiz aktörde e-posta çakışma probu hiç çalışmaz', async () => {
    const h = build({ eligible: false });

    await expect(h.svc.createPortalUser(CLIENT_ID, EMAIL, RAW_PASSWORD, TENANT, ACTOR)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(h.prisma.clientPortalUser.findFirst).not.toHaveBeenCalled();
    expect(h.prisma.clientPortalUser.findUnique).not.toHaveBeenCalled();
  });

  it('YETKİLİ aktör → mevcut davranış korunur (portal kullanıcısı + erişim bayrağı + ENABLE audit)', async () => {
    const h = build({ eligible: true });

    const sonuc: any = await h.svc.createPortalUser(CLIENT_ID, EMAIL, RAW_PASSWORD, TENANT, ACTOR);

    expect(h.officeApproval.isApproverEligible).toHaveBeenCalledWith(ACTOR.userId, TENANT);
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(h.tx.clientPortalUser.create).toHaveBeenCalledTimes(1);
    expect(h.tx.client.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ hasPortalAccess: true }) }),
    );
    expect(h.audit.logInTransaction).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({ action: 'CLIENT_PORTAL_ACCESS_ENABLE', tenantId: TENANT, userId: ACTOR.userId }),
    );
    expect(sonuc.success).toBe(true);
  });
});

describe('A5 — disablePortalUser yetki kapısı', () => {
  it('yetkisiz aktör (isApproverEligible=false) → Forbidden ve HİÇBİR YAZMA YOK', async () => {
    const h = build({ eligible: false });

    await expect(h.svc.disablePortalUser(CLIENT_ID, TENANT, ACTOR)).rejects.toBeInstanceOf(ForbiddenException);

    expect(h.officeApproval.isApproverEligible).toHaveBeenCalledWith(ACTOR.userId, TENANT);
    expectNoWrite(h);
  });

  it('aktör YOK → fail-closed: yeterlilik DB\'ye SORULMAZ, yazma yok', async () => {
    const h = build({ eligible: true });

    await expect(h.svc.disablePortalUser(CLIENT_ID, TENANT, undefined)).rejects.toBeInstanceOf(ForbiddenException);

    expect(h.officeApproval.isApproverEligible).not.toHaveBeenCalled();
    expectNoWrite(h);
  });

  it('YETKİLİ aktör → mevcut davranış korunur (pasifleştirme + tokenVersion + DISABLE audit)', async () => {
    const h = build({ eligible: true });

    const sonuc: any = await h.svc.disablePortalUser(CLIENT_ID, TENANT, ACTOR);

    expect(h.officeApproval.isApproverEligible).toHaveBeenCalledWith(ACTOR.userId, TENANT);
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(h.tx.clientPortalUser.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId: CLIENT_ID },
        data: expect.objectContaining({ isActive: false, tokenVersion: { increment: 1 } }),
      }),
    );
    expect(h.tx.client.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ hasPortalAccess: false }) }),
    );
    expect(h.audit.logInTransaction).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({ action: 'CLIENT_PORTAL_ACCESS_DISABLE', tenantId: TENANT, userId: ACTOR.userId }),
    );
    expect(sonuc.success).toBe(true);
  });
});
