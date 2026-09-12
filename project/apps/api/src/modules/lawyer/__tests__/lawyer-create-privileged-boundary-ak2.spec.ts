/**
 * AK-2 — Avukat OLUŞTURMADA ayrıcalık sınırı (owner GO 2026-09-10).
 *
 * KURAL: ADMIN veya aktif + aynı tenant + bağlı PARTNER olmayan aktör; PARTNER/MANAGER rütbesi,
 *   canModifyOtherPermissions=true veya permissionsLocked=true ile avukat OLUŞTURAMAZ → 403 ve
 *   HİÇBİR yazma yapılmaz (mükerrer etkinleştirme ve ofis oluşturma dahil). Otorite kuralı
 *   update'in H2 kuralıyla AYNI yardımcıdır (assertActorIsAdminOrLinkedPartner).
 *
 * NEDEN "alan varsa" DEĞİL "ayrıcalıklı değer varsa": settings/office LawyerModal create'te dört
 *   alanı HER ZAMAN gönderir (page.tsx:1605-1611 varsayılanlar, 1632-1673 rütbe şablonları).
 *   Update'in "alan varsa" kuralı create'e aynen taşınsaydı delege UI'dan hiç avukat oluşturamazdı.
 *
 * `defaultPermissions` KURAL DIŞI: sunucuda yetki girdisi değildir — dosya yetkisi
 *   CaseLawyer.casePermissions'tan okunur (claim-item-write-gate, effective-permission-mapping);
 *   Lawyer.defaultPermissions sunucuda yalnız dava detayında GÖSTERİLİR (case.service findOne select).
 *
 * AUDIT: başarılı her oluşturma, avukat satırıyla AYNI transaction içinde tek LAWYER_CREATE
 *   kaydı yazar; audit yazılamazsa oluşturma kalıcılaşmaz. Kimlik/iletişim/banka verisi ve
 *   gövdenin tamamı audit'e GİRMEZ. İç çağıranlar (dosya içi avukat, seed) kaydı isteği yapan
 *   kullanıcıya YALNIZ atıf olarak bağlar; atıf yetki SAYILMAZ.
 */
import { BadRequestException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import 'reflect-metadata';
import { LawyerService } from '../lawyer.service';
import { CreateLawyerDto } from '../dto/create-lawyer.dto';
import { CaseService } from '../../case/case.service';
import { SeedService } from '../../seed/seed.service';
import { SeedController } from '../../seed/seed.controller';

const TENANT = 't1';

// lawyer-privileged-field-guard.spec.ts (update H2) ile aynı aktör fikstürleri.
const ADMIN = { userId: 'admin1', role: 'ADMIN' };
const PARTNER_ACTOR = { userId: 'p1', role: 'USER' };
const partnerUser = { tenantId: TENANT, isActive: true, lawyer: { lawyerRank: 'PARTNER' } };
// F01'den geçen ama PARTNER OLMAYAN aktörler: delege (AUTHORIZED + canApproveOfficeActions), MANAGER, personel.
const DELEGATE_ACTOR = { userId: 'd1', role: 'USER' };
const delegateUser = { tenantId: TENANT, isActive: true, lawyer: { lawyerRank: 'AUTHORIZED' } };
const MANAGER_ACTOR = { userId: 'm1', role: 'USER' };
const managerUser = { tenantId: TENANT, isActive: true, lawyer: { lawyerRank: 'MANAGER' } };
const STAFF_ACTOR = { userId: 's1', role: 'USER' };
const staffUser = { tenantId: TENANT, isActive: true, lawyer: null };

const MINIMAL = { name: 'Ada', surname: 'Lovelace' };

/**
 * Transaction'ı gerçekten modelleyen harness. `$transaction(fn)` fn'i bir SAHNE üzerinde koşar;
 * fn başarıyla dönerse sahne `committed`a aktarılır, fırlatırsa ATILIR (rollback).
 */
const build = (
  opts: { actorUser?: unknown; existing?: any[]; auditFails?: boolean; officeApproval?: any } = {},
) => {
  const committed: any[] = [];
  const txs: any[] = [];
  let seq = 0;
  const prisma: any = {
    lawyer: {
      findMany: jest.fn().mockResolvedValue(opts.existing ?? []),
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 3 } }),
      create: jest.fn(), // transaction DIŞI yazma — HİÇ çağrılmamalı
      update: jest.fn().mockResolvedValue({}),
    },
    office: {
      findUnique: jest.fn().mockResolvedValue({ id: 'O1' }),
      create: jest.fn(),
    },
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: TENANT, name: 'T' }) },
    user: { findUnique: jest.fn().mockResolvedValue(opts.actorUser ?? null) },
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => {
      const staged: any[] = [];
      const tx = {
        // AK-2 ARDIL: ofis al/oluştur adımı ARTIK bu transaction'ın İÇİNDE (eskiden tx dışındaydı;
        // tx geri alınınca ofis satırı kalıcı oluyordu). Fikstür bu yüzden tx'te de office/tenant taşır.
        // Yazma kanıtı `expectNoWrite`te $transaction'ın HİÇ çağrılmamasıyla kapanır.
        office: {
          findUnique: jest.fn().mockResolvedValue({ id: 'O1' }),
          create: jest.fn(),
        },
        tenant: { findUnique: jest.fn().mockResolvedValue({ id: TENANT, name: 'T' }) },
        lawyer: {
          create: jest.fn(async ({ data }: any) => {
            // Şema varsayılanları (LAWYER / false / false) — gönderilmeyen alan böyle yazılır.
            const row = {
              id: `L-${++seq}`,
              lawyerRank: 'LAWYER',
              canModifyOtherPermissions: false,
              permissionsLocked: false,
              ...data,
            };
            staged.push(row);
            return row;
          }),
        },
      };
      txs.push(tx);
      const out = await fn(tx); // fırlatırsa staged ATILIR → rollback
      committed.push(...staged);
      return out;
    }),
  };
  const audit: any = {
    log: jest.fn(),
    logInTransaction: jest.fn(async () => {
      if (opts.auditFails) throw new Error('AUDIT_WRITE_FAILED');
    }),
  };
  // Varsayılan officeApproval'da F01 fonksiyonu YOK → yanıt toPublicLawyer'dan geçer (id korunur).
  const officeApproval = opts.officeApproval ?? ({} as any);
  return { svc: new LawyerService(prisma, audit, officeApproval), prisma, audit, committed, txs };
};

