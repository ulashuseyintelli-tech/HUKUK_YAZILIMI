/**
 * O-5 (owner 05.11.2026, C politikası) — pasif personeli yönetici gözden geçirmesiyle yeniden etkinleştirme.
 *
 * Sözleşme (StaffService.reactivate + ReactivateStaffDto):
 *  1) İzinler YALNIZ doğrulanmış gövdeden yazılır; eski kartın değerleri sessizce devralınmaz.
 *  2) Koşullu yazım: tenant + pasif + okunan updatedAt; count 0 → 409 STAFF_REACTIVATION_CONFLICT, denetim YOK.
 *  3) STAFF_REACTIVATE denetimi aynı transaction'da; eski → yeni izin değerleri, kişisel veri yok.
 *  4) Giriş hesabı, rol, büro geneli grant ve dosya atamaları YAZILMAZ; yanıt bağlı hesabın GERÇEK durumunu döner.
 *  5) Aktif kart / bulunamayan kart / başka aktif kartla aynı kimlik / eksik aktör → yazım yok.
 * Gerçek PostgreSQL üzerinde yarış ve denetim hatasında geri alma:
 * staff-reactivation-o5.http.db-gated.integration.spec.ts.
 */
import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { StaffService } from '../staff.service';
import { ReactivateStaffDto } from '../dto/staff.dto';

const TENANT = 't1';
const ID = 's1';
const UPDATED_AT = new Date('2026-11-01T10:00:00.000Z');
const ACTOR = { userId: 'admin-1', role: 'ADMIN', requestId: 'req-o5-1' };

const PASIF = {
  id: ID, tenantId: TENANT, firstName: 'Ayşe', lastName: 'Personel', tckn: '12345678901', email: 'ayse@o5.test',
  isActive: false, userId: 'u-linked', updatedAt: UPDATED_AT,
  staffType: 'MUHASEBE', canCreateCase: true, canEditCase: true, canGenerateDocuments: true, canApproveDocuments: true,
  canSeeFinance: true, canApproveFinance: true, canPrepareCollectionDisposition: true, canSendNotifications: true,
  isDefaultForNewCases: true,
};

/** Yönetici formda DAHA DAR izin seçti: yalnız belge hazırlama + otomatik atama kapalı. */
const SECIM: ReactivateStaffDto = {
  staffType: 'SEKRETER' as any,
  canCreateCase: false, canEditCase: false, canGenerateDocuments: true, canApproveDocuments: false,
  canSeeFinance: false, canApproveFinance: false, canPrepareCollectionDisposition: false, canSendNotifications: false,
  isDefaultForNewCases: false,
};

const build = (opts: { existing?: any; duplicate?: any; updateCount?: number; auditThrows?: boolean; linkedUser?: any } = {}) => {
  const existing = opts.existing === undefined ? PASIF : opts.existing;
  const after = { ...existing, ...SECIM, isActive: true, updatedAt: new Date('2026-11-05T10:00:00.000Z') };
  const staffMember = {
    findFirst: jest.fn().mockImplementation(({ where }: any) => {
      if (where?.isActive === true) return Promise.resolve(opts.duplicate ?? null); // başka AKTİF kart (kimlik çakışması)
      return Promise.resolve(staffMember.updateMany.mock.calls.length ? after : existing);
    }),
    updateMany: jest.fn().mockResolvedValue({ count: opts.updateCount ?? 1 }),
    update: jest.fn(),
    create: jest.fn(),
  };
  const tx: any = {
    staffMember,
    caseStaff: { count: jest.fn().mockResolvedValue(3), deleteMany: jest.fn(), updateMany: jest.fn() },
    case: { count: jest.fn().mockResolvedValue(1), updateMany: jest.fn() },
    user: {
      findFirst: jest.fn().mockResolvedValue(opts.linkedUser === undefined ? { isActive: false } : opts.linkedUser),
      update: jest.fn(), updateMany: jest.fn(),
    },
    permissionGrant: { updateMany: jest.fn(), deleteMany: jest.fn() },
  };
  const prisma: any = { ...tx, $transaction: jest.fn(async (fn: any) => fn(tx)) };
  const audit: any = {
    logInTransaction: jest.fn().mockImplementation(() =>
      opts.auditThrows ? Promise.reject(new Error('denetim yazılamadı')) : Promise.resolve(),
    ),
  };
  return { svc: new StaffService(prisma, audit), prisma, tx, audit };
};

