/**
 * O-5b (owner 05.11.2026, A politikası) — yeniden etkinleştirilmiş personelin KAPALI giriş hesabını açma.
 *
 * Sözleşme (StaffService.reviewAccountReopen / reopenAccount + ReopenStaffAccountDto):
 *  1) Yetki: F01 kapısı (controller) + GÜNCEL DB rolü ADMIN (servis; inceleme ve yazımda).
 *  2) İnceleme: rol, hesap durumu, iki F02 anahtarındaki GLOBAL bitmemiş ALLOW kayıtları (ileri tarihliler dahil),
 *     bilgi olarak DENY anahtarları ve içerik parmak izi; parola / e-posta / TCKN yok.
 *  3) Yazım TEK transaction: danışma kilidi → ADMIN → User kilidi → kart kilidi → yeniden okuma → koşullu hesap açma +
 *     tokenVersion artışı → seçilmeyen ALLOW'ların sona ermesi → sıfırlama belirteçlerinin iptali → denetim.
 *  4) Bayat inceleme (içerik / süre / updatedAt), bilinmeyen korunacak kimlik, uygulanamayan durum → yazım YOK.
 *  5) DENY ve F02 dışı izinler, rol ve parola yazılmaz.
 * Gerçek PostgreSQL üzerinde eski JWT reddi, geri alma, yarış ve kilit sırası:
 * staff-account-reopen-o5b.http.db-gated.integration.spec.ts.
 */
import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { StaffService } from '../staff.service';
import { ReopenStaffAccountDto } from '../dto/staff.dto';
import { WorkScopePermissionService } from '../../work-scope-permission/work-scope-permission.service';

const TENANT = 't1';
const ID = 's1';
const USER_ID = 'u-hedef';
const ACTOR = { userId: 'admin-1', role: 'ADMIN', requestId: 'req-o5b-1' };
const T = (s: string) => new Date(s);

const CARD = { id: ID, tenantId: TENANT, isActive: true, updatedAt: T('2026-11-05T09:00:00.000Z'), userId: USER_ID };
const USER = {
  id: USER_ID, role: 'USER', isActive: false, tokenVersion: 4, updatedAt: T('2026-11-05T08:00:00.000Z'),
  passwordHash: 'sentetik-parola-ozeti',
};
const GA = (id: string, permissionKey: string, extra: Record<string, unknown> = {}) => ({
  id, permissionKey, effect: 'ALLOW', scope: 'GLOBAL', validFrom: T('2026-10-01T00:00:00.000Z'), validUntil: null,
  updatedAt: T('2026-10-01T00:00:00.000Z'), grantedByUserId: 'admin-0', ...extra,
});
const ALLOW = [
  GA('g-gorev', 'office.tasks.view_all'),
  GA('g-masraf', 'office.expenses.view_all'),
  GA('g-ileri', 'office.tasks.view_all', { validFrom: T('2099-01-01T00:00:00.000Z') }), // ileri tarihli
];
const DENY = [{ permissionKey: 'office.expenses.view_all' }];

type Opts = { card?: any; user?: any; allow?: any[]; actorAdmin?: boolean; userUpdateCount?: number; auditThrows?: boolean };

const build = (opts: Opts = {}) => {
  const calls: string[] = [];
  const card = opts.card === undefined ? CARD : opts.card;
  const user = opts.user === undefined ? USER : opts.user;
  const allow = opts.allow ?? ALLOW;
  const tx: any = {
    $executeRaw: jest.fn(async (_s: TemplateStringsArray, ...v: unknown[]) => { calls.push(`ADVISORY:${String(v[0])}`); return 1; }),
    $queryRaw: jest.fn(async (s: TemplateStringsArray) => {
      const sql = s.join('?');
      calls.push(sql.includes('"StaffMember"') ? 'LOCK_CARD' : sql.includes('"User"') ? 'LOCK_USER' : 'SQL');
      return [];
    }),
    staffMember: { findFirst: jest.fn(async () => card), update: jest.fn(), updateMany: jest.fn() },
    user: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.role === 'ADMIN') { calls.push('ADMIN_CHECK'); return opts.actorAdmin === false ? null : { id: ACTOR.userId }; }
        return user;
      }),
      update: jest.fn(),
      updateMany: jest.fn(async () => { calls.push('USER_UPDATE'); return { count: opts.userUpdateCount ?? 1 }; }),
    },
    permissionGrant: {
      findMany: jest.fn(async ({ where }: any) => {
        if (where.id) return allow.filter((g) => where.id.in.includes(g.id));
        return where.effect === 'ALLOW' ? allow : DENY;
      }),
      updateMany: jest.fn(async ({ where }: any) => { calls.push('GRANT_EXPIRE'); return { count: where.id.in.length }; }),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    passwordResetToken: { updateMany: jest.fn(async () => { calls.push('RESET_REVOKE'); return { count: 1 }; }) },
    caseStaff: { updateMany: jest.fn(), deleteMany: jest.fn() },
  };
  const prisma: any = { ...tx, $transaction: jest.fn(async (fn: any) => fn(tx)) };
  const audit: any = {
    logInTransaction: jest.fn(async (_tx: unknown, e: { action: string }) => {
      calls.push(`AUDIT:${e.action}`);
      if (opts.auditThrows && e.action === 'STAFF_ACCOUNT_REOPEN') throw new Error('denetim yazılamadı');
    }),
  };
  const wsp = new WorkScopePermissionService(prisma, audit);
  return { svc: new StaffService(prisma, audit, wsp), prisma, tx, audit, calls };
};