/** Hiçbir yazma YAPILMADIĞINI kanıtlar (mükerrer etkinleştirme, ofis, transaction, audit). */
const expectNoWrite = (prisma: any, audit: any, committed: any[]) => {
  expect(prisma.lawyer.findMany).not.toHaveBeenCalled(); // kontrol mükerrer aramadan ÖNCE
  expect(prisma.lawyer.update).not.toHaveBeenCalled();
  expect(prisma.office.findUnique).not.toHaveBeenCalled();
  expect(prisma.office.create).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.lawyer.create).not.toHaveBeenCalled();
  expect(audit.logInTransaction).not.toHaveBeenCalled();
  expect(committed).toHaveLength(0);
};

const PRIVILEGED: Array<[string, Record<string, unknown>]> = [
  ['lawyerRank=PARTNER', { lawyerRank: 'PARTNER' }],
  ['lawyerRank=MANAGER', { lawyerRank: 'MANAGER' }],
  ['canModifyOtherPermissions=true', { canModifyOtherPermissions: true }],
  ['permissionsLocked=true', { permissionsLocked: true }],
];

describe('AK-2 — ayrıcalıklı değerle create: yetkisiz aktör 403, HİÇBİR yazma yok', () => {
  it.each(PRIVILEGED)('delege (AUTHORIZED) aktör, %s → 403', async (_label, extra) => {
    const { svc, prisma, audit, committed } = build({ actorUser: delegateUser });
    await expect(
      svc.create(TENANT, { ...MINIMAL, ...extra } as never, DELEGATE_ACTOR),
    ).rejects.toThrow(ForbiddenException);
    expectNoWrite(prisma, audit, committed);
  });

  it.each(PRIVILEGED)('MANAGER aktör (F01 aktörü, H2 otoritesi DEĞİL), %s → 403', async (_label, extra) => {
    const { svc, prisma, audit, committed } = build({ actorUser: managerUser });
    await expect(
      svc.create(TENANT, { ...MINIMAL, ...extra } as never, MANAGER_ACTOR),
    ).rejects.toThrow(ForbiddenException);
    expectNoWrite(prisma, audit, committed);
  });

  it('bağlı avukatı olmayan personel, lawyerRank=PARTNER → 403', async () => {
    const { svc, prisma, audit, committed } = build({ actorUser: staffUser });
    await expect(
      svc.create(TENANT, { ...MINIMAL, lawyerRank: 'PARTNER' } as never, STAFF_ACTOR),
    ).rejects.toThrow(ForbiddenException);
    expectNoWrite(prisma, audit, committed);
  });

  it("UI'nin PARTNER şablonu (dört alan birlikte) delege için 403 — hiçbiri sessizce düşürülmez", async () => {
    const { svc, prisma, audit, committed } = build({ actorUser: delegateUser });
    await expect(
      svc.create(
        TENANT,
        {
          ...MINIMAL,
          lawyerRank: 'PARTNER',
          canModifyOtherPermissions: true,
          permissionsLocked: false,
          defaultPermissions: { canEditCase: true, canEditFinance: true },
        } as never,
        DELEGATE_ACTOR,
      ),
    ).rejects.toThrow(ForbiddenException);
    expectNoWrite(prisma, audit, committed);
  });

  it('aktör YOK + ayrıcalıklı değer → 403 (update H2 ile simetrik; iç çağıran fail-closed)', async () => {
    const { svc, prisma, audit, committed } = build();
    await expect(
      svc.create(TENANT, { ...MINIMAL, lawyerRank: 'PARTNER' } as never),
    ).rejects.toThrow(ForbiddenException);
    expectNoWrite(prisma, audit, committed);
  });

  it('atıf yetki DEĞİLDİR: aktör yok + atıf + ayrıcalıklı değer → 403', async () => {
    const { svc, prisma, audit, committed } = build();
    await expect(
      svc.create(TENANT, { ...MINIMAL, lawyerRank: 'PARTNER' } as never, undefined, { userId: 'case-creator' }),
    ).rejects.toThrow(ForbiddenException);
    expectNoWrite(prisma, audit, committed);
  });

  it("başka tenant'ın PARTNER'ı → 403 (aynı tenant şartı)", async () => {
    const { svc, prisma, audit, committed } = build({ actorUser: { ...partnerUser, tenantId: 'other' } });
    await expect(
      svc.create(TENANT, { ...MINIMAL, lawyerRank: 'PARTNER' } as never, PARTNER_ACTOR),
    ).rejects.toThrow(ForbiddenException);
    expectNoWrite(prisma, audit, committed);
  });

  it('pasif PARTNER → 403', async () => {
    const { svc, prisma, audit, committed } = build({ actorUser: { ...partnerUser, isActive: false } });
    await expect(
      svc.create(TENANT, { ...MINIMAL, lawyerRank: 'MANAGER' } as never, PARTNER_ACTOR),
    ).rejects.toThrow(ForbiddenException);
    expectNoWrite(prisma, audit, committed);
  });

  it('mükerrer kayıt varken bile 403: ayrıcalıklı değer SESSİZCE düşürülmez, pasif kayıt etkinleştirilmez', async () => {
    const { svc, prisma, audit, committed } = build({
      actorUser: delegateUser,
      existing: [{ id: 'L-old', name: 'Ada', surname: 'Lovelace', isActive: false, tenantId: TENANT }],
    });
    await expect(
      svc.create(TENANT, { ...MINIMAL, lawyerRank: 'PARTNER' } as never, DELEGATE_ACTOR),
    ).rejects.toThrow(ForbiddenException);
    expectNoWrite(prisma, audit, committed);
  });

  it('ret mesajı atama bağlamını söyler', async () => {
    const { svc } = build({ actorUser: delegateUser });
    await expect(
      svc.create(TENANT, { ...MINIMAL, lawyerRank: 'PARTNER' } as never, DELEGATE_ACTOR),
    ).rejects.toThrow(/atanabilir/);
  });
});

