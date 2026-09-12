/**
 * AK-1a — VIEWER için OFFICE SALT-OKUMA sınırı (owner GO 2026-09-10) — birim düzeyi.
 *
 * Tek ortak yüklem (VIEWER OFFICE'e yazamaz) üç giriş sınıfında uygulanır; OKUMA değişmez:
 *   1. F01 yazma rotaları — guard HTTP fiilinden niyeti okur; yazmada `isF01WriteActorAuthorized` (DB rolü).
 *   2. POST /cases dosya içi avukat — avukat tarafı YETKİ reddi (VIEWER ve AK-2 pasif ayrıcalıklı eşleşme)
 *      İLK kalıcı yazmadan, yani inline müvekkil yazılmadan ÖNCE verilir (genel transaction refactor'ı DEĞİL).
 *   3. seed OFFICE uçları — lawyers / staff / office / bank-accounts / fix-lawyers.
 * seedAll zaten CLIENT toplu-işlem politikasıyla VIEWER'ı reddeder; burada GERÇEK kapıyla gösterilir.
 * AK-1b/1c ve ayrıcalıksız avukatın yaşam döngüsü politikası bu işte DEĞİŞMEZ.
 */
import { ForbiddenException } from '@nestjs/common';
import 'reflect-metadata';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { OfficeF01AuthorizationGuard } from '../../office-approval/office-f01-authorization.guard';
import { LawyerService } from '../../lawyer/lawyer.service';
import { CaseService } from '../../case/case.service';
import { SeedController } from '../../seed/seed.controller';
import { SeedService } from '../../seed/seed.service';
import { ClientService, buildClientMutationActor } from '../../client/client.service';

const TENANT = 't1';
const OFFICE = 'o1';

/** Reddin kodunu (ya da mesajını) okur; çözülürse 'RESOLVED'. */
const outcome = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'RESOLVED';
  } catch (e: any) {
    const r = typeof e?.getResponse === 'function' ? e.getResponse() : undefined;
    if (r && typeof r === 'object') return (r as any).code ?? (r as any).message ?? String(e);
    return typeof r === 'string' ? r : String(e?.message ?? e);
  }
};

const lawyerLink = (over: Record<string, unknown> = {}) => ({
  officeId: OFFICE,
  lawyerRank: 'LAWYER',
  canApproveOfficeActions: false,
  ...over,
});
const dbUser = (role: string, lawyer: unknown, over: Record<string, unknown> = {}) => ({
  role,
  isActive: true,
  tenantId: TENANT,
  staffMember: null,
  lawyer,
  ...over,
});
const approvalFor = (user: unknown) =>
  new OfficeApprovalService({ user: { findUnique: jest.fn().mockResolvedValue(user) } } as any, { log: jest.fn() } as any);

const LINKED: Array<[string, unknown]> = [
  ['PARTNER', lawyerLink({ lawyerRank: 'PARTNER' })],
  ['MANAGER', lawyerLink({ lawyerRank: 'MANAGER' })],
  ['delege (canApproveOfficeActions)', lawyerLink({ lawyerRank: 'AUTHORIZED', canApproveOfficeActions: true })],
];

