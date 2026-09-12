/**
 * B11 — AYRICALIKLI AVUKAT GÜNCELLEMELERİNDE ATOMİK AUDIT.
 *
 * OWNER POLİTİKASI (2026-09-12): `lawyerRank`, `permissionsLocked`, `canModifyOtherPermissions`,
 * `defaultPermissions` ve `canApproveOfficeActions` alanlarının GERÇEK değişiklikleri audit gerektirir.
 * Mevcut yetki kapıları korunur; güncelleme ile audit AYNI transaction'dadır, audit yazılamazsa güncelleme
 * geri alınır; delegation için mükerrer kayıt üretilmez; genel profil alanları kapsam dışıdır.
 *
 * A2 ÖLÇÜMÜ (önce): `LawyerService.update` yalnız `canApproveOfficeActions` değişince, güncellemeden SONRA ve
 * hata-yutan `audit.log()` ile yazıyordu; diğer dört ayrıcalıklı alan AYNI ADMIN/PARTNER kapısına tabi olduğu
 * hâlde audit'sizdi.
 *
 * BU SPEC'İN SABİTLEDİĞİ (gerçek `LawyerService.update` koşar):
 *  - yetkisiz aktörde yazma YOK (transaction açılmaz, iki audit kanalında da kayıt yok),
 *  - yetkili değişiklik: güncelleme + TEK `LAWYER_PRIVILEGE_CHANGED` aynı tx client'ıyla,
 *  - no-op (değer aynı; `defaultPermissions`'ta anahtar sırası farklı dahil) → değişiklik audit'i YOK,
 *  - delegation TEKİLLİĞİ: `canApproveOfficeActions` yalnız kendi `LAWYER_OFFICE_APPROVAL_DELEGATION_CHANGED`
 *    kaydında; `LAWYER_PRIVILEGE_CHANGED.changedFields` onu İÇERMEZ,
 *  - hassas veri dışlama: audit yalnız doğrulanmış aktör / tenant / hedef / değişen ALAN ADLARI taşır,
 *  - genel profil alanı (title vb.) → transaction ve audit YOK (kapsam dışı korunur),
 *  - audit yazılamazsa hata çağırana ulaşır (gerçek geri alma db-gated spec'te).
 */

import { ForbiddenException } from '@nestjs/common';
import { LawyerService } from '../lawyer.service';

const TENANT = 'tenant-b11';
const LAWYER_ID = 'lawyer-b11';
const ADMIN = { userId: 'admin-b11', role: 'ADMIN' };
const MANAGER = { userId: 'manager-b11', role: 'USER' };

const EXISTING = {
  id: LAWYER_ID, tenantId: TENANT, officeId: 'office-b11', name: 'Ada', surname: 'Lovelace',
  tckn: '10000000146', barNumber: null, isActive: true, phone: 'eski-telefon', title: 'Av.',
  iban: 'TR000000000000000000000001',
  lawyerRank: 'LAWYER', permissionsLocked: false, canModifyOtherPermissions: false,
  defaultPermissions: { canEditCase: true, canViewFinance: false }, canApproveOfficeActions: false,
};