// settings/office LawyerModal gövdeleri — UI bunları HER create'te gönderir.
// Şablonlar handleRankChange (page.tsx:1652-1669); "form varsayılanı" rütbe hiç seçilmeden (1605-1619).
const UI_TEMPLATES: Array<[string, Record<string, unknown>]> = [
  ['LAWYER (form varsayılanı)', {
    lawyerRank: 'LAWYER', canModifyOtherPermissions: false, permissionsLocked: false, canApproveOfficeActions: false,
    defaultPermissions: { canEditCase: true, canGenerateDocs: true, canSyncUYAP: false, canViewFinance: true, canEditFinance: false, canChangeStatus: false, canEditParties: false },
  }],
  ['LAWYER', {
    lawyerRank: 'LAWYER', canModifyOtherPermissions: false, permissionsLocked: false,
    defaultPermissions: { canEditCase: true, canGenerateDocs: true, canSyncUYAP: false, canViewFinance: false, canEditFinance: false, canChangeStatus: false, canEditParties: false },
  }],
  ['AUTHORIZED', {
    lawyerRank: 'AUTHORIZED', canModifyOtherPermissions: false, permissionsLocked: false,
    defaultPermissions: { canEditCase: true, canGenerateDocs: true, canSyncUYAP: false, canViewFinance: true, canEditFinance: false, canChangeStatus: false, canEditParties: false },
  }],
  ['INTERN', {
    lawyerRank: 'INTERN', canModifyOtherPermissions: false, permissionsLocked: false,
    defaultPermissions: { canEditCase: false, canGenerateDocs: true, canSyncUYAP: false, canViewFinance: false, canEditFinance: false, canChangeStatus: false, canEditParties: false },
  }],
];