const hesapGrantAtamaYazilmadi = (tx: any) => {
  expect(tx.user.update).not.toHaveBeenCalled();
  expect(tx.user.updateMany).not.toHaveBeenCalled();
  expect(tx.permissionGrant.updateMany).not.toHaveBeenCalled();
  expect(tx.permissionGrant.deleteMany).not.toHaveBeenCalled();
  expect(tx.caseStaff.deleteMany).not.toHaveBeenCalled();
  expect(tx.caseStaff.updateMany).not.toHaveBeenCalled();
  expect(tx.case.updateMany).not.toHaveBeenCalled();
};

describe('O-5 StaffService.reactivate — gözden geçirilmiş yeniden etkinleştirme', () => {
  it('izinler YALNIZ gövdeden yazılır; koşullu güncelleme pasif + okunan updatedAt ister', async () => {
    const { svc, tx } = build();
    await svc.reactivate(ID, TENANT, SECIM, ACTOR);
    expect(tx.staffMember.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.staffMember.updateMany).toHaveBeenCalledWith({
      where: { id: ID, tenantId: TENANT, isActive: false, updatedAt: UPDATED_AT },
      data: { ...SECIM, isActive: true },
    });
    // Kimlik / iletişim / hesap bağı / sıra yazım kümesinde YOK.
    const data = tx.staffMember.updateMany.mock.calls[0][0].data;
    for (const k of ['tckn', 'email', 'phone', 'userId', 'firstName', 'lastName', 'sortOrder', 'tenantId']) expect(data).not.toHaveProperty(k);
  });

  it('TEK STAFF_REACTIVATE denetimi aynı transaction istemcisiyle: eski → yeni izinler, kişisel veri yok', async () => {
    const { svc, tx, audit } = build();
    await svc.reactivate(ID, TENANT, SECIM, ACTOR);
    expect(audit.logInTransaction).toHaveBeenCalledTimes(1);
    const [client, input] = audit.logInTransaction.mock.calls[0];
    expect(client).toBe(tx);
    expect(input).toMatchObject({
      tenantId: TENANT, action: 'STAFF_REACTIVATE', entityType: 'STAFF', entityId: ID, userId: ACTOR.userId,
      actorType: 'USER', decisionResult: 'SUCCESS', reasonCode: 'OFFICE_F01_AUTHORIZED', requestId: ACTOR.requestId,
      oldValues: {
        isActive: false, staffType: 'MUHASEBE', canCreateCase: true, canEditCase: true, canGenerateDocuments: true,
        canApproveDocuments: true, canSeeFinance: true, canApproveFinance: true, canPrepareCollectionDisposition: true,
        canSendNotifications: true, isDefaultForNewCases: true,
      },
      newValues: { isActive: true, ...SECIM },
      metadata: expect.objectContaining({
        actorRole: 'ADMIN', reviewedReactivation: true, linkedUserAccountExists: true, linkedUserAccountActive: false,
        linkedUserAccountChanged: false, caseAssignmentCount: 3, responsibleCaseCount: 1,
      }),
    });
    expect(JSON.stringify(input)).not.toMatch(/12345678901|ayse@o5\.test|Ayşe/);
  });

  it('hesap, rol, büro geneli grant ve dosya atamaları YAZILMAZ; yanıt bağlı hesabın gerçek durumunu taşır', async () => {
    const { svc, tx } = build();
    const res: any = await svc.reactivate(ID, TENANT, SECIM, ACTOR);
    hesapGrantAtamaYazilmadi(tx);
    expect(res.linkedAccount).toEqual({ exists: true, isActive: false });
    expect(res.caseAssignmentCount).toBe(3);
    expect(res.responsibleCaseCount).toBe(1);
    expect(res.staff.isActive).toBe(true);
    expect(res.staff.canSeeFinance).toBe(false);
    expect(res.staff.tckn).not.toBe('12345678901'); // liste maskesi
  });

  it('hesapsız kart: linkedAccount { exists:false, isActive:false }', async () => {
    const { svc } = build({ existing: { ...PASIF, userId: null } });
    const res: any = await svc.reactivate(ID, TENANT, SECIM, ACTOR);
    expect(res.linkedAccount).toEqual({ exists: false, isActive: false });
  });

  it('koşullu güncelleme count 0 (eşzamanlı istek / kayıt değişti) → 409 STAFF_REACTIVATION_CONFLICT, denetim YOK', async () => {
    const { svc, audit } = build({ updateCount: 0 });
    await expect(svc.reactivate(ID, TENANT, SECIM, ACTOR)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STAFF_REACTIVATION_CONFLICT' }),
    });
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('denetim yazılamazsa hata yutulmaz (transaction geri alınır — gerçek geri alma DB testinde)', async () => {
    const { svc } = build({ auditThrows: true });
    await expect(svc.reactivate(ID, TENANT, SECIM, ACTOR)).rejects.toThrow('denetim yazılamadı');
  });

  it('aktif kart → 409 STAFF_ALREADY_ACTIVE; transaction açılmaz', async () => {
    const { svc, prisma } = build({ existing: { ...PASIF, isActive: true } });
    await expect(svc.reactivate(ID, TENANT, SECIM, ACTOR)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STAFF_ALREADY_ACTIVE' }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('bulunamayan / başka tenant kartı → 404; transaction açılmaz', async () => {
    const { svc, prisma } = build({ existing: null });
    await expect(svc.reactivate(ID, TENANT, SECIM, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('başka AKTİF kart aynı TCKN / e-postayı taşıyorsa 409 DUPLICATE_IDENTITY; transaction açılmaz', async () => {
    const { svc, prisma } = build({ duplicate: { id: 's9', firstName: 'Diğer', lastName: 'Kart' } });
    await expect(svc.reactivate(ID, TENANT, SECIM, ACTOR)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DUPLICATE_IDENTITY' }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('aktör / rol / istek kimliği eksikse hiçbir okuma ya da yazım yapılmaz', async () => {
    for (const actor of [undefined, { ...ACTOR, userId: '' }, { ...ACTOR, role: '' }, { ...ACTOR, requestId: '' }]) {
      const { svc, prisma } = build();
      await expect(svc.reactivate(ID, TENANT, SECIM, actor as any)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.staffMember.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }
  });
});

describe('O-5 ReactivateStaffDto — global ValidationPipe ile birebir', () => {
  // main.ts ile AYNI seçenekler.
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const meta = { type: 'body' as const, metatype: ReactivateStaffDto };

  it('tam ve tipli izin kümesi geçer', async () => {
    await expect(pipe.transform({ ...SECIM }, meta)).resolves.toBeInstanceOf(ReactivateStaffDto);
  });

  it.each(['staffType', 'canSeeFinance', 'isDefaultForNewCases'])('%s eksikse 400 (sessiz varsayılan yok)', async (k) => {
    const body: any = { ...SECIM };
    delete body[k];
    await expect(pipe.transform(body, meta)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tip çöpü 400 (canSeeFinance: "true", staffType: "YOK")', async () => {
    await expect(pipe.transform({ ...SECIM, canSeeFinance: 'true' }, meta)).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ ...SECIM, staffType: 'YOK' }, meta)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['isActive', 'userId', 'tckn', 'email', 'role', 'sortOrder'])('%s anahtarı kabul edilmez (400)', async (k) => {
    await expect(pipe.transform({ ...SECIM, [k]: k === 'isActive' ? true : 'x' }, meta)).rejects.toBeInstanceOf(BadRequestException);
  });
});
