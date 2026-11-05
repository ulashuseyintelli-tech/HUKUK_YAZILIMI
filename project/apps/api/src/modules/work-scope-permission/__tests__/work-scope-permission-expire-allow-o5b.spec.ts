/**
 * O-5b (owner 05.11.2026, A politikası) — hesap açma transaction'ında F02 büro geneli ALLOW kayıtlarının sona erdirilmesi.
 *
 * `revoke()` kendi transaction'ını açtığı ve anahtarın DENY kaydını da bitirdiği için hesap açmada kullanılamaz (O5B-ANALIZ-R01).
 * Yerine geçen `expireAllowGrantsInTx()`:
 *  - ÇAĞIRANIN transaction istemcisini kullanır ($transaction AÇMAZ);
 *  - yalnız verilen kimlikleri, yalnız iki F02 anahtarını, yalnız GLOBAL + ALLOW + bitmemiş kayıtları hedefler;
 *  - beklenen sayı tutmazsa 409 (çağıranın transaction'ı geri alınır);
 *  - anahtar başına `revoke()` ile aynı biçimde PERMISSION_GRANT / UPDATE denetimi yazar.
 * `lockPersonInTx()` grant / revoke ile AYNI danışma kilidi anahtarını kullanır.
 */
import { ConflictException } from '@nestjs/common';
import { WorkScopePermissionService } from '../work-scope-permission.service';

const NOW = new Date('2026-11-05T12:00:00.000Z');
const ROWS = [
  { id: 'g1', permissionKey: 'office.tasks.view_all', effect: 'ALLOW', validUntil: null },
  { id: 'g2', permissionKey: 'office.expenses.view_all', effect: 'ALLOW', validUntil: new Date('2099-01-01T00:00:00.000Z') },
];

const build = (opts: { found?: typeof ROWS; updated?: number } = {}) => {
  const tx: any = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    permissionGrant: {
      findMany: jest.fn().mockResolvedValue(opts.found ?? ROWS),
      updateMany: jest.fn().mockResolvedValue({ count: opts.updated ?? (opts.found ?? ROWS).length }),
    },
  };
  const prisma: any = { $transaction: jest.fn() };
  const audit: any = { logInTransaction: jest.fn().mockResolvedValue(undefined) };
  return { svc: new WorkScopePermissionService(prisma, audit), tx, prisma, audit };
};

const input = (grantIds: string[]) => ({
  tenantId: 't1', actorUserId: 'admin-1', person: { personType: 'staff' as const, personId: 's1' },
  subjectUserId: 'u1', grantIds, now: NOW, requestId: 'req-1',
});

describe('O-5b WorkScopePermissionService.expireAllowGrantsInTx', () => {
  it('çağıranın transactionında çalışır; yalnız GLOBAL + ALLOW + iki F02 anahtarı + verilen kimlikler + bitmemiş', async () => {
    const { svc, tx, prisma } = build();
    await expect(svc.expireAllowGrantsInTx(tx, input(['g1', 'g2']))).resolves.toBe(2);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    const { where, data } = tx.permissionGrant.updateMany.mock.calls[0][0];
    expect(where).toEqual({
      id: { in: ['g1', 'g2'] }, tenantId: 't1', subjectUserId: 'u1',
      permissionKey: { in: ['office.tasks.view_all', 'office.expenses.view_all'] },
      scope: 'GLOBAL', effect: 'ALLOW', OR: [{ validUntil: null }, { validUntil: { gt: NOW } }],
    });
    expect(data).toEqual({ validUntil: NOW });
    expect(tx.permissionGrant.findMany.mock.calls[0][0].where).toEqual(where);
  });

  it('boş liste → hiçbir sorgu ve denetim yok', async () => {
    const { svc, tx, audit } = build();
    await expect(svc.expireAllowGrantsInTx(tx, input([]))).resolves.toBe(0);
    expect(tx.permissionGrant.findMany).not.toHaveBeenCalled();
    expect(tx.permissionGrant.updateMany).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('beklenen kayıtlardan biri artık eşleşmiyorsa (değişti / DENY / bitti) 409; güncelleme ve denetim yok', async () => {
    const { svc, tx, audit } = build({ found: [ROWS[0]] });
    const err = await svc.expireAllowGrantsInTx(tx, input(['g1', 'g2'])).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse().code).toBe('WORK_SCOPE_GRANT_CHANGED');
    expect(tx.permissionGrant.updateMany).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('güncellenen sayı tutmazsa 409; denetim yazılmaz', async () => {
    const { svc, tx, audit } = build({ updated: 1 });
    await expect(svc.expireAllowGrantsInTx(tx, input(['g1', 'g2']))).rejects.toBeInstanceOf(ConflictException);
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('denetim: anahtar başına revoke ile aynı biçimde PERMISSION_GRANT / UPDATE satırı (aynı tx)', async () => {
    const { svc, tx, audit } = build();
    await svc.expireAllowGrantsInTx(tx, input(['g1', 'g2']));
    expect(audit.logInTransaction).toHaveBeenCalledTimes(2);
    for (const [t, entry] of audit.logInTransaction.mock.calls) {
      expect(t).toBe(tx);
      expect(entry).toMatchObject({
        tenantId: 't1', userId: 'admin-1', action: 'UPDATE', entityType: 'PERMISSION_GRANT', entityId: 'u1',
        newValues: expect.objectContaining({ subjectUserId: 'u1', personType: 'staff', personId: 's1', scope: 'GLOBAL', validUntil: NOW.toISOString(), expiredCount: 1 }),
        metadata: { source: 'STAFF_ACCOUNT_REOPEN', effectFilter: 'ALLOW', requestId: 'req-1' },
      });
    }
    expect(audit.logInTransaction.mock.calls.map((c: any[]) => c[1].newValues.permissionKey)).toEqual(['office.tasks.view_all', 'office.expenses.view_all']);
    expect(audit.logInTransaction.mock.calls[0][1].oldValues).toEqual({ grants: [{ id: 'g1', effect: 'ALLOW', validUntil: null }] });
  });
});

describe('O-5b WorkScopePermissionService.lockPersonInTx', () => {
  it('grant / revoke ile AYNI danışma kilidi anahtarı (çağıranın transactionında)', async () => {
    const { svc, tx, prisma } = build();
    await svc.lockPersonInTx(tx, 't1', { personType: 'staff', personId: 's1' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    const [strings, key] = tx.$executeRaw.mock.calls[0];
    expect(strings.join('?')).toContain('pg_advisory_xact_lock(hashtextextended(?, 0))');
    expect(key).toBe('work-scope-permission:t1:staff:s1');
  });

  it('revoke yolu da aynı anahtarı alır (kilit anahtarı tek yerde)', async () => {
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'x' }) },
      staffMember: { findFirst: jest.fn().mockResolvedValue({ userId: 'u1' }) },
      permissionGrant: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma: any = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    const svc = new WorkScopePermissionService(prisma, { logInTransaction: jest.fn() } as any);
    await svc.revoke('t1', 'admin-1', { personType: 'staff', personId: 's1', key: 'office.tasks.view_all' });
    expect(tx.$executeRaw.mock.calls[0][1]).toBe('work-scope-permission:t1:staff:s1');
  });
});
