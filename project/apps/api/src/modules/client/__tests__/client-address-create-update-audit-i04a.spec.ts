/**
 * CLIENT-ARC-07-CREATE-UPDATE-AUDIT-I04A — ClientAddress create/update için transaction-bağlı
 * lifecycle audit'i.
 *
 * KANONİK OTORİTE: `CLIENT-GOVERNANCE-CHARTER.md` §49 (§49.4 audit zorunluluğu).
 * PREDECESSORS: I01 (PR #1943) · I02 (PR #1958) · I03 (PR #1961).
 * I04 (production evidence): owner kararıyla DEFERRED — production ortamı YOK.
 *
 * KAPATILAN RESIDUAL: `CLIENT_ADDRESS_CREATE_UPDATE_AUDIT`. I02 arşiv/restore audit'ini
 * getirmişti; create/update yolu audit'siz kalmıştı ve bu I03 kapanışında AÇIK kaydedilmişti.
 *
 * `$transaction` mock'u GERÇEK semantiği taklit eder: callback throw ederse hiçbir yazma
 * commit edilmiş sayılmaz ve `wasRolledBack()` true döner.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ClientAddressController } from '../client-address.controller';
import { ClientAddressService } from '../client-address.service';

const SERVICE_SOURCE = readFileSync(join(__dirname, '..', 'client-address.service.ts'), 'utf-8');
const CONTROLLER_SOURCE = readFileSync(join(__dirname, '..', 'client-address.controller.ts'), 'utf-8');

type Sib = { id: string; clientId: string; isPrimary: boolean; isCurrent: boolean };

const FULL = (over: Partial<any> & { id: string }) => ({
  clientId: 'c1',
  type: 'BEYAN',
  street: 'Eski Sokak',
  city: 'İstanbul',
  district: 'Kadıköy',
  region: null,
  postalCode: null,
  isPrimary: false,
  isCurrent: true,
  ...over,
});

function buildSvc(opts: { siblings: Sib[]; target?: any; auditFails?: boolean }) {
  const tx = {
    clientAddress: {
      findMany: jest.fn().mockResolvedValue(opts.siblings),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest
        .fn()
        .mockImplementation(async ({ data }: any) => ({ id: 'addr-new', isCurrent: true, ...data })),
      update: jest
        .fn()
        .mockImplementation(async ({ where, data }: any) => ({ ...FULL({ id: where.id }), ...data })),
      delete: jest.fn(),
    },
  };
  let rolledBack = false;
  const prisma: any = {
    client: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
    clientAddress: {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        if (opts.target && opts.target.id === where.id && opts.target.clientId === where.clientId) {
          return Promise.resolve(opts.target);
        }
        const found = opts.siblings.find(
          (s) => s.id === where.id && (where.clientId === undefined || s.clientId === where.clientId),
        );
        return Promise.resolve(found ? FULL({ ...found }) : null);
      }),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => {
      try {
        return await cb(tx);
      } catch (e) {
        rolledBack = true;
        throw e;
      }
    }),
  };
  const audit: any = {
    logInTransaction: jest.fn().mockImplementation(async () => {
      if (opts.auditFails) throw new Error('audit sink down');
    }),
    log: jest.fn(),
  };
  return { svc: new ClientAddressService(prisma, audit), prisma, tx, audit, wasRolledBack: () => rolledBack };
}

const calls = (audit: any) => audit.logInTransaction.mock.calls.map((c: any[]) => c[1]);
const byAction = (audit: any, action: string) => calls(audit).find((i: any) => i.action === action);
const CREATE_INPUT = { type: 'BEYAN', street: 'Yeni Sokak', city: 'İstanbul' } as any;

// ————————————————————————————————————————————————————————————————————————
// CREATE
// ————————————————————————————————————————————————————————————————————————

describe('ARC-07 I04A — create() audit', () => {
  it('[1] başarılı create audit kaydı YAZAR', async () => {
    const { svc, audit } = buildSvc({ siblings: [] });
    await svc.create('t1', 'c1', CREATE_INPUT, { userId: 'u1' });
    expect(byAction(audit, 'CLIENT_ADDRESS_CREATE')).toBeDefined();
  });

  it('[2] create audit MUTASYONLA AYNI transaction client\'ına yazılır', async () => {
    const { svc, tx, audit, prisma } = buildSvc({ siblings: [] });
    await svc.create('t1', 'c1', CREATE_INPUT, { userId: 'u1' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(audit.logInTransaction.mock.calls[0][0]).toBe(tx);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('[3/4] audit tenant/client/adres kimliklerini ve yaşam döngüsü bayraklarını taşır', async () => {
    const { svc, audit } = buildSvc({ siblings: [] });
    await svc.create('t1', 'c1', CREATE_INPUT, { userId: 'u1' });
    expect(byAction(audit, 'CLIENT_ADDRESS_CREATE')).toMatchObject({
      tenantId: 't1',
      entityType: 'CLIENT_ADDRESS',
      entityId: 'addr-new',
      userId: 'u1',
      newValues: { isPrimary: true, isCurrent: true },
      metadata: { clientId: 'c1', type: 'BEYAN', siblingPrimaryUnset: false },
    });
  });

  it('[5] audit gövdesi HAM ADRES İÇERİĞİ taşımaz', async () => {
    const { svc, audit } = buildSvc({ siblings: [] });
    await svc.create('t1', 'c1', { ...CREATE_INPUT, district: 'Beşiktaş', postalCode: '34000' }, { userId: 'u1' });
    const serialized = JSON.stringify(calls(audit));
    for (const leak of ['Yeni Sokak', 'İstanbul', 'Beşiktaş', '34000', 'street', 'city', 'district', 'postalCode']) {
      expect(serialized).not.toContain(leak);
    }
  });

  it('[6] audit yazımı BAŞARISIZ olursa create ROLLBACK olur', async () => {
    const { svc, wasRolledBack } = buildSvc({ siblings: [], auditFails: true });
    await expect(svc.create('t1', 'c1', CREATE_INPUT, { userId: 'u1' })).rejects.toThrow('audit sink down');
    expect(wasRolledBack()).toBe(true);
  });

  it('[7] birincil create, devrilen kardeş için yeniden-atama kanıtı YAZAR', async () => {
    const { svc, audit } = buildSvc({
      siblings: [{ id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true }],
    });
    await svc.create('t1', 'c1', { ...CREATE_INPUT, isPrimary: true }, { userId: 'u1' });
    expect(byAction(audit, 'CLIENT_ADDRESS_PRIMARY_REASSIGN')).toMatchObject({
      entityId: 'addr-new',
      newValues: { isPrimary: true },
      metadata: { previousPrimaryAddressId: 'a1', reason: 'PRIMARY_CREATED' },
    });
    expect(byAction(audit, 'CLIENT_ADDRESS_CREATE')).toMatchObject({
      metadata: { siblingPrimaryUnset: true },
    });
  });

  it('[8] non-primary create yeniden-atama audit\'i UYDURMAZ', async () => {
    const { svc, audit } = buildSvc({
      siblings: [{ id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true }],
    });
    await svc.create('t1', 'c1', CREATE_INPUT, { userId: 'u1' });
    expect(byAction(audit, 'CLIENT_ADDRESS_PRIMARY_REASSIGN')).toBeUndefined();
    expect(audit.logInTransaction).toHaveBeenCalledTimes(1);
  });

  it('[8b] İLK adres otomatik birincil olur ama devrilen kardeş YOK — yeniden-atama YAZILMAZ', async () => {
    const { svc, audit } = buildSvc({ siblings: [] });
    await svc.create('t1', 'c1', CREATE_INPUT, { userId: 'u1' });
    expect(byAction(audit, 'CLIENT_ADDRESS_PRIMARY_REASSIGN')).toBeUndefined();
    expect(byAction(audit, 'CLIENT_ADDRESS_CREATE')).toMatchObject({
      newValues: { isPrimary: true },
      metadata: { siblingPrimaryUnset: false },
    });
  });
});

// ————————————————————————————————————————————————————————————————————————
// UPDATE
// ————————————————————————————————————————————————————————————————————————

const TARGET = FULL({ id: 'a2', isPrimary: false });
const SIBS: Sib[] = [
  { id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true },
  { id: 'a2', clientId: 'c1', isPrimary: false, isCurrent: true },
];

describe('ARC-07 I04A — update() audit', () => {
  it('[9] başarılı update audit kaydı YAZAR', async () => {
    const { svc, audit } = buildSvc({ siblings: SIBS, target: TARGET });
    await svc.update('t1', 'c1', 'a2', { city: 'Ankara' } as any, { userId: 'u1' });
    expect(byAction(audit, 'CLIENT_ADDRESS_UPDATE')).toBeDefined();
  });

  it('[10] önceki VE sonuçtaki yaşam döngüsü durumu kaydedilir', async () => {
    const { svc, audit } = buildSvc({ siblings: SIBS, target: TARGET });
    await svc.update('t1', 'c1', 'a2', { city: 'Ankara' } as any, { userId: 'u1' });
    expect(byAction(audit, 'CLIENT_ADDRESS_UPDATE')).toMatchObject({
      tenantId: 't1',
      entityType: 'CLIENT_ADDRESS',
      entityId: 'a2',
      userId: 'u1',
      oldValues: { isPrimary: false, isCurrent: true },
      newValues: { isCurrent: true },
    });
  });

  it('[11] değişiklik metadata\'sı YALNIZ ALAN ADLARINI taşır', async () => {
    const { svc, audit } = buildSvc({ siblings: SIBS, target: TARGET });
    await svc.update('t1', 'c1', 'a2', { city: 'Ankara', street: 'Yeni Cadde' } as any, { userId: 'u1' });
    const rec = byAction(audit, 'CLIENT_ADDRESS_UPDATE');
    expect(rec.metadata.changedFields.sort()).toEqual(['city', 'street']);
    expect(rec.metadata).toMatchObject({ clientId: 'c1', primaryPromoted: false });
  });

  it('[11b] AYNI değerin yeniden gönderilmesi değişiklik SAYILMAZ', async () => {
    const { svc, audit } = buildSvc({ siblings: SIBS, target: TARGET });
    // `city` fixture ile aynı, `district` farklı.
    await svc.update('t1', 'c1', 'a2', { city: 'İstanbul', district: 'Üsküdar' } as any, { userId: 'u1' });
    expect(byAction(audit, 'CLIENT_ADDRESS_UPDATE').metadata.changedFields).toEqual(['district']);
  });

  it('[12] update audit gövdesi HAM ADRES İÇERİĞİ taşımaz', async () => {
    const { svc, audit } = buildSvc({ siblings: SIBS, target: TARGET });
    await svc.update('t1', 'c1', 'a2', { street: 'Gizli Cadde 42', postalCode: '06000' } as any, { userId: 'u1' });
    const serialized = JSON.stringify(calls(audit));
    expect(serialized).not.toContain('Gizli Cadde 42');
    expect(serialized).not.toContain('06000');
    expect(serialized).not.toContain('Eski Sokak');
  });

  it('[13] audit yazımı BAŞARISIZ olursa update ROLLBACK olur', async () => {
    const { svc, wasRolledBack } = buildSvc({ siblings: SIBS, target: TARGET, auditFails: true });
    await expect(
      svc.update('t1', 'c1', 'a2', { city: 'Ankara' } as any, { userId: 'u1' }),
    ).rejects.toThrow('audit sink down');
    expect(wasRolledBack()).toBe(true);
  });

  it('[14] birincilik devri yeniden-atama kanıtı YAZAR', async () => {
    const { svc, audit } = buildSvc({ siblings: SIBS, target: TARGET });
    await svc.update('t1', 'c1', 'a2', { isPrimary: true } as any, { userId: 'u1' });
    expect(byAction(audit, 'CLIENT_ADDRESS_PRIMARY_REASSIGN')).toMatchObject({
      entityId: 'a2',
      newValues: { isPrimary: true },
      metadata: { previousPrimaryAddressId: 'a1', reason: 'PRIMARY_PROMOTED_BY_UPDATE' },
    });
    expect(byAction(audit, 'CLIENT_ADDRESS_UPDATE')).toMatchObject({
      metadata: { primaryPromoted: true, previousPrimaryAddressId: 'a1' },
    });
  });

  it('[15] sıradan alan güncellemesi yaşam döngüsü olayı UYDURMAZ', async () => {
    const { svc, audit } = buildSvc({ siblings: SIBS, target: TARGET });
    await svc.update('t1', 'c1', 'a2', { city: 'Ankara' } as any, { userId: 'u1' });
    expect(byAction(audit, 'CLIENT_ADDRESS_PRIMARY_REASSIGN')).toBeUndefined();
    expect(audit.logInTransaction).toHaveBeenCalledTimes(1);
  });

  it('[16] NO-OP update başarı audit\'i YAZMAZ', async () => {
    const { svc, audit } = buildSvc({ siblings: SIBS, target: TARGET });
    await svc.update('t1', 'c1', 'a2', {} as any, { userId: 'u1' });
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('[16b] REDDEDİLEN update (invariant ihlali) başarı audit\'i YAZMAZ ve rollback olur', async () => {
    // Depoda ZATEN iki güncel birincil var (INV-06 ihlali) → öngörülen küme reddedilir.
    const { svc, audit, tx, wasRolledBack } = buildSvc({
      siblings: [
        { id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true },
        { id: 'a3', clientId: 'c1', isPrimary: true, isCurrent: true },
        { id: 'a2', clientId: 'c1', isPrimary: false, isCurrent: true },
      ],
      target: TARGET,
    });
    await expect(svc.update('t1', 'c1', 'a2', { city: 'Ankara' } as any, { userId: 'u1' })).rejects.toMatchObject({
      response: { code: 'CLIENT_ADDRESS_LIFECYCLE_VIOLATION' },
    });
    expect(audit.logInTransaction).not.toHaveBeenCalled();
    expect(tx.clientAddress.update).not.toHaveBeenCalled();
    expect(wasRolledBack()).toBe(true);
  });
});

// ————————————————————————————————————————————————————————————————————————
// KAPSAM VE ACTOR
// ————————————————————————————————————————————————————————————————————————

describe('ARC-07 I04A — kapsam ve actor', () => {
  it('[17/18] tenant ve client dışı update FAIL-CLOSED kalır (audit yazılmaz)', async () => {
    const other = buildSvc({
      siblings: [{ id: 'a2', clientId: 'c-other', isPrimary: false, isCurrent: true }],
    });
    await expect(other.svc.update('t1', 'c1', 'a2', { city: 'X' } as any, { userId: 'u1' })).rejects.toBeDefined();
    expect(other.audit.logInTransaction).not.toHaveBeenCalled();
    expect(other.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('[19] actor kimliği YALNIZ auth context\'ten controller tarafından geçirilir', async () => {
    const service: any = { create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) };
    const ctrl = new ClientAddressController(service);
    await ctrl.create({ user: { id: 'u-auth', tenantId: 't1' } } as any, 'c1', CREATE_INPUT);
    expect(service.create).toHaveBeenCalledWith('t1', 'c1', CREATE_INPUT, { userId: 'u-auth' });
    await ctrl.update({ user: { id: 'u-auth', tenantId: 't1' } } as any, 'c1', 'a2', { city: 'X' } as any);
    expect(service.update).toHaveBeenCalledWith('t1', 'c1', 'a2', { city: 'X' }, { userId: 'u-auth' });
  });

  it('[20] istek gövdesi audit actor\'ünü SPOOF EDEMEZ', async () => {
    const service: any = { create: jest.fn().mockResolvedValue({}) };
    const ctrl = new ClientAddressController(service);
    // Body içinde userId/actor gönderilse bile controller onu OKUMAZ.
    await ctrl.create(
      { user: { id: 'u-auth', tenantId: 't1' } } as any,
      'c1',
      { ...CREATE_INPUT, userId: 'u-spoofed', actor: { userId: 'u-spoofed' } } as any,
    );
    expect(service.create.mock.calls[0][3]).toEqual({ userId: 'u-auth' });
    // Kaynak seviyesinde de body'den actor türetimi YOK.
    expect(CONTROLLER_SOURCE).not.toMatch(/dto\.userId|body\.userId|dto\.actor/);
    expect(CONTROLLER_SOURCE.match(/userId: req\.user\.id/g) ?? []).toHaveLength(4);
  });

  it('[20b] yetkilendirme ReportingLine\'dan TÜRETİLMEZ', () => {
    expect(SERVICE_SOURCE).not.toMatch(/reportingLine|ReportingLine/i);
    expect(CONTROLLER_SOURCE).not.toMatch(/reportingLine|ReportingLine/i);
  });
});

// ————————————————————————————————————————————————————————————————————————
// ATOMİKLİK VE SINIRLAR
// ————————————————————————————————————————————————————————————————————————

describe('ARC-07 I04A — atomiklik ve sınırlar', () => {
  it('[A1] hiçbir yazma yolunda fire-and-forget audit KULLANILMAZ', () => {
    expect(SERVICE_SOURCE).not.toMatch(/this\.audit\.log\(/);
    // Tüm audit çağrıları await edilir (yutulan promise yok).
    const calls = SERVICE_SOURCE.match(/this\.audit\.logInTransaction\(/g) ?? [];
    const awaited = SERVICE_SOURCE.match(/await this\.audit\.logInTransaction\(/g) ?? [];
    expect(awaited.length).toBe(calls.length);
    expect(calls.length).toBeGreaterThanOrEqual(6);
  });

  it('[A2] commit sonrası telafi silme / post-commit audit deseni YOK', () => {
    expect(SERVICE_SOURCE).not.toMatch(/compensat|rollbackManually|afterCommit/i);
    expect(SERVICE_SOURCE).not.toMatch(/\.catch\(\s*\(\)\s*=>/);
  });

  it('[27] SCHEMA/MIGRATION değişmedi — audit mevcut AuditLog substratını kullanır', () => {
    expect(SERVICE_SOURCE).not.toMatch(/\$executeRaw|\$queryRaw/);
    expect(SERVICE_SOURCE).not.toMatch(/addressAudit|ClientAddressAudit/);
  });

  it('[B1] audit-history UI/endpoint EKLENMEDİ (görünürlük ERTELİ)', () => {
    // NOT: kaynakta "audit" KELİMESİNİ aramak yeterli DEĞİL — yorumlar audit actor'ünün
    // yalnız auth'tan geldiğini anlatır. Ölçülen şey gerçek expozür yüzeyi: route ve servis.
    expect(CONTROLLER_SOURCE.match(/@Get\(/g) ?? []).toHaveLength(1);
    expect(CONTROLLER_SOURCE).toMatch(/@Get\('clients\/:clientId\/addresses'\)/);
    // Audit okuma/geçmiş route'u AÇILMADI.
    expect(CONTROLLER_SOURCE).not.toMatch(/@(Get|Post)\('[^']*audit/i);
    expect(CONTROLLER_SOURCE).not.toMatch(/@(Get|Post)\('[^']*history/i);
    // Servis audit OKUMAZ, yalnız YAZAR.
    expect(SERVICE_SOURCE).not.toMatch(/auditLog\.(findMany|findFirst|count)/);
    expect(SERVICE_SOURCE).not.toMatch(/getEntityHistory|getLogs/);
  });

  it('[B2] backfill / production erişimi / tüketici retarget\'ı YOK', () => {
    expect(SERVICE_SOURCE).not.toMatch(/backfill/i);
    expect(SERVICE_SOURCE).not.toMatch(/document|uyap|template/i);
    expect(SERVICE_SOURCE).not.toMatch(/debtorAddress|DebtorAddress/);
  });
});