function build(opts: { existing?: Record<string, unknown>; actorUser?: unknown; auditFails?: boolean } = {}) {
  const existing = { ...EXISTING, ...(opts.existing ?? {}) };
  const tx: any = {
    lawyer: { update: jest.fn(async ({ data }: any) => ({ ...existing, ...data })) },
  };
  const prisma: any = {
    lawyer: {
      findFirst: jest.fn().mockResolvedValue(existing),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(async ({ data }: any) => ({ ...existing, ...data })),
    },
    user: { findUnique: jest.fn().mockResolvedValue(opts.actorUser ?? null) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const audit: any = {
    log: jest.fn().mockResolvedValue(undefined),
    logInTransaction: opts.auditFails
      ? jest.fn().mockRejectedValue(new Error('AUDIT_YAZILAMADI'))
      : jest.fn().mockResolvedValue(undefined),
  };
  const officeApproval: any = { isF01ActorAuthorized: jest.fn().mockResolvedValue(true) };
  const svc = new LawyerService(prisma, audit, officeApproval);
  return { svc, prisma, tx, audit };
}

const auditInputs = (audit: any) => audit.logInTransaction.mock.calls.map((c: any[]) => c[1]);
const byAction = (audit: any, action: string) => auditInputs(audit).filter((i: any) => i.action === action);

describe('B11 — yetkisiz aktör: yazma ve audit YOK', () => {
  it('bağlı MANAGER lawyerRank değiştirmeye çalışır → 403; transaction açılmaz, iki kanalda da audit yok', async () => {
    const h = build({ actorUser: { tenantId: TENANT, isActive: true, lawyer: { lawyerRank: 'MANAGER' } } });

    await expect(h.svc.update(TENANT, LAWYER_ID, { lawyerRank: 'PARTNER' } as never, MANAGER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.prisma.lawyer.update).not.toHaveBeenCalled();
    expect(h.tx.lawyer.update).not.toHaveBeenCalled();
    expect(h.audit.logInTransaction).not.toHaveBeenCalled();
    expect(h.audit.log).not.toHaveBeenCalled();
  });
});

describe('B11 — yetkili değişiklik: güncelleme + audit AYNI transaction', () => {
  it('ADMIN lawyerRank LAWYER→PARTNER → tx içinde güncelleme + TEK LAWYER_PRIVILEGE_CHANGED', async () => {
    const h = build();

    await h.svc.update(TENANT, LAWYER_ID, { lawyerRank: 'PARTNER' } as never, ADMIN);

    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(h.tx.lawyer.update).toHaveBeenCalledTimes(1);
    expect(h.tx.lawyer.update.mock.calls[0][0].data.lawyerRank).toBe('PARTNER');
    expect(h.prisma.lawyer.update).not.toHaveBeenCalled(); // transaction DIŞI yazma yok
    expect(h.audit.logInTransaction).toHaveBeenCalledTimes(1);
    expect(h.audit.logInTransaction.mock.calls[0][0]).toBe(h.tx); // audit AYNI tx client'ında
    expect(h.audit.log).not.toHaveBeenCalled();
    expect(auditInputs(h.audit)[0]).toEqual({
      tenantId: TENANT,
      action: 'LAWYER_PRIVILEGE_CHANGED',
      entityType: 'LAWYER',
      entityId: LAWYER_ID,
      userId: ADMIN.userId,
      actorType: 'USER',
      metadata: { changedFields: ['lawyerRank'] },
    });
  });

  it('dört ayrıcalıklı alan birlikte değişir → yine TEK kayıt, değişen alanların tamamı adıyla', async () => {
    const h = build();

    await h.svc.update(
      TENANT,
      LAWYER_ID,
      {
        lawyerRank: 'MANAGER',
        permissionsLocked: true,
        canModifyOtherPermissions: true,
        defaultPermissions: { canEditCase: false },
      } as never,
      ADMIN,
    );

    const kayitlar = byAction(h.audit, 'LAWYER_PRIVILEGE_CHANGED');
    expect(kayitlar).toHaveLength(1);
    expect(kayitlar[0].metadata.changedFields).toEqual([
      'lawyerRank',
      'defaultPermissions',
      'permissionsLocked',
      'canModifyOtherPermissions',
    ]);
  });

  it('bağlı PARTNER ayrıcalıklı alan değiştirir → kapı geçer, audit doğrulanmış aktöre bağlanır', async () => {
    const partner = { userId: 'partner-b11', role: 'USER' };
    const h = build({ actorUser: { tenantId: TENANT, isActive: true, lawyer: { lawyerRank: 'PARTNER' } } });

    await h.svc.update(TENANT, LAWYER_ID, { permissionsLocked: true } as never, partner);

    expect(h.prisma.user.findUnique).toHaveBeenCalledTimes(1); // kapı DB'den doğruladı
    expect(byAction(h.audit, 'LAWYER_PRIVILEGE_CHANGED')).toEqual([
      expect.objectContaining({ userId: 'partner-b11', metadata: { changedFields: ['permissionsLocked'] } }),
    ]);
  });
});

describe('B11 — no-op: değişiklik audit\'i YOK', () => {
  it('aynı değerler (defaultPermissions anahtar sırası farklı) → transaction ve audit yok', async () => {
    const h = build();

    await h.svc.update(
      TENANT,
      LAWYER_ID,
      {
        lawyerRank: 'LAWYER',
        permissionsLocked: false,
        canModifyOtherPermissions: false,
        defaultPermissions: { canViewFinance: false, canEditCase: true }, // aynı içerik, farklı sıra
      } as never,
      ADMIN,
    );

    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.audit.logInTransaction).not.toHaveBeenCalled();
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('defaultPermissions null → mevcut null: no-op; null → nesne: değişiklik', async () => {
    const nullDurum = build({ existing: { defaultPermissions: null } });
    await nullDurum.svc.update(TENANT, LAWYER_ID, { defaultPermissions: null } as never, ADMIN);
    expect(nullDurum.audit.logInTransaction).not.toHaveBeenCalled();

    const degisim = build({ existing: { defaultPermissions: null } });
    await degisim.svc.update(TENANT, LAWYER_ID, { defaultPermissions: { canEditCase: true } } as never, ADMIN);
    expect(byAction(degisim.audit, 'LAWYER_PRIVILEGE_CHANGED')[0].metadata.changedFields).toEqual(['defaultPermissions']);
  });
});

describe('B11 — delegation tekilliği', () => {
  it('yalnız delegation değişir → TEK DELEGATION_CHANGED, PRIVILEGE_CHANGED YOK', async () => {
    const h = build();

    await h.svc.update(TENANT, LAWYER_ID, { canApproveOfficeActions: true } as never, ADMIN);

    expect(h.audit.logInTransaction).toHaveBeenCalledTimes(1);
    expect(byAction(h.audit, 'LAWYER_OFFICE_APPROVAL_DELEGATION_CHANGED')).toHaveLength(1);
    expect(byAction(h.audit, 'LAWYER_PRIVILEGE_CHANGED')).toHaveLength(0);
    // MEVCUT delegation kaydı biçimi DEĞİŞMEDİ (eylem + metadata).
    expect(byAction(h.audit, 'LAWYER_OFFICE_APPROVAL_DELEGATION_CHANGED')[0].metadata).toEqual({
      lawyerId: LAWYER_ID,
      canApproveOfficeActions: { from: false, to: true },
    });
  });

  it('delegation + lawyerRank birlikte → her alan TEK kayıtta; changedFields delegation İÇERMEZ', async () => {
    const h = build();

    await h.svc.update(TENANT, LAWYER_ID, { canApproveOfficeActions: true, lawyerRank: 'PARTNER' } as never, ADMIN);

    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1); // ikisi de AYNI transaction
    expect(byAction(h.audit, 'LAWYER_OFFICE_APPROVAL_DELEGATION_CHANGED')).toHaveLength(1);
    const privilege = byAction(h.audit, 'LAWYER_PRIVILEGE_CHANGED');
    expect(privilege).toHaveLength(1);
    expect(privilege[0].metadata.changedFields).toEqual(['lawyerRank']);
    expect(privilege[0].metadata.changedFields).not.toContain('canApproveOfficeActions');
    for (const call of h.audit.logInTransaction.mock.calls) expect(call[0]).toBe(h.tx);
  });
});

describe('B11 — hassas veri dışlama', () => {
  it('gövdede TCKN / IBAN / iletişim / title olsa bile audit yalnız aktör-tenant-hedef-alan adı taşır', async () => {
    const h = build();
    const govde = {
      lawyerRank: 'PARTNER',
      tckn: '10000000146',
      iban: 'TR330006100519786457841326',
      phone: 'yeni-telefon-555',
      email: 'gizli@test.invalid',
      title: 'Kıdemli Av.',
    };

    await h.svc.update(TENANT, LAWYER_ID, govde as never, ADMIN);

    const [girdi] = byAction(h.audit, 'LAWYER_PRIVILEGE_CHANGED');
    expect(Object.keys(girdi).sort()).toEqual(['action', 'actorType', 'entityId', 'entityType', 'metadata', 'tenantId', 'userId']);
    expect(Object.keys(girdi.metadata)).toEqual(['changedFields']);
    expect(girdi).not.toHaveProperty('oldValues');
    expect(girdi).not.toHaveProperty('newValues');
    const metin = JSON.stringify(girdi);
    for (const hassas of [govde.tckn, govde.iban, govde.phone, govde.email, govde.title, 'PARTNER']) {
      expect(metin).not.toContain(hassas); // değer değil, yalnız ALAN ADI yazılır
    }
  });
});

describe('B11 — kapsam dışı: genel profil alanları', () => {
  it('yalnız title / phone değişir → transaction ve audit YOK (davranış korunur)', async () => {
    const h = build();

    await h.svc.update(TENANT, LAWYER_ID, { title: 'Kıdemli Av.', phone: 'yeni' } as never, ADMIN);

    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.prisma.lawyer.update).toHaveBeenCalledTimes(1);
    expect(h.audit.logInTransaction).not.toHaveBeenCalled();
    expect(h.audit.log).not.toHaveBeenCalled();
  });
});

describe('B11 — audit yazılamazsa', () => {
  it('logInTransaction hata verir → güncelleme hatası çağırana ulaşır (yutulmaz)', async () => {
    const h = build({ auditFails: true });

    await expect(h.svc.update(TENANT, LAWYER_ID, { lawyerRank: 'PARTNER' } as never, ADMIN)).rejects.toThrow(
      'AUDIT_YAZILAMADI',
    );
    expect(h.audit.log).not.toHaveBeenCalled(); // hata-yutan kanala DÜŞÜLMEZ
  });
});
