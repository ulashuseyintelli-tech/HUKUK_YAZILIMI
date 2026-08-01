/**
 * CLIENT-OWN-13-I02-R1-SERVICE-BOUNDARY-ACTOR-THREADING — owner test matrisi (14 madde).
 *
 * R1'in iddiası: I01'de kapı YALNIZ `POST /clients` + `PUT /clients/:id` route sınırındaydı;
 * `ClientService.create()` ise `case.service` (POST /cases inline müvekkil) ve
 * `export-import.service` (POST /export-import/clients/import) tarafından da çağrılıyordu ve
 * bu iki yol kapıyı ATLIYORDU. R1 kapıyı SERVİS SINIRINA taşır: artık her CLIENT mutasyonu —
 * hangi modülden gelirse gelsin — D01/D02 politikasından geçer.
 *
 * "Servis-içi çağrı" GÜVENİLİR çağrı DEMEK DEĞİLDİR: her iki yol da kullanıcı tarafından
 * dolaylı tetiklenen HTTP route'larıdır. Gerçek system/background çağıran YOKTUR (Phase A
 * envanteri: `ClientService` yalnız 3 yerde enjekte edilir, üçü de JwtAuthGuard'lı controller
 * zincirinde).
 *
 * PII: TCKN/VKN değerleri sentetiktir.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { ForbiddenException } from '@nestjs/common';
import { ClientService, buildClientMutationActor, type ClientMutationActorContext } from '../client.service';
import { CLIENT_MUTATION_REASON } from '../client-mutation-policy';
import { CaseService } from '../../case/case.service';
// NOT: `ExportImportService` BU dosyada import EDİLMEZ — `case.service` ile birlikte
// yüklendiğinde dairesel bağımlılık oluşup sınıf yarım kalıyor. Excel import yolu ayrı
// dosyada test edilir: `export-import/__tests__/client-import-actor-threading-r1.spec.ts`.

const SYNTHETIC_TCKN = '40294995552';

const actor = (role: string, tenantId = 't1', userId = 'u1'): ClientMutationActorContext => ({
  userId,
  tenantId,
  role,
});

/** Kayıt-okuma (findOne) için varsayılan satır; duplicate taraması (OR) ayrı yönetilir. */
const DEFAULT_ROW = { id: 'c1', tenantId: 't1', isActive: true, contacts: [] };

/** Yazma yüzeylerinin TAMAMINI sayan prisma sahtesi. */
const buildPrisma = (existing: any = DEFAULT_ROW) => {
  const tx = {
    client: {
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      update: jest.fn().mockResolvedValue({ id: 'c1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue({ id: 'c1' }),
    },
    clientContact: {
      createMany: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    clientAddress: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma: any = {
    client: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        where?.OR ? Promise.resolve(null) : Promise.resolve(existing),
      ),
      findUnique: jest.fn().mockResolvedValue(existing),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      update: jest.fn().mockResolvedValue({ id: 'c1' }),
    },
    clientAddress: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation(async (cb: any) => (typeof cb === 'function' ? cb(tx) : [])),
  };
  return { prisma, tx };
};

const buildClientService = (opts: { eligible?: boolean; existing?: any } = {}) => {
  const { prisma, tx } = buildPrisma(opts.existing === undefined ? DEFAULT_ROW : opts.existing);
  const audit = { log: jest.fn().mockResolvedValue(undefined), logInTransaction: jest.fn().mockResolvedValue(undefined) };
  const office = { isApproverEligible: jest.fn().mockResolvedValue(opts.eligible ?? false) };
  const svc = new ClientService(prisma as any, audit as any, office as any);
  return { svc, prisma, tx, audit, office };
};

const forbiddenBody = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ForbiddenException);
    return (e as ForbiddenException).getResponse() as any;
  }
  throw new Error('ForbiddenException bekleniyordu, atılmadı');
};

// =========================================================================================
// 1-2. Doğrudan CLIENT route (I01 davranışı servis sınırında da geçerli)
// =========================================================================================
describe('R1 — CLIENT servis sınırı', () => {
  it('1. VIEWER create → 403, hiçbir sorgu/yazma yok', async () => {
    const { svc, prisma } = buildClientService();

    const body = await forbiddenBody(() =>
      svc.create('t1', { type: 'PERSON', firstName: 'A', lastName: 'B' }, actor('VIEWER')),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.VIEWER_DENIED);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
  });

  it('2. VIEWER update → 403, hiçbir sorgu/yazma yok', async () => {
    const { svc, prisma } = buildClientService({ existing: { id: 'c1', tenantId: 't1', isActive: true, contacts: [] } });

    const body = await forbiddenBody(() => svc.update('c1', 't1', { notes: 'x' }, actor('VIEWER')));

    expect(body.code).toBe(CLIENT_MUTATION_REASON.VIEWER_DENIED);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
  });
});

