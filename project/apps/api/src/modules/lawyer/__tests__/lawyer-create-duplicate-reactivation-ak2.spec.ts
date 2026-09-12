/**
 * AK-2 — Mükerrer dalda YENİDEN ETKİNLEŞTİRME sınırı (owner GO 2026-09-10,
 * "AK-2 MÜKERRER YENİDEN ETKİNLEŞTİRME KONTROLÜ").
 *
 * ÖLÇÜLEN YOL: LawyerService.create mükerrer eşleşmede (baro no / TCKN / normalize ad-soyad) pasif
 *   kaydı `isActive:true` yapıyordu. Tepedeki AK-2 kontrolü yalnız İSTEK değerlerine bakar; ayrıcalıksız
 *   gövde gönderen H2'siz bir aktör, pasif fakat AYRICALIKLI bir kaydı yetki kontrolü ve audit OLMADAN
 *   yeniden etkinleştirebiliyordu. Kapılar: POST /lawyers (F01: MANAGER / delege), POST /cases dosya içi
 *   avukat (JwtAuthGuard), POST /seed/lawyers (JwtAuthGuard) ve seedAll.
 *
 * KURAL: yeniden etkinleşecek kaydın MEVCUT ayrıcalığı (PARTNER/MANAGER rütbesi, canModifyOtherPermissions,
 *   permissionsLocked, canApproveOfficeActions) varsa yalnız H2 otoritesi (ADMIN veya aktif + aynı tenant +
 *   bağlı PARTNER) yeniden etkinleştirebilir; aksi 403 ve HİÇBİR yazma yok. Ayrıcalıksız kaydın yeniden
 *   etkinleştirilmesi mevcut davranışla izinli kalır (artık audit'li).
 * YAZMA: CLIENT R1A deseni — yetki kararının verildiği DURUMA koşullu `updateMany` (tenant + isActive:false +
 *   değerlendirilen ayrıcalık değerleri) ve LAWYER_REACTIVATE audit'i AYNI transaction'da; count 0 → ne
 *   yazma ne audit. Bu dalda ofis oluşturma HİÇ çalışmaz; create'in YENİ kayıt dalındaki ofis otomatik
 *   oluşturması transaction dışındadır ve ayrı açık kalemdir (create akışının tamamı atomik DEĞİLDİR).
 */
import { ForbiddenException } from '@nestjs/common';
import 'reflect-metadata';
import { LawyerService } from '../lawyer.service';
import { CaseService } from '../../case/case.service';
import { SeedService } from '../../seed/seed.service';

type Row = Record<string, any>;
const TENANT = 't1';

// lawyer-privileged-field-guard / AK-2 create spec'leriyle aynı aktör fikstürleri.
const ADMIN = { userId: 'admin1', role: 'ADMIN' };
const PARTNER_ACTOR = { userId: 'p1', role: 'USER' };
const partnerUser = { tenantId: TENANT, isActive: true, lawyer: { lawyerRank: 'PARTNER' } };
const DELEGATE_ACTOR = { userId: 'd1', role: 'USER' };
const delegateUser = { tenantId: TENANT, isActive: true, lawyer: { lawyerRank: 'AUTHORIZED' } };
const MANAGER_ACTOR = { userId: 'm1', role: 'USER' };
const managerUser = { tenantId: TENANT, isActive: true, lawyer: { lawyerRank: 'MANAGER' } };
const STAFF_ACTOR = { userId: 's1', role: 'USER' };
const staffUser = { tenantId: TENANT, isActive: true, lawyer: null };

/** Pasif kayıt fikstürü — varsayılanı AYRICALIKSIZ (LAWYER / false / false / false). */
const baseRow = (over: Row = {}): Row => ({
  id: 'L-X',
  tenantId: TENANT,
  officeId: 'O1',
  name: 'Ayşe',
  surname: 'Kaya',
  barNumber: 'B-100',
  tckn: '11111111110',
  title: 'Av.',
  role: 'EMPLOYEE',
  isActive: false,
  lawyerRank: 'LAWYER',
  canModifyOtherPermissions: false,
  permissionsLocked: false,
  canApproveOfficeActions: false,
  userId: null,
  ...over,
});