describe('AK-2 — normal şablonlar çalışmaya DEVAM eder', () => {
  it.each(UI_TEMPLATES)('delege, UI %s gövdesiyle oluşturur; H2 kullanıcı sorgusu YAPILMAZ', async (_rank, tpl) => {
    const { svc, prisma, committed } = build({ actorUser: delegateUser });
    const res: any = await svc.create(TENANT, { ...MINIMAL, ...tpl } as never, DELEGATE_ACTOR);
    expect(committed).toHaveLength(1);
    expect(committed[0].lawyerRank).toBe(tpl.lawyerRank);
    expect(committed[0].defaultPermissions).toEqual(tpl.defaultPermissions);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(res.id).toBe(committed[0].id);
  });

  it('rütbe gönderilmezse şema varsayılanı (LAWYER) ayrıcalıksızdır → oluşturulur', async () => {
    const { svc, committed } = build({ actorUser: delegateUser });
    await svc.create(TENANT, MINIMAL as never, DELEGATE_ACTOR);
    expect(committed).toHaveLength(1);
    expect(committed[0].lawyerRank).toBe('LAWYER');
  });

  it('defaultPermissions tam finans yetkisiyle gelse bile kural DIŞIDIR (sunucuda yetki girdisi değil)', async () => {
    const { svc, committed } = build({ actorUser: delegateUser });
    const dp = { canEditCase: true, canViewFinance: true, canEditFinance: true, canChangeStatus: true };
    await svc.create(TENANT, { ...MINIMAL, lawyerRank: 'AUTHORIZED', defaultPermissions: dp } as never, DELEGATE_ACTOR);
    expect(committed).toHaveLength(1);
    expect(committed[0].defaultPermissions).toEqual(dp);
  });

  it('mükerrer dal DEĞİŞMEDİ: normal şablon + mevcut kayıt → mevcut döner, oluşturma ve audit YOK', async () => {
    const { svc, prisma, audit, committed } = build({
      actorUser: delegateUser,
      existing: [{ id: 'L-old', name: 'Ada', surname: 'Lovelace', isActive: true, tenantId: TENANT }],
    });
    const res: any = await svc.create(TENANT, { ...MINIMAL, lawyerRank: 'LAWYER' } as never, DELEGATE_ACTOR);
    expect(res._existingReturned).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
    expect(committed).toHaveLength(0);
  });
});