describe('AK-1a — F01 yüklemi: OKUMA değişmez, YAZMA VIEWER\'ı eler', () => {
  it.each(LINKED)('VIEWER + %s: okuma TRUE (değişmedi), yazma FALSE', async (_l, lawyer) => {
    const s = approvalFor(dbUser('VIEWER', lawyer));
    await expect(s.isF01ActorAuthorized('u', TENANT, OFFICE)).resolves.toBe(true);
    await expect((s as any).isF01WriteActorAuthorized('u', TENANT, OFFICE)).resolves.toBe(false);
  });

  it.each(LINKED)('USER + %s: yazma TRUE (değişmedi)', async (_l, lawyer) => {
    await expect((approvalFor(dbUser('USER', lawyer)) as any).isF01WriteActorAuthorized('u', TENANT, OFFICE)).resolves.toBe(true);
  });

  it('ADMIN (avukat bağı yok): yazma TRUE (değişmedi)', async () => {
    await expect((approvalFor(dbUser('ADMIN', null)) as any).isF01WriteActorAuthorized('u', TENANT, OFFICE)).resolves.toBe(true);
  });

  it('bağsız VIEWER: okuma da yazma da FALSE (değişmedi)', async () => {
    const s = approvalFor(dbUser('VIEWER', null));
    await expect(s.isF01ActorAuthorized('u', TENANT, OFFICE)).resolves.toBe(false);
    await expect((s as any).isF01WriteActorAuthorized('u', TENANT, OFFICE)).resolves.toBe(false);
  });

  it('personel / pasif / başka tenant: yazma FALSE (değişmedi)', async () => {
    const staff = dbUser('USER', lawyerLink({ lawyerRank: 'MANAGER' }), { staffMember: { id: 's1', officeId: OFFICE } });
    await expect((approvalFor(staff) as any).isF01WriteActorAuthorized('u', TENANT, OFFICE)).resolves.toBe(false);
    await expect((approvalFor(dbUser('ADMIN', null, { isActive: false })) as any).isF01WriteActorAuthorized('u', TENANT)).resolves.toBe(false);
    await expect((approvalFor(dbUser('ADMIN', null, { tenantId: 'other' })) as any).isF01WriteActorAuthorized('u', TENANT)).resolves.toBe(false);
  });
});

describe('AK-1a — guard niyeti HTTP fiilinden okur', () => {
  const run = (db: unknown, method: string | undefined, reqRole: string) => {
    const guard = new OfficeF01AuthorizationGuard(approvalFor(db));
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ method, user: { id: 'u', tenantId: TENANT, role: reqRole } }) }) } as any;
    return guard.canActivate(ctx);
  };
  const viewerPartner = dbUser('VIEWER', lawyerLink({ lawyerRank: 'PARTNER' }));

  it.each(['GET', 'HEAD', 'OPTIONS', 'get'])('%s OKUMADIR: bağlı VIEWER geçer (değişmedi)', async (m) => {
    await expect(run(viewerPartner, m, 'VIEWER')).resolves.toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s YAZMADIR: bağlı VIEWER → 403 OFFICE_WRITE_DENIED_VIEWER', async (m) => {
    expect(await outcome(run(viewerPartner, m, 'VIEWER'))).toBe('OFFICE_WRITE_DENIED_VIEWER');
  });

  it('yöntemi bilinmeyen istek YAZMA sayılır (fail-closed)', async () => {
    expect(await outcome(run(viewerPartner, undefined, 'VIEWER'))).toBe('OFFICE_WRITE_DENIED_VIEWER');
  });

  it('yetki kaynağı DB rolüdür: istek USER derken DB VIEWER ise yazma reddedilir', async () => {
    expect(await outcome(run(viewerPartner, 'PUT', 'USER'))).toBe('OFFICE_F01_AUTHORIZATION_REQUIRED');
  });

  it.each(LINKED)('USER + %s: POST geçer (değişmedi)', async (_l, lawyer) => {
    await expect(run(dbUser('USER', lawyer), 'POST', 'USER')).resolves.toBe(true);
  });
});

