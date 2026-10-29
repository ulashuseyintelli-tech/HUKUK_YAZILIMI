/**
 * F02-B-1 (owner kararı 2026-10-29/30) — WorkScopePermissionService (SAF, mock Prisma).
 *
 * Kanıtlanan sözleşme:
 *  1. resolve(): DENY > ALLOW > NONE; yalnız GLOBAL kapsam + geçerlilik penceresi sorgulanır; rol/rütbe HESABA GİRMEZ.
 *  2. grant(): yalnız iki anahtar, yalnız ALLOW|DENY; bilinmeyen alan 400; GÜNCEL DB rolü ADMIN değilse 403 (sorgu tx içinde);
 *     kişi kartı yoksa 404; kart var ama giriş hesabı yoksa 409 (önce davet); durum ATAMA: eski grant'ler süresi geçmiş yapılır,
 *     yeni tek satır GLOBAL ile yazılır; audit AYNI tx'te.
 *  3. revoke(): anahtarın etkin ALLOW ve DENY grant'lerinin tümü süresi geçmiş (silme YOK); audit.
 *  4. describe(): kart → bağlı hesap → anahtar başına etkin durum; hesap yoksa linked:false ve NONE.
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkScopePermissionService } from '../work-scope-permission.service';

const T = 't1';
const ADMIN = { id: 'u-admin', tenantId: T, isActive: true, role: 'ADMIN' };
const USER = { id: 'u-user', tenantId: T, isActive: true, role: 'USER' };
const now = new Date('2026-10-30T10:00:00Z');
const future = new Date('2026-12-01T00:00:00Z');
const past = new Date('2026-01-01T00:00:00Z');

function build(opts: { actor?: typeof ADMIN | typeof USER | null; lawyer?: { userId: string | null } | null; grants?: any[] } = {}) {
  const grants = opts.grants ?? [];
  const tx: any = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: {
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
        const actor = opts.actor === undefined ? ADMIN : opts.actor;
        if (where.role === 'ADMIN') return actor && actor.role === 'ADMIN' && where.id === actor.id ? { id: actor.id } : null;
        return { id: where.id };
      }),
    },
    lawyer: { findFirst: jest.fn().mockResolvedValue(opts.lawyer === undefined ? { userId: 'u-subject' } : opts.lawyer) },
    staffMember: { findFirst: jest.fn().mockResolvedValue(opts.lawyer === undefined ? { userId: 'u-subject' } : opts.lawyer) },
    permissionGrant: {
      findMany: jest.fn().mockResolvedValue(grants),
      updateMany: jest.fn().mockResolvedValue({ count: grants.length }),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'g-new', ...data })),
    },
  };
  const prisma: any = { ...tx, $transaction: jest.fn(async (cb: any) => cb(tx)) };
  const audit = { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn() } as any;
  const svc = new WorkScopePermissionService(prisma, audit);
  return { svc, prisma, tx, audit };
}

const ref = { personType: 'lawyer', personId: 'l1' };
const reject = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e as Error; } throw new Error('hata bekleniyordu'); };

describe('F02-B-1 — WorkScopePermissionService.resolve (saf çözümleme)', () => {
  it('DENY > ALLOW: ikisi de etkinse DENY', async () => {
    const { svc, prisma } = build({ grants: [{ effect: 'ALLOW', validUntil: null }, { effect: 'DENY', validUntil: future }] });
    expect(await svc.resolve(prisma, T, 'u-subject', 'office.tasks.view_all', now)).toBe('DENY');
    const where = prisma.permissionGrant.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: T, subjectUserId: 'u-subject', permissionKey: 'office.tasks.view_all', scope: 'GLOBAL' });
    expect(where.validFrom).toEqual({ lte: now }); // geçerlilik penceresi sorguda
    expect(where.OR).toEqual([{ validUntil: null }, { validUntil: { gt: now } }]);
  });
  it('yalnız ALLOW → ALLOW; grant yok → NONE; tenant/subject boş → NONE (sorgu yok)', async () => {
    expect(await build({ grants: [{ effect: 'ALLOW', validUntil: null }] }).svc.resolve(build().prisma, T, 'u', 'office.expenses.view_all', now)).toBe('NONE'); // farklı prisma: grant yok
    const a = build({ grants: [{ effect: 'ALLOW', validUntil: null }] });
    expect(await a.svc.resolve(a.prisma, T, 'u', 'office.expenses.view_all', now)).toBe('ALLOW');
    const b = build();
    expect(await b.svc.resolve(b.prisma, '', 'u', 'office.tasks.view_all', now)).toBe('NONE');
    expect(b.prisma.permissionGrant.findMany).not.toHaveBeenCalled();
  });
});

describe('F02-B-1 — grant (durum atama)', () => {
  it('ADMIN → eski grant\'ler süresi geçer, yeni GLOBAL satır yazılır, audit aynı tx', async () => {
    const { svc, tx, audit } = build({ grants: [{ id: 'g-old', effect: 'ALLOW', validUntil: null }] });
    const res = await svc.grant(T, ADMIN.id, { ...ref, key: 'office.tasks.view_all', effect: 'DENY', reason: 'deneme' });
    expect(tx.$executeRaw).toHaveBeenCalled(); // danışma kilidi
    expect(tx.permissionGrant.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ subjectUserId: 'u-subject', permissionKey: 'office.tasks.view_all', scope: 'GLOBAL' }) }));
    const data = tx.permissionGrant.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: T, subjectUserId: 'u-subject', permissionKey: 'office.tasks.view_all', effect: 'DENY', scope: 'GLOBAL', grantedByUserId: ADMIN.id, reason: 'deneme', validUntil: null });
    expect(audit.logInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'CREATE', entityType: 'PERMISSION_GRANT', userId: ADMIN.id }));
    expect(res).toMatchObject({ personType: 'lawyer', personId: 'l1', subjectUserId: 'u-subject', key: 'office.tasks.view_all', effect: 'DENY', supersededCount: 1 });
  });
  it('USER (DB rolü) → 403 WORK_SCOPE_ADMIN_REQUIRED; yazma yok', async () => {
    const { svc, tx } = build({ actor: USER });
    const e = await reject(svc.grant(T, USER.id, { ...ref, key: 'office.tasks.view_all', effect: 'ALLOW' }));
    expect(e).toBeInstanceOf(ForbiddenException);
    expect((e as ForbiddenException).getResponse()).toMatchObject({ code: 'WORK_SCOPE_ADMIN_REQUIRED' });
    expect(tx.permissionGrant.create).not.toHaveBeenCalled();
  });
  it('kişi kartı yok → 404; kart var ama hesap yok → 409 WORK_SCOPE_PERSON_NOT_LINKED; yazma yok', async () => {
    const a = build({ lawyer: null });
    expect(await reject(a.svc.grant(T, ADMIN.id, { ...ref, key: 'office.tasks.view_all', effect: 'ALLOW' }))).toBeInstanceOf(NotFoundException);
    const b = build({ lawyer: { userId: null } });
    const e = await reject(b.svc.grant(T, ADMIN.id, { ...ref, key: 'office.tasks.view_all', effect: 'ALLOW' }));
    expect(e).toBeInstanceOf(ConflictException);
    expect((e as ConflictException).getResponse()).toMatchObject({ code: 'WORK_SCOPE_PERSON_NOT_LINKED' });
    expect(b.tx.permissionGrant.create).not.toHaveBeenCalled();
  });
  it.each([
    ['bilinmeyen anahtar', { ...ref, key: 'office.clients.view_all', effect: 'ALLOW' }],
    ['geçersiz etki', { ...ref, key: 'office.tasks.view_all', effect: 'MAYBE' }],
    ['bilinmeyen alan', { ...ref, key: 'office.tasks.view_all', effect: 'ALLOW', scope: 'TEAM' }],
    ['personType geçersiz', { personType: 'client', personId: 'c1', key: 'office.tasks.view_all', effect: 'ALLOW' }],
    ['validUntil saat dilimsiz', { ...ref, key: 'office.tasks.view_all', effect: 'ALLOW', validUntil: '2026-12-01T00:00:00' }],
    ['gövde dizi', [1]],
  ])('%s → 400; transaction AÇILMAZ', async (_n, body) => {
    const { svc, prisma } = build();
    expect(await reject(svc.grant(T, ADMIN.id, body as unknown))).toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('staff kartı: staffMember.findFirst ile çözülür (lawyer sorgulanmaz)', async () => {
    const { svc, tx } = build();
    await svc.grant(T, ADMIN.id, { personType: 'staff', personId: 's1', key: 'office.expenses.view_all', effect: 'ALLOW' });
    expect(tx.staffMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1', tenantId: T } }));
    expect(tx.lawyer.findFirst).not.toHaveBeenCalled();
  });
});

describe('F02-B-1 — revoke (varsayılana dönüş)', () => {
  it('ALLOW ve DENY birlikte süresi geçmiş yapılır; silme yok; audit', async () => {
    const { svc, tx, audit } = build({ grants: [{ id: 'g1', effect: 'ALLOW', validUntil: null }, { id: 'g2', effect: 'DENY', validUntil: future }] });
    const res = await svc.revoke(T, ADMIN.id, { ...ref, key: 'office.expenses.view_all' });
    const where = tx.permissionGrant.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ subjectUserId: 'u-subject', permissionKey: 'office.expenses.view_all', scope: 'GLOBAL' });
    expect(where).not.toHaveProperty('effect'); // her iki etki
    expect(tx.permissionGrant.create).not.toHaveBeenCalled();
    expect(audit.logInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'UPDATE', entityType: 'PERMISSION_GRANT' }));
    expect(res).toMatchObject({ key: 'office.expenses.view_all', revoked: 2 });
  });
  it('USER → 403; kişi kartı yok → 404', async () => {
    expect(await reject(build({ actor: USER }).svc.revoke(T, USER.id, { ...ref, key: 'office.tasks.view_all' }))).toBeInstanceOf(ForbiddenException);
    expect(await reject(build({ lawyer: null }).svc.revoke(T, ADMIN.id, { ...ref, key: 'office.tasks.view_all' }))).toBeInstanceOf(NotFoundException);
  });
});

describe('F02-B-1 — describe (ekran durumu)', () => {
  it('bağlı hesap: anahtar başına etkin durum (DENY > ALLOW), bitiş tarihi; USER → 403', async () => {
    const { svc } = build({ grants: [
      { permissionKey: 'office.tasks.view_all', effect: 'ALLOW', validUntil: future },
      { permissionKey: 'office.tasks.view_all', effect: 'DENY', validUntil: null },
      { permissionKey: 'office.expenses.view_all', effect: 'ALLOW', validUntil: null },
    ] });
    const state = await svc.describe(T, ADMIN.id, ref);
    expect(state.linked).toBe(true);
    expect(state.permissions).toEqual([
      { key: 'office.tasks.view_all', effect: 'DENY', validUntil: null },
      { key: 'office.expenses.view_all', effect: 'ALLOW', validUntil: null },
    ]);
    expect(await reject(build({ actor: USER }).svc.describe(T, USER.id, ref))).toBeInstanceOf(ForbiddenException);
  });
  it('hesapsız kart: linked:false, her anahtar NONE; grant sorgusu yapılmaz', async () => {
    const { svc, prisma } = build({ lawyer: { userId: null } });
    const state = await svc.describe(T, ADMIN.id, ref);
    expect(state.linked).toBe(false);
    expect(state.permissions.map((p) => p.effect)).toEqual(['NONE', 'NONE']);
    expect(prisma.permissionGrant.findMany).not.toHaveBeenCalled();
  });
  void past;
});