describe('AK-2 — yetkili yol: ADMIN ve bağlı PARTNER', () => {
  it('ADMIN → PARTNER + canModify + locked ile oluşturur; kullanıcı sorgusu YAPILMAZ (ADMIN kısa yolu)', async () => {
    const { svc, prisma, committed } = build();
    await svc.create(
      TENANT,
      { ...MINIMAL, lawyerRank: 'PARTNER', canModifyOtherPermissions: true, permissionsLocked: true } as never,
      ADMIN,
    );
    expect(committed).toHaveLength(1);
    expect(committed[0]).toMatchObject({ lawyerRank: 'PARTNER', canModifyOtherPermissions: true, permissionsLocked: true });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("aynı tenant'a bağlı aktif PARTNER → MANAGER oluşturur", async () => {
    const { svc, prisma, committed } = build({ actorUser: partnerUser });
    await svc.create(TENANT, { ...MINIMAL, lawyerRank: 'MANAGER' } as never, PARTNER_ACTOR);
    expect(committed).toHaveLength(1);
    expect(committed[0].lawyerRank).toBe('MANAGER');
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('AK-2 — audit: tek kayıt, aynı transaction, atomik', () => {
  it('başarılı oluşturma TAM BİR LAWYER_CREATE yazar; gerçek aktör + USER; avukatla AYNI transaction', async () => {
    const { svc, prisma, audit, txs, committed } = build({ actorUser: partnerUser });
    await svc.create(TENANT, { ...MINIMAL, lawyerRank: 'MANAGER' } as never, PARTNER_ACTOR);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(audit.logInTransaction).toHaveBeenCalledTimes(1);
    const [txSeen, entry] = audit.logInTransaction.mock.calls[0];
    expect(txSeen).toBe(txs[0]); // avukat satırının yazıldığı transaction'ın KENDİSİ
    expect(txs[0].lawyer.create).toHaveBeenCalledTimes(1);
    expect(entry).toMatchObject({
      tenantId: TENANT,
      action: 'LAWYER_CREATE',
      entityType: 'LAWYER',
      entityId: committed[0].id,
      userId: 'p1',
      actorType: 'USER',
      metadata: { lawyerRank: 'MANAGER', canModifyOtherPermissions: false, permissionsLocked: false },
    });
    expect(audit.log).not.toHaveBeenCalled(); // transaction DIŞI audit yolu kullanılmaz
  });

  it('audit kimlik/iletişim/banka verisini ve gövdenin tamamını TAŞIMAZ', async () => {
    const { svc, audit } = build();
    await svc.create(
      TENANT,
      {
        name: 'Ada', surname: 'Lovelace', tckn: '12345678901', email: 'ada@ornek.test',
        iban: 'TR330006100519786457841326', phone: '05320000000', barNumber: 'B-77',
        address: 'Gizli Sokak', defaultPermissions: { canEditFinance: true },
      } as never,
      ADMIN,
    );
    const entry = audit.logInTransaction.mock.calls[0][1];
    const serialized = JSON.stringify(entry);
    for (const secret of ['12345678901', 'ada@ornek.test', 'TR330006100519786457841326', '05320000000', 'B-77', 'Gizli Sokak', 'Lovelace', 'canEditFinance']) {
      expect(serialized).not.toContain(secret);
    }
    expect(Object.keys(entry.metadata).sort()).toEqual(['canModifyOtherPermissions', 'lawyerRank', 'permissionsLocked']);
  });

  it('audit yazılamazsa oluşturma KALICILAŞMAZ (rollback) ve hata çağırana ulaşır', async () => {
    const { svc, prisma, txs, committed } = build({ auditFails: true });
    await expect(svc.create(TENANT, MINIMAL as never, ADMIN)).rejects.toThrow('AUDIT_WRITE_FAILED');
    expect(txs[0].lawyer.create).toHaveBeenCalledTimes(1); // satır sahnelendi...
    expect(committed).toHaveLength(0); // ...ama kalıcılaşmadı
    expect(prisma.lawyer.create).not.toHaveBeenCalled(); // transaction dışı yedek yazma YOK
  });

  it('avukat satırı transaction DIŞINDA yazılmaz', async () => {
    const { svc, prisma, committed } = build();
    await svc.create(TENANT, MINIMAL as never, ADMIN);
    expect(prisma.lawyer.create).not.toHaveBeenCalled();
    expect(committed).toHaveLength(1);
  });

  it('atıf: audit gerçek kullanıcıya bağlanır; yanıt ve yetki değişmez', async () => {
    const { svc, prisma, audit, committed } = build();
    const res: any = await svc.create(TENANT, MINIMAL as never, undefined, { userId: 'case-creator' });
    expect(committed).toHaveLength(1);
    expect(res.id).toBe(committed[0].id); // projeksiyon aktörsüz → id KORUNUR
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(audit.logInTransaction.mock.calls[0][1]).toMatchObject({ userId: 'case-creator', actorType: 'USER' });
  });

  it('aktör ve atıf yok (iç sistem çağrısı) → actorType SYSTEM, userId YOK', async () => {
    const { svc, audit } = build();
    await svc.create(TENANT, MINIMAL as never);
    const entry = audit.logInTransaction.mock.calls[0][1];
    expect(entry.actorType).toBe('SYSTEM');
    expect(entry.userId).toBeUndefined();
  });
});

describe('AK-2 — atıf zinciri: iç çağıranlarda audit isteği yapan GERÇEK kullanıcıya bağlanır', () => {
  it('dosya içi avukat (POST /cases): atıf dosyayı açan kullanıcı; yetki aktörü GEÇİLMEZ → id korunur', async () => {
    // Dosyayı açan kullanıcı F01-YETKİSİZ: aktör geçilseydi yanıt PUBLIC_S0_ONLY olur ve `id` DÜŞERDİ.
    const f01 = { isF01ActorAuthorized: jest.fn().mockResolvedValue(false) };
    const { svc: lawyerSvc, audit, committed } = build({ officeApproval: f01 });
    const caseSvc: any = Object.create(CaseService.prototype);
    caseSvc.lawyerService = lawyerSvc;
    const dto: any = { lawyers: [{ name: 'Inline', surname: 'Avukat', barNumber: 'B-9' }] };
    await caseSvc.resolveInlinePartiesInTx(TENANT, dto, { userId: 'u-case', tenantId: TENANT, role: 'USER' });
    expect(committed).toHaveLength(1);
    expect(dto.lawyers[0].id).toBe(committed[0].id); // inline bağ korunur
    expect(f01.isF01ActorAuthorized).not.toHaveBeenCalled(); // projeksiyon aktörsüz → F01'e hiç gidilmez
    expect(audit.logInTransaction.mock.calls[0][1]).toMatchObject({ userId: 'u-case', actorType: 'USER' });
  });

  it('dosya içi avukat: boş kullanıcı kimliği atıf sayılmaz → SYSTEM', async () => {
    const { svc: lawyerSvc, audit } = build();
    const caseSvc: any = Object.create(CaseService.prototype);
    caseSvc.lawyerService = lawyerSvc;
    await caseSvc.resolveInlinePartiesInTx(TENANT, { lawyers: [{ name: 'X', surname: 'Y' }] }, { userId: '', tenantId: TENANT, role: 'USER' });
    expect(audit.logInTransaction.mock.calls[0][1]).toMatchObject({ actorType: 'SYSTEM' });
    expect(audit.logInTransaction.mock.calls[0][1].userId).toBeUndefined();
  });

  it("seedLawyers: 10 kaydın her biri başlatan kullanıcıya bağlı audit alır; eski role 'PARTNER' rütbe DEĞİL → H2 tetiklenmez", async () => {
    const { svc: lawyerSvc, prisma, audit, committed } = build();
    const seed = new SeedService({} as any, { log: jest.fn(), logInTransaction: jest.fn() } as any, {} as any, undefined, lawyerSvc);
    const res: any = await seed.seedLawyers(TENANT, { userId: 'u-seed' });
    expect(res.created).toBe(10);
    expect(committed).toHaveLength(10);
    expect(committed.every((r) => r.lawyerRank === 'LAWYER')).toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(audit.logInTransaction).toHaveBeenCalledTimes(10);
    for (const [, entry] of audit.logInTransaction.mock.calls) {
      expect(entry).toMatchObject({ action: 'LAWYER_CREATE', userId: 'u-seed', actorType: 'USER' });
    }
  });

  it('seedAll: avukat adımı elevated aktörün kullanıcı kimliğini atıf olarak alır', async () => {
    const clientService = { assertCanRunElevatedClientBulkOperation: jest.fn().mockResolvedValue(undefined) } as any;
    const seed = new SeedService({} as any, { log: jest.fn(), logInTransaction: jest.fn() } as any, clientService);
    jest.spyOn(seed, 'seedOffice').mockResolvedValue({ created: 0 } as any);
    jest.spyOn(seed, 'seedBankAccounts').mockResolvedValue({ created: 0 } as any);
    jest.spyOn(seed, 'seedLookups').mockResolvedValue({} as any);
    const lawyersSpy = jest.spyOn(seed, 'seedLawyers').mockResolvedValue({ created: 0 } as any);
    jest.spyOn(seed, 'seedStaff').mockResolvedValue({ created: 0 } as any);
    jest.spyOn(seed, 'seedClients').mockResolvedValue({ created: 0, failed: 0 } as any);
    jest.spyOn(seed, 'seedDebtors').mockResolvedValue({ created: 0 } as any);
    jest.spyOn(seed, 'seedExecutionOffices').mockResolvedValue({ created: 0 } as any);
    jest.spyOn(seed, 'seedCases').mockResolvedValue({ created: 0 } as any);
    jest.spyOn(seed, 'seedPublicInstitutions').mockResolvedValue({ created: 0, skipped: 0 } as any);
    jest.spyOn(seed, 'seedPublicInstitutionDebtors').mockResolvedValue({ created: 0, skipped: 0 } as any);

    await seed.seedAll(TENANT, { userId: 'u-all', tenantId: TENANT, role: 'USER' } as any);

    expect(lawyersSpy).toHaveBeenCalledWith(TENANT, { userId: 'u-all' });
  });

  it('POST /seed/lawyers: kontrolcü isteği yapan kullanıcının kimliğini atıf olarak geçirir', async () => {
    const seedService = { seedLawyers: jest.fn().mockResolvedValue({ created: 0 }) } as any;
    await new SeedController(seedService).seedLawyers({ user: { id: 'u-ctl', tenantId: TENANT, role: 'USER' } });
    expect(seedService.seedLawyers).toHaveBeenCalledWith(TENANT, { userId: 'u-ctl' });
  });
});

describe('AK-2 — update davranışı DEĞİŞMEDİ', () => {
  const buildUpdate = (actorUser: unknown) => {
    const self = {
      id: 'L1', name: 'Ada', surname: 'Lovelace', tckn: null, barNumber: null,
      isActive: true, tenantId: TENANT, lawyerRank: 'LAWYER', canModifyOtherPermissions: false,
    };
    const prisma: any = {
      lawyer: {
        findFirst: jest.fn().mockResolvedValue(self),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...self, ...data })),
      },
      user: { findUnique: jest.fn().mockResolvedValue(actorUser) },
    };
    return { svc: new LawyerService(prisma, { log: jest.fn() } as any, {} as any), prisma };
  };

  it('update "alan varsa" kuralı korunur: delege lawyerRank=LAWYER (varsayılan değer) göndermek bile 403', async () => {
    const { svc, prisma } = buildUpdate(delegateUser);
    await expect(
      svc.update(TENANT, 'L1', { lawyerRank: 'LAWYER' } as never, DELEGATE_ACTOR),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });

  it("karşılaştırma: aynı değer create'te ayrıcalıksızdır, update'te H2 ister", async () => {
    const created = build({ actorUser: delegateUser });
    await created.svc.create(TENANT, { ...MINIMAL, lawyerRank: 'LAWYER' } as never, DELEGATE_ACTOR);
    expect(created.committed).toHaveLength(1);
    const { svc } = buildUpdate(delegateUser);
    await expect(
      svc.update(TENANT, 'L1', { lawyerRank: 'LAWYER' } as never, DELEGATE_ACTOR),
    ).rejects.toThrow(ForbiddenException);
  });

  it('ADMIN update yolu etkilenmez: rütbe değişikliği tek update ile yazılır', async () => {
    const { svc, prisma } = buildUpdate(null);
    await svc.update(TENANT, 'L1', { lawyerRank: 'PARTNER' } as never, ADMIN);
    expect(prisma.lawyer.update).toHaveBeenCalledTimes(1);
    expect(prisma.lawyer.update.mock.calls[0][0].data.lawyerRank).toBe('PARTNER');
  });
});

describe('AK-2 — kontrol SUNUCUDA; DTO yalnız tip doğrular', () => {
  // main.ts:21-25 ile AYNI seçenekler — global pipe'ın birebir aynası.
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const body = { type: 'body' as const, metatype: CreateLawyerDto };

  it("lawyerRank=PARTNER içeren UI gövdesi global pipe'tan GEÇER — ret DTO'da değil serviste", async () => {
    const out: any = await pipe.transform(
      { ...MINIMAL, lawyerRank: 'PARTNER', canModifyOtherPermissions: true, permissionsLocked: false, canApproveOfficeActions: false },
      body,
    );
    expect(out.lawyerRank).toBe('PARTNER');
    expect(out.canModifyOtherPermissions).toBe(true);
  });

  it('permissionsLocked: "true" (metin) DTO\'da 400 — örtük dönüşüm yok, metin boolean sayılmaz', async () => {
    await expect(pipe.transform({ ...MINIMAL, permissionsLocked: 'true' }, body)).rejects.toThrow(BadRequestException);
  });
});