const yazimYok = (tx: any, calls: string[]) => {
  expect(tx.user.updateMany).not.toHaveBeenCalled();
  expect(tx.user.update).not.toHaveBeenCalled();
  expect(tx.permissionGrant.updateMany).not.toHaveBeenCalled();
  expect(tx.permissionGrant.deleteMany).not.toHaveBeenCalled();
  expect(tx.permissionGrant.create).not.toHaveBeenCalled();
  expect(tx.passwordResetToken.updateMany).not.toHaveBeenCalled();
  expect(tx.staffMember.update).not.toHaveBeenCalled();
  expect(tx.staffMember.updateMany).not.toHaveBeenCalled();
  expect(calls.filter((c) => c.startsWith('AUDIT:'))).toEqual([]);
};

const fingerprintOf = async (opts: Opts = {}) => (await build(opts).svc.reviewAccountReopen(ID, TENANT, ACTOR.userId)).reviewFingerprint;

describe('O-5b StaffService.reviewAccountReopen — inceleme (salt okuma)', () => {
  it('ADMIN olmayan aktör (F01 geçse bile) → 403 STAFF_ACCOUNT_REOPEN_ADMIN_REQUIRED; kart okunmaz', async () => {
    const { svc, tx } = build({ actorAdmin: false });
    const err = await svc.reviewAccountReopen(ID, TENANT, 'partner-1').catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse().code).toBe('STAFF_ACCOUNT_REOPEN_ADMIN_REQUIRED');
    expect(tx.staffMember.findFirst).not.toHaveBeenCalled();
  });

  it('kart yoksa 404', async () => {
    await expect(build({ card: null }).svc.reviewAccountReopen(ID, TENANT, ACTOR.userId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['STAFF_INACTIVE', { card: { ...CARD, isActive: false } }],
    ['NO_LINKED_ACCOUNT', { card: { ...CARD, userId: null }, user: null }],
    ['ACCOUNT_ALREADY_ACTIVE', { user: { ...USER, isActive: true } }],
    ['ACCOUNT_PENDING_INVITE', { user: { ...USER, passwordHash: null } }],
  ])('%s → açılamaz, parmak izi yok', async (reason, opts) => {
    const r = await build(opts as Opts).svc.reviewAccountReopen(ID, TENANT, ACTOR.userId);
    expect(r).toMatchObject({ reopenable: false, reason, reviewFingerprint: null });
  });

  it('açılabilir: rol, ALLOW listesi (ileri tarihli dahil), DENY anahtarları ve parmak izi; parola özeti dönmez', async () => {
    const r = await build().svc.reviewAccountReopen(ID, TENANT, ACTOR.userId);
    expect(r).toMatchObject({
      staffId: ID, reopenable: true, reason: null,
      account: { role: 'USER', isActive: false, hasPassword: true },
      denyKeys: ['office.expenses.view_all'],
    });
    expect(r.allowGrants.map((g) => [g.id, g.startsInFuture])).toEqual([['g-gorev', false], ['g-masraf', false], ['g-ileri', true]]);
    expect(r.reviewFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(r)).not.toContain('sentetik-parola-ozeti');
    expect(Object.keys(r.account!)).toEqual(['role', 'isActive', 'hasPassword']);
  });

  it('parmak izi içerik ve sürüme bağlıdır: kimlik listesi AYNIYKEN süre, updatedAt ya da hesap değişirse değişir', async () => {
    const base = await fingerprintOf();
    expect(await fingerprintOf()).toBe(base);
    const sure = ALLOW.map((g) => (g.id === 'g-masraf' ? { ...g, validUntil: T('2099-06-01T00:00:00.000Z') } : g));
    const surum = ALLOW.map((g) => (g.id === 'g-gorev' ? { ...g, updatedAt: T('2026-11-05T10:00:00.000Z') } : g));
    expect(await fingerprintOf({ allow: sure })).not.toBe(base);
    expect(await fingerprintOf({ allow: surum })).not.toBe(base);
    expect(await fingerprintOf({ user: { ...USER, role: 'ADMIN' } })).not.toBe(base);
    expect(await fingerprintOf({ user: { ...USER, tokenVersion: 5 } })).not.toBe(base);
    expect(await fingerprintOf({ card: { ...CARD, updatedAt: T('2026-11-05T11:00:00.000Z') } })).not.toBe(base);
  });
});

describe('O-5b StaffService.reopenAccount — tek transaction', () => {
  const onayla = async (b: ReturnType<typeof build>, keepGrantIds: string[] = ['g-masraf'], fp?: string | null) =>
    b.svc.reopenAccount(ID, TENANT, { reviewFingerprint: (fp ?? (await fingerprintOf())) as string, keepGrantIds }, ACTOR);

  it('başarı: kilit → ADMIN → User → kart sırası; hesap açılır + tokenVersion artar; yalnız seçilmeyen ALLOW biter; belirteç iptal; denetim', async () => {
    const b = build();
    const res = await onayla(b);
    expect(b.calls).toEqual([
      'ADVISORY:work-scope-permission:t1:staff:s1',
      'ADMIN_CHECK',
      'LOCK_USER',
      'LOCK_CARD',
      'USER_UPDATE',
      'GRANT_EXPIRE',
      'AUDIT:UPDATE', // görev anahtarı (g-gorev + g-ileri)
      'RESET_REVOKE',
      'AUDIT:STAFF_ACCOUNT_REOPEN',
    ]);
    expect(b.tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: USER_ID, tenantId: TENANT, isActive: false, passwordHash: { not: null }, updatedAt: USER.updatedAt },
      data: { isActive: true, tokenVersion: { increment: 1 } },
    });
    const expire = b.tx.permissionGrant.updateMany.mock.calls[0][0];
    expect(expire.where).toMatchObject({
      id: { in: ['g-gorev', 'g-ileri'] }, tenantId: TENANT, subjectUserId: USER_ID, effect: 'ALLOW', scope: 'GLOBAL',
      permissionKey: { in: ['office.tasks.view_all', 'office.expenses.view_all'] },
    });
    expect(b.tx.passwordResetToken.updateMany.mock.calls[0][0].where).toMatchObject({ tenantId: TENANT, userId: USER_ID, consumedAt: null, revokedAt: null });
    const reopenAudit = b.audit.logInTransaction.mock.calls.find((c: any[]) => c[1].action === 'STAFF_ACCOUNT_REOPEN')[1];
    expect(reopenAudit).toMatchObject({
      entityType: 'USER', entityId: USER_ID, userId: ACTOR.userId, decisionResult: 'SUCCESS',
      oldValues: { isActive: false, tokenVersion: 4 }, newValues: { isActive: true, tokenVersion: 5 },
      metadata: expect.objectContaining({ keptGrantIds: ['g-masraf'], expiredGrantIds: ['g-gorev', 'g-ileri'], roleChanged: false, passwordChanged: false, denyGrantsChanged: false }),
    });
    expect(JSON.stringify(reopenAudit)).not.toContain('sentetik-parola-ozeti');
    expect(res).toEqual({
      staffId: ID, account: { isActive: true, role: 'USER' }, keptGrantCount: 1, expiredGrantCount: 2,
      revokedResetTokenCount: 1, sessionsInvalidated: true,
    });
    expect(b.tx.user.update).not.toHaveBeenCalled(); // rol / parola yazımı yok
  });

  it('boş korunacak liste → bütün ALLOW kayıtları (ileri tarihli dahil) biter; DENY sorgusu yazımda kullanılmaz', async () => {
    const b = build();
    const res = await onayla(b, []);
    expect(res.expiredGrantCount).toBe(3);
    const where = b.tx.permissionGrant.updateMany.mock.calls[0][0].where;
    expect(where.id.in).toEqual(['g-gorev', 'g-masraf', 'g-ileri']);
    expect(where.effect).toBe('ALLOW');
  });

  it('bayat parmak izi → 409 STAFF_ACCOUNT_REVIEW_STALE; hiçbir şey yazılmaz', async () => {
    const b = build();
    const err = await onayla(b, ['g-masraf'], 'a'.repeat(64)).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse().code).toBe('STAFF_ACCOUNT_REVIEW_STALE');
    yazimYok(b.tx, b.calls);
  });

  it('incelemede olmayan korunacak kimlik → 400; hiçbir şey yazılmaz', async () => {
    const b = build();
    const err = await onayla(b, ['baska-grant']).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse().code).toBe('STAFF_ACCOUNT_REOPEN_UNKNOWN_GRANT');
    yazimYok(b.tx, b.calls);
  });

  it.each([
    ['ACCOUNT_ALREADY_ACTIVE', { user: { ...USER, isActive: true } }],
    ['STAFF_INACTIVE', { card: { ...CARD, isActive: false } }],
    ['ACCOUNT_PENDING_INVITE', { user: { ...USER, passwordHash: null } }],
  ])('transaction içinde %s → 409 NOT_APPLICABLE; hiçbir şey yazılmaz', async (reason, opts) => {
    const fp = await fingerprintOf();
    const b = build(opts as Opts);
    const err = await onayla(b, ['g-masraf'], fp).catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'STAFF_ACCOUNT_REOPEN_NOT_APPLICABLE', reason });
    yazimYok(b.tx, b.calls);
  });

  it('transaction içinde ADMIN değil → 403; kilitlerden sonra hiçbir şey yazılmaz', async () => {
    const fp = await fingerprintOf();
    const b = build({ actorAdmin: false });
    const err = await onayla(b, ['g-masraf'], fp).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(b.calls).toEqual(['ADVISORY:work-scope-permission:t1:staff:s1', 'ADMIN_CHECK']);
    yazimYok(b.tx, b.calls);
  });

  it('koşullu hesap güncellemesi 0 → 409 STAFF_ACCOUNT_REOPEN_CONFLICT; grant / belirteç / denetim yazılmaz', async () => {
    const fp = await fingerprintOf();
    const b = build({ userUpdateCount: 0 });
    const err = await onayla(b, ['g-masraf'], fp).catch((e) => e);
    expect(err.getResponse().code).toBe('STAFF_ACCOUNT_REOPEN_CONFLICT');
    expect(b.tx.permissionGrant.updateMany).not.toHaveBeenCalled();
    expect(b.tx.passwordResetToken.updateMany).not.toHaveBeenCalled();
    expect(b.calls.filter((c) => c.startsWith('AUDIT:'))).toEqual([]);
  });

  it('denetim hatası yutulmaz (transaction geri alınır — gerçek geri alma DB testinde)', async () => {
    const fp = await fingerprintOf();
    await expect(onayla(build({ auditThrows: true }), ['g-masraf'], fp)).rejects.toThrow('denetim yazılamadı');
  });

  it('aktör / rol / istek kimliği eksikse transaction açılmaz', async () => {
    const b = build();
    await expect(b.svc.reopenAccount(ID, TENANT, { reviewFingerprint: 'a'.repeat(64), keepGrantIds: [] }, { ...ACTOR, requestId: '' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(b.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('O-5b ReopenStaffAccountDto (global ValidationPipe ile aynı seçenekler)', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const run = (body: unknown) => pipe.transform(body, { type: 'body', metatype: ReopenStaffAccountDto });
  const FP = 'b'.repeat(64);

  it('geçerli gövde', async () => {
    await expect(run({ reviewFingerprint: FP, keepGrantIds: [] })).resolves.toBeInstanceOf(ReopenStaffAccountDto);
    await expect(run({ reviewFingerprint: FP, keepGrantIds: ['g1', 'g2'] })).resolves.toBeInstanceOf(ReopenStaffAccountDto);
  });

  it.each([
    ['parmak izi yok', { keepGrantIds: [] }],
    ['parmak izi biçimsiz', { reviewFingerprint: 'X'.repeat(64), keepGrantIds: [] }],
    ['korunacak liste yok', { reviewFingerprint: FP }],
    ['tekrarlı kimlik', { reviewFingerprint: FP, keepGrantIds: ['g1', 'g1'] }],
    ['boş kimlik', { reviewFingerprint: FP, keepGrantIds: [''] }],
    ['51 kimlik', { reviewFingerprint: FP, keepGrantIds: Array.from({ length: 51 }, (_, i) => `g${i}`) }],
    ['rol alanı', { reviewFingerprint: FP, keepGrantIds: [], role: 'ADMIN' }],
    ['parola alanı', { reviewFingerprint: FP, keepGrantIds: [], password: 'x' }],
  ])('%s → 400', async (_ad, body) => {
    await expect(run(body)).rejects.toBeInstanceOf(BadRequestException);
  });
});