// =========================================================================================
// 3-5. CASE üzerinden DOLAYLI CLIENT create (POST /cases inline müvekkil)
// =========================================================================================
describe('R1 — CASE üzerinden dolaylı CLIENT mutasyonu', () => {
  /**
   * `CaseService.create()`'in tamamını sürmek yerine, R1'in eklediği bağı doğrudan ölçeriz:
   * CASE'in `ClientService.create`'e GEÇTİĞİ aktör bağlamı ve o bağlamın politikadan geçişi.
   * Böylece test CASE'in iş mantığına bağımlı olmaz (owner: CASE davranışı değiştirilmez).
   */
  const buildCaseHarness = (role: string) => {
    const client = buildClientService();
    const caseSvc: any = Object.create(CaseService.prototype);
    (caseSvc as any).clientService = client.svc;
    (caseSvc as any).lawyerService = { create: jest.fn() };
    (caseSvc as any).debtorService = { create: jest.fn() };
    const dto: any = {
      creditors: [{ name: 'Ahmet Yilmaz', type: 'PERSON', identityNo: SYNTHETIC_TCKN }],
      lawyers: [],
    };
    const ctx = buildClientMutationActor({ userId: 'u1', tenantId: 't1', role });
    return { caseSvc, dto, ctx, ...client };
  };

  it('3. CASE üzerinden VIEWER inline müvekkil oluşturma → 403 (bypass KAPANDI)', async () => {
    const { caseSvc, dto, ctx, prisma } = buildCaseHarness('VIEWER');

    const body = await forbiddenBody(() =>
      (caseSvc as any).resolveInlinePartiesBeforeTx('t1', dto, ctx),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.VIEWER_DENIED);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // Taraf id'si ATANMAZ → case akışı da bu müvekkili kullanamaz.
    expect(dto.creditors[0].id).toBeUndefined();
  });

  it('4. CASE üzerinden USER inline müvekkil oluşturma → izin verilir (D01)', async () => {
    const { caseSvc, dto, ctx, prisma } = buildCaseHarness('USER');

    await (caseSvc as any).resolveInlinePartiesBeforeTx('t1', dto, ctx);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(dto.creditors[0].id).toBeTruthy();
  });

  it('5. CASE aktör bağlamı rolsüz gelirse fail-closed (sessiz varsayılan YOK)', async () => {
    const { caseSvc, dto, prisma } = buildCaseHarness('USER');
    const rolesizCtx = buildClientMutationActor({ userId: 'u1', tenantId: 't1', role: undefined });

    const body = await forbiddenBody(() =>
      (caseSvc as any).resolveInlinePartiesBeforeTx('t1', dto, rolesizCtx),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.UNKNOWN_ROLE);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// =========================================================================================
// 8-10. Fail-closed: eksik bağlam, tenant uyuşmazlığı, eksik rol
// =========================================================================================
describe('R1 — fail-closed bağlam kuralları', () => {
  it('8. actor bağlamı tamamen boşsa → 403 (tenant kapısı ilk düşer), hiçbir sorgu yok', async () => {
    const { svc, prisma } = buildClientService();
    const bos = buildClientMutationActor({});

    const body = await forbiddenBody(() => svc.create('t1', { type: 'PERSON' }, bos));

    // Kapı sırası: önce tenant eşitliği, sonra D01. Boş bağlamda ilki düşer — her iki hâlde
    // de sonuç 403 ve HİÇBİR yazma/okuma yok (owner: "actor context yok → fail-closed").
    expect(body.code).toBe(CLIENT_MUTATION_REASON.TENANT_MISMATCH);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
  });

  it('8b. tenant doğru ama userId boşsa → 403 NO_ACTOR', async () => {
    const { svc, prisma } = buildClientService();
    const actorsiz = buildClientMutationActor({ tenantId: 't1', role: 'ADMIN' });

    const body = await forbiddenBody(() => svc.create('t1', { type: 'PERSON' }, actorsiz));

    expect(body.code).toBe(CLIENT_MUTATION_REASON.NO_ACTOR);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('9. actor tenant ≠ hedef tenant → 403 TENANT_MISMATCH (create)', async () => {
    const { svc, prisma } = buildClientService();

    const body = await forbiddenBody(() =>
      svc.create('tenant-A', { type: 'PERSON' }, actor('ADMIN', 'tenant-B')),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.TENANT_MISMATCH);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
  });

  it('9b. actor tenant ≠ hedef tenant → 403 TENANT_MISMATCH (update)', async () => {
    const { svc, prisma } = buildClientService({ existing: { id: 'c1', tenantId: 'tenant-A', isActive: true, contacts: [] } });

    const body = await forbiddenBody(() =>
      svc.update('c1', 'tenant-A', { notes: 'x' }, actor('ADMIN', 'tenant-B')),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.TENANT_MISMATCH);
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
  });

  it('10. rol eksikse → 403 UNKNOWN_ROLE', async () => {
    const { svc, prisma } = buildClientService();

    const body = await forbiddenBody(() =>
      svc.create('t1', { type: 'PERSON' }, buildClientMutationActor({ userId: 'u1', tenantId: 't1' })),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.UNKNOWN_ROLE);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// =========================================================================================
// 11. Hiçbir çağıran opsiyonel bypass kullanamaz (kaynak-parse kanıtı)
// =========================================================================================
describe('R1 — opsiyonel bypass yolu YOK', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', '..', '..', rel), 'utf8');

  it('11. create/update imzaları actor parametresini OPSİYONEL almaz', () => {
    const src = read('modules/client/client.service.ts');

    // `async create(tenantId: string, data: any, actor: ClientMutationActorContext)`
    expect(src).toMatch(/async create\([^)]*actor:\s*ClientMutationActorContext\s*\)/s);
    expect(src).toMatch(/async update\([^)]*actor:\s*ClientMutationActorContext\s*\)/s);
    // Eski opsiyonel imza KALMAMALI.
    expect(src).not.toMatch(/async create\([^)]*actor\?:/s);
    expect(src).not.toMatch(/async update\([^)]*actor\?:/s);
  });

  it('11b. servis-içi çağıranlar actor bağlamı geçirir (undefined GEÇMEZ)', () => {
    const caseSrc = read('modules/case/case.service.ts');
    const importSrc = read('modules/export-import/export-import.service.ts');

    expect(caseSrc).toMatch(/clientService\.create\([\s\S]*?\},\s*clientMutationActor\)/);
    expect(importSrc).toMatch(/clientService\.create\(tenantId,\s*data,\s*actor\)/);
    // Eski "actor yoksa undefined geç" deseni KALMAMALI.
    expect(importSrc).not.toContain('actorUserId ? { userId: actorUserId } : undefined');
  });
});

// =========================================================================================
// 12-14. Tenant izolasyonu, lifecycle regresyonu, kalıcılık + PII
// =========================================================================================
describe('R1 — korunan davranışlar', () => {
  it('12. izin verilen update sonrası HER client okuması tenantId ile daraltılır', async () => {
    const { svc, prisma } = buildClientService({ existing: { id: 'c1', tenantId: 't1', isActive: true, contacts: [] } });

    await svc.update('c1', 't1', { notes: 'x' }, actor('ADMIN'));

    const reads = prisma.client.findFirst.mock.calls;
    expect(reads.length).toBeGreaterThan(0);
    for (const [arg] of reads) expect(arg?.where?.tenantId).toBe('t1');
  });

  it('13. lifecycle eşiği DEĞİŞMEDİ: ADMIN bile isActive değişimi için eligibility ister', async () => {
    const { svc, office, prisma } = buildClientService({
      eligible: false,
      existing: { id: 'c1', tenantId: 't1', isActive: true, contacts: [] },
    });

    await expect(svc.update('c1', 't1', { isActive: false }, actor('ADMIN'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(office.isApproverEligible).toHaveBeenCalledWith('u1', 't1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('14. reddedilen istek kalıcılık üretmez ve gövdesinde ham PII bulunmaz', async () => {
    const { svc, prisma, tx, audit } = buildClientService();

    const body = await forbiddenBody(() =>
      svc.create('t1', { type: 'PERSON', tckn: SYNTHETIC_TCKN, firstName: 'GIZLIAD' }, actor('VIEWER')),
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.client.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(SYNTHETIC_TCKN);
    expect(serialized).not.toContain('GIZLIAD');
  });
});