// settings/office LawyerModal'ın AYRICALIKSIZ create gövdesi (form varsayılanı; page.tsx:1605-1619).
const UI_LAWYER_BODY = {
  name: 'Ayşe',
  surname: 'Kaya',
  lawyerRank: 'LAWYER',
  canModifyOtherPermissions: false,
  permissionsLocked: false,
  canApproveOfficeActions: false,
  defaultPermissions: {
    canEditCase: true, canGenerateDocs: true, canSyncUYAP: false, canViewFinance: true,
    canEditFinance: false, canChangeStatus: false, canEditParties: false,
  },
};

/**
 * Kayıt deposunu ve transaction'ı gerçekten modelleyen harness. `$transaction(fn)` fn'i bir SAHNE üzerinde
 * koşar; başarıyla dönerse sahne depoya işlenir, fırlatırsa ATILIR (rollback). `tx.lawyer.updateMany`
 * `where`'deki HER alanı depodaki satırla karşılaştırır (koşullu yazma / CAS). `beforeCas` okuma ile
 * yazma ARASINDA eşzamanlı bir değişikliği canlandırır.
 */
const build = (opts: {
  rows: Row[];
  actorUser?: unknown;
  auditFails?: boolean;
  beforeCas?: (store: Map<string, Row>) => void;
}) => {
  const store = new Map<string, Row>(opts.rows.map((r) => [r.id, { ...r }]));
  const txs: any[] = [];
  const prisma: any = {
    lawyer: {
      findMany: jest.fn(async ({ where }: any) =>
        [...store.values()].filter((r) => r.tenantId === where.tenantId).map((r) => ({ ...r })),
      ),
      findFirst: jest.fn(async ({ where }: any) => {
        const r = store.get(where.id);
        return r && (!where.tenantId || r.tenantId === where.tenantId) ? { ...r } : null;
      }),
      // ESKİ transaction DIŞI yazma yolu — düzeltmeden sonra HİÇ çağrılmamalı.
      update: jest.fn(async ({ where, data }: any) => {
        const r = store.get(where.id)!;
        Object.assign(r, data);
        return { ...r };
      }),
      create: jest.fn(),
      aggregate: jest.fn(async () => ({ _max: { sortOrder: 0 } })),
    },
    office: { findUnique: jest.fn(), create: jest.fn() },
    tenant: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(async () => opts.actorUser ?? null) },
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => {
      const staged: Array<[string, Row]> = [];
      const tx = {
        lawyer: {
          updateMany: jest.fn(async ({ where, data }: any) => {
            opts.beforeCas?.(store);
            const r = store.get(where.id);
            const matches = !!r && Object.entries(where).every(([k, v]) => r[k] === v);
            if (!matches) return { count: 0 };
            staged.push([where.id, data]);
            return { count: 1 };
          }),
        },
      };
      txs.push(tx);
      const out = await fn(tx); // fırlatırsa staged ATILIR → rollback
      for (const [id, data] of staged) Object.assign(store.get(id)!, data);
      return out;
    }),
  };
  const audit: any = {
    log: jest.fn(),
    logInTransaction: jest.fn(async () => {
      if (opts.auditFails) throw new Error('AUDIT_WRITE_FAILED');
    }),
  };
  // officeApproval'da F01 fonksiyonu YOK → yanıt toPublicLawyer'dan geçer (id korunur).
  const svc = new LawyerService(prisma, audit, {} as any);
  return { svc, prisma, audit, store, txs };
};

/** Hiçbir yazma YAPILMADIĞINI kanıtlar (yeniden etkinleştirme, transaction, audit, ofis, yeni kayıt). */
const expectNoWrite = (h: { prisma: any; audit: any; store: Map<string, Row> }, id: string) => {
  expect(h.store.get(id)!.isActive).toBe(false);
  expect(h.prisma.lawyer.update).not.toHaveBeenCalled();
  expect(h.prisma.$transaction).not.toHaveBeenCalled();
  expect(h.prisma.lawyer.create).not.toHaveBeenCalled();
  expect(h.prisma.office.findUnique).not.toHaveBeenCalled();
  expect(h.prisma.office.create).not.toHaveBeenCalled();
  expect(h.audit.logInTransaction).not.toHaveBeenCalled();
  expect(h.audit.log).not.toHaveBeenCalled();
};