describe('AK-1a — POST /cases: avukat yetki reddi İLK kalıcı yazmadan ÖNCE', () => {
  const viewer = buildClientMutationActor({ userId: 'v1', tenantId: TENANT, role: 'VIEWER' });
  const user = buildClientMutationActor({ userId: 'u1', tenantId: TENANT, role: 'USER' });
  const buildCase = (lawyerService: unknown) => {
    const caseSvc: any = Object.create(CaseService.prototype);
    caseSvc.clientService = { create: jest.fn(async () => ({ id: 'c-new' })) };
    caseSvc.lawyerService = lawyerService;
    caseSvc.debtorService = { create: jest.fn() };
    return caseSvc;
  };
  const lawyerMock = () => ({ create: jest.fn(async () => ({ id: 'l-new' })), assertCreateAuthorized: jest.fn(async () => undefined) });
  // Her testte TAZE nesne: adım 1 inline müvekkile `c.id` yazar; paylaşılan fikstür sonraki testlerde adımı
  // sessizce atlatır ve sıra testini KÖR bırakır (bu tuzak değişmemiş kodda RED koşusunda yakalandı).
  let INLINE_CREDITOR: Record<string, unknown>;
  beforeEach(() => {
    INLINE_CREDITOR = { type: 'INDIVIDUAL', name: 'Ahmet Yilmaz', identityNo: '10000000146' };
  });

  it('VIEWER + dosya içi yeni avukat → 403 OFFICE_WRITE_DENIED_VIEWER; avukat yazılmaz', async () => {
    const ls = lawyerMock();
    const svc = buildCase(ls);
    const dto: any = { lawyers: [{ name: 'Ayse', surname: 'Kaya' }] };
    expect(await outcome(svc.resolveInlinePartiesBeforeTx(TENANT, dto, viewer))).toBe('OFFICE_WRITE_DENIED_VIEWER');
    expect(ls.create).not.toHaveBeenCalled();
  });

  it('VIEWER + inline müvekkil + dosya içi avukat → ret müvekkil YAZILMADAN önce', async () => {
    const ls = lawyerMock();
    const svc = buildCase(ls);
    const dto: any = { creditors: [INLINE_CREDITOR], lawyers: [{ name: 'Ayse', surname: 'Kaya' }] };
    expect(await outcome(svc.resolveInlinePartiesBeforeTx(TENANT, dto, viewer))).toBe('OFFICE_WRITE_DENIED_VIEWER');
    expect(svc.clientService.create).not.toHaveBeenCalled();
    expect(ls.create).not.toHaveBeenCalled();
  });

  it('USER + inline müvekkil + pasif PARTNER eşleşmesi (AK-2) → 403, müvekkil YAZILMADAN önce', async () => {
    const prisma: any = {
      lawyer: {
        findMany: jest.fn(async () => [
          {
            id: 'L-P', tenantId: TENANT, name: 'Ayse', surname: 'Kaya', barNumber: 'B-1', tckn: null,
            isActive: false, lawyerRank: 'PARTNER', canModifyOtherPermissions: false, permissionsLocked: false,
            canApproveOfficeActions: false,
          },
        ]),
        update: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      office: { findUnique: jest.fn(), create: jest.fn() },
      user: { findUnique: jest.fn(async () => null) },
      $transaction: jest.fn(),
    };
    const realLawyer = new LawyerService(prisma, { log: jest.fn(), logInTransaction: jest.fn() } as any, {} as any);
    const svc = buildCase(realLawyer);
    const dto: any = { creditors: [INLINE_CREDITOR], lawyers: [{ name: 'Ayse', surname: 'Kaya' }] };
    await expect(svc.resolveInlinePartiesBeforeTx(TENANT, dto, user)).rejects.toThrow(ForbiddenException);
    expect(svc.clientService.create).not.toHaveBeenCalled(); // ilk kalıcı yazma YAPILMADI
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });

  // ARDIL (owner GO 2026-09-12 "OFFICE — KALAN İŞTEN DEVAM"; kayıtlı açık: `/cases` ön kontrol yarışı):
  // SIRA DEĞİŞTİ — inline avukat create'i artık inline MÜVEKKİL yazmasından ÖNCE gelir. Gerekçe: adım 0
  // ön kontrolü ile create arasında eşleşen kayıt ayrıcalıklı hale gelirse create yine 403 verir
  // (fail-closed), ama ESKİ sırada o ana dek müvekkil YAZILMIŞ oluyordu → sahipsiz müvekkil satırı.
  // AK-1a'nın "yetki reddi İLK kalıcı yazmadan ÖNCE" güvencesi DEĞİŞMEDİ (yukarıdaki 403 testleri aynen geçer).
  it('USER + inline müvekkil + ayrıcalıksız yeni avukat → ikisi de oluşur; AVUKAT ÖNCE (yarış kapandı)', async () => {
    const ls = lawyerMock();
    const svc = buildCase(ls);
    const dto: any = { creditors: [INLINE_CREDITOR], lawyers: [{ name: 'Ayse', surname: 'Kaya' }] };
    await svc.resolveInlinePartiesBeforeTx(TENANT, dto, user);
    expect(svc.clientService.create).toHaveBeenCalledTimes(1);
    expect(ls.create).toHaveBeenCalledTimes(1);
    expect(ls.create.mock.invocationCallOrder[0]).toBeLessThan(svc.clientService.create.mock.invocationCallOrder[0]);
    expect(dto.lawyers[0].id).toBe('l-new');
  });

  it('OFFICE yazması yoksa (yalnız mevcut avukat id) bu ön kontrol devreye GİRMEZ', async () => {
    const ls = lawyerMock();
    const svc = buildCase(ls);
    await svc.resolveInlinePartiesBeforeTx(TENANT, { lawyers: [{ id: 'L-1' }] }, viewer);
    expect(ls.create).not.toHaveBeenCalled();
    expect(ls.assertCreateAuthorized).not.toHaveBeenCalled();
  });
});

describe('AK-1a — seed OFFICE uçları VIEWER\'a kapalı', () => {
  const ROUTES: Array<[string, string]> = [
    ['seedLawyers', 'seedLawyers'],
    ['seedStaff', 'seedStaff'],
    ['seedOffice', 'seedOffice'],
    ['seedBankAccounts', 'seedBankAccounts'],
    ['fixLawyers', 'fixExistingLawyers'],
  ];
  const build = () => {
    const seedService: any = {};
    for (const [, svcMethod] of ROUTES) seedService[svcMethod] = jest.fn(async () => ({ created: 0 }));
    return { ctl: new SeedController(seedService), seedService };
  };
  const req = (role: string) => ({ user: { id: 'u1', tenantId: TENANT, role } });

  it.each(ROUTES)('VIEWER POST /seed → %s: 403 OFFICE_WRITE_DENIED_VIEWER, servis çağrılmaz', async (route, svcMethod) => {
    const { ctl, seedService } = build();
    expect(await outcome((ctl as any)[route](req('VIEWER')))).toBe('OFFICE_WRITE_DENIED_VIEWER');
    expect(seedService[svcMethod]).not.toHaveBeenCalled();
  });

  it.each(ROUTES.flatMap(([route, svcMethod]) => [['USER', route, svcMethod], ['ADMIN', route, svcMethod]]))(
    '%s → %s çağrılır (değişmedi)',
    async (role, route, svcMethod) => {
      const { ctl, seedService } = build();
      await (ctl as any)[route](req(role));
      expect(seedService[svcMethod]).toHaveBeenCalledTimes(1);
    },
  );
});

describe('AK-1a — seedAll VIEWER\'ı ZATEN reddeder (gerçek CLIENT toplu-işlem kapısı)', () => {
  const STEPS = [
    'seedOffice', 'seedBankAccounts', 'seedLookups', 'seedLawyers', 'seedStaff', 'seedClients',
    'seedDebtors', 'seedExecutionOffices', 'seedCases', 'seedPublicInstitutions', 'seedPublicInstitutionDebtors',
  ];
  const build = () => {
    const client: any = Object.create(ClientService.prototype);
    // Bağlı avukatı PARTNER olan VIEWER: onay yetkisi (elevated) TRUE döner — kapı yine de rolü eler.
    client.officeApproval = { isApproverEligible: jest.fn(async () => true) };
    const seed = new SeedService({} as any, { log: jest.fn(), logInTransaction: jest.fn() } as any, client);
    const spies = STEPS.map((m) => jest.spyOn(seed as any, m).mockResolvedValue({ created: 0, skipped: 0, failed: 0 }));
    return { seed, spies };
  };

  it('VIEWER (elevated TRUE) → 403 CLIENT_MUTATION_DENIED_VIEWER; HİÇBİR adım çalışmaz', async () => {
    const { seed, spies } = build();
    expect(await outcome(seed.seedAll(TENANT, { userId: 'v1', tenantId: TENANT, role: 'VIEWER' } as any))).toBe(
      'CLIENT_MUTATION_DENIED_VIEWER',
    );
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it('USER (elevated TRUE) → adımlar çalışır (izinli aktör, değişmedi)', async () => {
    const { seed, spies } = build();
    await seed.seedAll(TENANT, { userId: 'u1', tenantId: TENANT, role: 'USER' } as any);
    for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
  });
});

describe('AK-1a/AK-2 — LawyerService.assertCreateAuthorized: yazmasız ön kontrol', () => {
  const build = (rows: any[]) => {
    const prisma: any = {
      lawyer: { findMany: jest.fn(async () => rows), update: jest.fn(), create: jest.fn(), aggregate: jest.fn() },
      office: { findUnique: jest.fn(), create: jest.fn() },
      user: { findUnique: jest.fn(async () => null) },
      $transaction: jest.fn(),
    };
    return { svc: new LawyerService(prisma, { log: jest.fn(), logInTransaction: jest.fn() } as any, {} as any), prisma };
  };
  const passive = (over: Record<string, unknown>) => ({
    id: 'L-X', tenantId: TENANT, name: 'Ayse', surname: 'Kaya', barNumber: null, tckn: null, isActive: false,
    lawyerRank: 'LAWYER', canModifyOtherPermissions: false, permissionsLocked: false, canApproveOfficeActions: false, ...over,
  });
  const noWrite = (prisma: any) => {
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
    expect(prisma.lawyer.create).not.toHaveBeenCalled();
    expect(prisma.office.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  };
  const DATA = { name: 'Ayse', surname: 'Kaya' };

  it('aktörsüz + pasif PARTNER eşleşmesi → 403; yazma YOK', async () => {
    const { svc, prisma } = build([passive({ lawyerRank: 'PARTNER' })]);
    await expect((svc as any).assertCreateAuthorized(TENANT, DATA)).rejects.toThrow(ForbiddenException);
    noWrite(prisma);
  });

  it('aktörsüz + ayrıcalıklı istek değeri → 403; yazma YOK', async () => {
    const { svc, prisma } = build([]);
    await expect((svc as any).assertCreateAuthorized(TENANT, { ...DATA, lawyerRank: 'MANAGER' })).rejects.toThrow(ForbiddenException);
    noWrite(prisma);
  });

  it('ayrıcalıksız pasif eşleşme / eşleşme yok → geçer; yazma YOK', async () => {
    const a = build([passive({})]);
    await expect((a.svc as any).assertCreateAuthorized(TENANT, DATA)).resolves.toBeUndefined();
    noWrite(a.prisma);
    const b = build([]);
    await expect((b.svc as any).assertCreateAuthorized(TENANT, DATA)).resolves.toBeUndefined();
    noWrite(b.prisma);
  });

  it('ADMIN aktörle pasif PARTNER eşleşmesi → geçer (H2); yazma YOK', async () => {
    const { svc, prisma } = build([passive({ lawyerRank: 'PARTNER' })]);
    await expect((svc as any).assertCreateAuthorized(TENANT, DATA, { userId: 'a1', role: 'ADMIN' })).resolves.toBeUndefined();
    noWrite(prisma);
  });
});