const PRIVILEGED_RECORDS: Array<[string, Row]> = [
  ['lawyerRank=PARTNER', { lawyerRank: 'PARTNER' }],
  ['lawyerRank=MANAGER', { lawyerRank: 'MANAGER' }],
  ['canModifyOtherPermissions=true', { lawyerRank: 'AUTHORIZED', canModifyOtherPermissions: true }],
  ['permissionsLocked=true', { permissionsLocked: true }],
  ['canApproveOfficeActions=true (delege bayrağı)', { lawyerRank: 'AUTHORIZED', canApproveOfficeActions: true }],
];

describe('AK-2 — yetkisiz aktör pasif AYRICALIKLI kaydı yeniden etkinleştiremez: 403, hiçbir yazma yok', () => {
  it.each(PRIVILEGED_RECORDS)('delege, AYRICALIKSIZ UI gövdesiyle (ad eşleşmesi) pasif %s kaydı → 403', async (_l, over) => {
    const h = build({ rows: [baseRow(over)], actorUser: delegateUser });
    await expect(h.svc.create(TENANT, UI_LAWYER_BODY as never, DELEGATE_ACTOR)).rejects.toThrow(ForbiddenException);
    expectNoWrite(h, 'L-X');
  });

  it('baro no eşleşmesiyle pasif PARTNER → 403', async () => {
    const h = build({ rows: [baseRow({ lawyerRank: 'PARTNER' })], actorUser: delegateUser });
    await expect(
      h.svc.create(TENANT, { name: 'Başka', surname: 'Ad', barNumber: 'B-100' } as never, DELEGATE_ACTOR),
    ).rejects.toThrow(ForbiddenException);
    expectNoWrite(h, 'L-X');
  });

  it('TCKN eşleşmesiyle pasif PARTNER → 403', async () => {
    const h = build({ rows: [baseRow({ lawyerRank: 'PARTNER' })], actorUser: delegateUser });
    await expect(
      h.svc.create(TENANT, { name: 'Başka', surname: 'Ad', tckn: '11111111110' } as never, DELEGATE_ACTOR),
    ).rejects.toThrow(ForbiddenException);
    expectNoWrite(h, 'L-X');
  });

  it('MANAGER aktör (F01 aktörü, H2 otoritesi DEĞİL) → 403', async () => {
    const h = build({ rows: [baseRow({ lawyerRank: 'PARTNER' })], actorUser: managerUser });
    await expect(h.svc.create(TENANT, UI_LAWYER_BODY as never, MANAGER_ACTOR)).rejects.toThrow(ForbiddenException);
    expectNoWrite(h, 'L-X');
  });

  it('bağlı avukatı olmayan personel → 403', async () => {
    const h = build({ rows: [baseRow({ lawyerRank: 'PARTNER' })], actorUser: staffUser });
    await expect(h.svc.create(TENANT, UI_LAWYER_BODY as never, STAFF_ACTOR)).rejects.toThrow(ForbiddenException);
    expectNoWrite(h, 'L-X');
  });

  it('aktör YOK (iç çağrı) → 403', async () => {
    const h = build({ rows: [baseRow({ lawyerRank: 'PARTNER' })] });
    await expect(h.svc.create(TENANT, UI_LAWYER_BODY as never)).rejects.toThrow(ForbiddenException);
    expectNoWrite(h, 'L-X');
  });

  it('atıf yetki DEĞİLDİR: aktör yok + atıf → 403', async () => {
    const h = build({ rows: [baseRow({ lawyerRank: 'PARTNER' })] });
    await expect(
      h.svc.create(TENANT, UI_LAWYER_BODY as never, undefined, { userId: 'u-case' }),
    ).rejects.toThrow(ForbiddenException);
    expectNoWrite(h, 'L-X');
  });

  it("başka tenant'ın PARTNER'ı → 403", async () => {
    const h = build({ rows: [baseRow({ lawyerRank: 'PARTNER' })], actorUser: { ...partnerUser, tenantId: 'other' } });
    await expect(h.svc.create(TENANT, UI_LAWYER_BODY as never, PARTNER_ACTOR)).rejects.toThrow(ForbiddenException);
    expectNoWrite(h, 'L-X');
  });

  it('pasif PARTNER aktör → 403', async () => {
    const h = build({ rows: [baseRow({ lawyerRank: 'PARTNER' })], actorUser: { ...partnerUser, isActive: false } });
    await expect(h.svc.create(TENANT, UI_LAWYER_BODY as never, PARTNER_ACTOR)).rejects.toThrow(ForbiddenException);
    expectNoWrite(h, 'L-X');
  });

  it('ret mesajı yeniden etkinleştirme bağlamını söyler', async () => {
    const h = build({ rows: [baseRow({ lawyerRank: 'PARTNER' })], actorUser: delegateUser });
    await expect(h.svc.create(TENANT, UI_LAWYER_BODY as never, DELEGATE_ACTOR)).rejects.toThrow(/yeniden etkinleştir/);
  });
});

describe('AK-2 — yetkili yeniden etkinleştirme: koşullu yazma + AYNI transaction LAWYER_REACTIVATE', () => {
  it('ADMIN pasif PARTNER\'ı yeniden etkinleştirir; yazma yetki kararının DURUMUNA koşullu; kullanıcı sorgusu YOK', async () => {
    const h = build({ rows: [baseRow({ id: 'L-P', lawyerRank: 'PARTNER', canModifyOtherPermissions: true })] });
    const res: any = await h.svc.create(TENANT, UI_LAWYER_BODY as never, ADMIN);
    expect(h.store.get('L-P')!.isActive).toBe(true);
    expect(res).toMatchObject({ id: 'L-P', isActive: true, _existingReturned: true, _reactivated: true });
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(h.txs[0].lawyer.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'L-P',
        tenantId: TENANT,
        isActive: false,
        lawyerRank: 'PARTNER',
        canModifyOtherPermissions: true,
        permissionsLocked: false,
        canApproveOfficeActions: false,
      },
      data: { isActive: true },
    });
    expect(h.prisma.lawyer.update).not.toHaveBeenCalled(); // transaction dışı yazma YOK
    expect(h.prisma.user.findUnique).not.toHaveBeenCalled(); // ADMIN kısa yolu
    expect(h.prisma.office.findUnique).not.toHaveBeenCalled(); // mükerrer dalda ofis yolu yok
  });

  it('audit: TAM BİR LAWYER_REACTIVATE, gerçek aktör + USER, yeniden etkinleştirmeyle AYNI transaction', async () => {
    const h = build({ rows: [baseRow({ id: 'L-P', lawyerRank: 'PARTNER', canModifyOtherPermissions: true })] });
    await h.svc.create(TENANT, UI_LAWYER_BODY as never, ADMIN);
    expect(h.audit.logInTransaction).toHaveBeenCalledTimes(1);
    const [txSeen, entry] = h.audit.logInTransaction.mock.calls[0];
    expect(txSeen).toBe(h.txs[0]);
    expect(entry).toMatchObject({
      tenantId: TENANT,
      action: 'LAWYER_REACTIVATE',
      entityType: 'LAWYER',
      entityId: 'L-P',
      userId: 'admin1',
      actorType: 'USER',
      metadata: {
        reactivatedFromDuplicate: true,
        privileged: true,
        lawyerRank: 'PARTNER',
        canModifyOtherPermissions: true,
        permissionsLocked: false,
        canApproveOfficeActions: false,
      },
    });
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('audit kimlik/ad/baro/TCKN verisini TAŞIMAZ; metadata yalnız bayrak ve yetki alanları', async () => {
    const h = build({ rows: [baseRow({ id: 'L-P', lawyerRank: 'PARTNER' })] });
    await h.svc.create(TENANT, UI_LAWYER_BODY as never, ADMIN);
    const entry = h.audit.logInTransaction.mock.calls[0][1];
    const serialized = JSON.stringify(entry);
    for (const secret of ['Ayşe', 'Kaya', 'B-100', '11111111110']) expect(serialized).not.toContain(secret);
    expect(Object.keys(entry.metadata).sort()).toEqual([
      'canApproveOfficeActions', 'canModifyOtherPermissions', 'lawyerRank', 'permissionsLocked', 'privileged', 'reactivatedFromDuplicate',
    ]);
  });

  it("aynı tenant'a bağlı aktif PARTNER pasif MANAGER'ı yeniden etkinleştirir", async () => {
    const h = build({ rows: [baseRow({ lawyerRank: 'MANAGER' })], actorUser: partnerUser });
    const res: any = await h.svc.create(TENANT, UI_LAWYER_BODY as never, PARTNER_ACTOR);
    expect(h.store.get('L-X')!.isActive).toBe(true);
    expect(res._reactivated).toBe(true);
    expect(h.prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(h.audit.logInTransaction.mock.calls[0][1]).toMatchObject({ userId: 'p1', metadata: { privileged: true } });
  });

  it('audit yazılamazsa yeniden etkinleştirme KALICILAŞMAZ (rollback) ve hata çağırana ulaşır', async () => {
    const h = build({ rows: [baseRow({ lawyerRank: 'PARTNER' })], auditFails: true });
    await expect(h.svc.create(TENANT, UI_LAWYER_BODY as never, ADMIN)).rejects.toThrow('AUDIT_WRITE_FAILED');
    expect(h.txs[0].lawyer.updateMany).toHaveBeenCalledTimes(1); // yazma sahnelendi...
    expect(h.store.get('L-X')!.isActive).toBe(false); // ...ama kalıcılaşmadı
    expect(h.prisma.lawyer.update).not.toHaveBeenCalled();
  });
});

describe('AK-2 — ayrıcalıksız pasif kayıt: mevcut davranış korunur, artık aynı transaction\'da audit\'li', () => {
  it('delege ayrıcalıksız pasif kaydı yeniden etkinleştirir; H2 kullanıcı sorgusu YAPILMAZ', async () => {
    const h = build({ rows: [baseRow()], actorUser: delegateUser });
    const res: any = await h.svc.create(TENANT, UI_LAWYER_BODY as never, DELEGATE_ACTOR);
    expect(h.store.get('L-X')!.isActive).toBe(true);
    expect(res).toMatchObject({ id: 'L-X', _existingReturned: true, _reactivated: true });
    expect(h.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(h.audit.logInTransaction.mock.calls[0][0]).toBe(h.txs[0]);
    expect(h.audit.logInTransaction.mock.calls[0][1]).toMatchObject({
      action: 'LAWYER_REACTIVATE',
      userId: 'd1',
      actorType: 'USER',
      metadata: { privileged: false, lawyerRank: 'LAWYER' },
    });
  });

  it('atıf: audit isteği yapan kullanıcıya bağlanır', async () => {
    const h = build({ rows: [baseRow()] });
    await h.svc.create(TENANT, UI_LAWYER_BODY as never, undefined, { userId: 'u-case' });
    expect(h.audit.logInTransaction.mock.calls[0][1]).toMatchObject({ userId: 'u-case', actorType: 'USER' });
  });

  it('aktör ve atıf yok (iç sistem çağrısı) → actorType SYSTEM, userId YOK', async () => {
    const h = build({ rows: [baseRow()] });
    await h.svc.create(TENANT, UI_LAWYER_BODY as never);
    const entry = h.audit.logInTransaction.mock.calls[0][1];
    expect(entry.actorType).toBe('SYSTEM');
    expect(entry.userId).toBeUndefined();
  });

  it('AKTİF mükerrer (ayrıcalıklı olsa bile): yazma, transaction ve audit YOK — mevcut kayıt döner', async () => {
    const h = build({ rows: [baseRow({ isActive: true, lawyerRank: 'PARTNER' })], actorUser: delegateUser });
    const res: any = await h.svc.create(TENANT, UI_LAWYER_BODY as never, DELEGATE_ACTOR);
    expect(res).toMatchObject({ id: 'L-X', _existingReturned: true, _reactivated: false });
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.prisma.lawyer.update).not.toHaveBeenCalled();
    expect(h.audit.logInTransaction).not.toHaveBeenCalled();
  });
});

describe('AK-2 — TOCTOU: yazma, yetki kararının verildiği DURUMA koşullu', () => {
  it('eşzamanlı yeniden etkinleştirme (count 0) → ikinci audit YOK; yanıt gerçek durumu gösterir', async () => {
    const h = build({
      rows: [baseRow()],
      actorUser: delegateUser,
      beforeCas: (s) => { s.get('L-X')!.isActive = true; },
    });
    const res: any = await h.svc.create(TENANT, UI_LAWYER_BODY as never, DELEGATE_ACTOR);
    expect(h.audit.logInTransaction).not.toHaveBeenCalled();
    expect(res).toMatchObject({ id: 'L-X', isActive: true, _reactivated: false });
  });

  it('okuma ile yazma arasında kayıt AYRICALIKLI hâle gelirse (PARTNER) → yeniden etkinleştirme YOK, audit YOK', async () => {
    const h = build({
      rows: [baseRow()],
      actorUser: delegateUser,
      beforeCas: (s) => { s.get('L-X')!.lawyerRank = 'PARTNER'; },
    });
    const res: any = await h.svc.create(TENANT, UI_LAWYER_BODY as never, DELEGATE_ACTOR);
    expect(h.store.get('L-X')!.isActive).toBe(false);
    expect(h.audit.logInTransaction).not.toHaveBeenCalled();
    expect(res).toMatchObject({ id: 'L-X', isActive: false, _reactivated: false });
  });
});

describe('AK-2 — iç çağıranlar da aynı sınırdan geçer', () => {
  it('dosya içi avukat (POST /cases): pasif PARTNER eşleşmesi → 403, hiçbir avukat yazması yok', async () => {
    const h = build({ rows: [baseRow({ lawyerRank: 'PARTNER' })] });
    const caseSvc: any = Object.create(CaseService.prototype);
    caseSvc.lawyerService = h.svc;
    await expect(
      caseSvc.resolveInlinePartiesInTx(
        TENANT,
        { lawyers: [{ name: 'Ayşe', surname: 'Kaya' }] },
        { userId: 'u-case', tenantId: TENANT, role: 'USER' },
      ),
    ).rejects.toThrow(ForbiddenException);
    expectNoWrite(h, 'L-X');
  });

  it('dosya içi avukat: ayrıcalıksız pasif eşleşme yeniden etkinleşir, bağ kurulur, audit dosyayı açana bağlanır', async () => {
    const h = build({ rows: [baseRow()] });
    const caseSvc: any = Object.create(CaseService.prototype);
    caseSvc.lawyerService = h.svc;
    const dto: any = { lawyers: [{ name: 'Ayşe', surname: 'Kaya' }] };
    await caseSvc.resolveInlinePartiesInTx(TENANT, dto, { userId: 'u-case', tenantId: TENANT, role: 'USER' });
    expect(dto.lawyers[0].id).toBe('L-X');
    expect(h.store.get('L-X')!.isActive).toBe(true);
    expect(h.audit.logInTransaction.mock.calls[0][1]).toMatchObject({ userId: 'u-case', metadata: { privileged: false } });
  });

  it('seedLawyers: seed satırı pasif PARTNER\'la eşleşirse (baro no 12345) → 403, hiçbir yazma yok', async () => {
    const h = build({ rows: [baseRow({ name: 'Zeki', surname: 'Zor', barNumber: '12345', tckn: null, lawyerRank: 'PARTNER' })] });
    const seed = new SeedService({} as any, { log: jest.fn(), logInTransaction: jest.fn() } as any, {} as any, undefined, h.svc);
    await expect(seed.seedLawyers(TENANT, { userId: 'u-seed' })).rejects.toThrow(ForbiddenException);
    expectNoWrite(h, 'L-X');
  });
});
