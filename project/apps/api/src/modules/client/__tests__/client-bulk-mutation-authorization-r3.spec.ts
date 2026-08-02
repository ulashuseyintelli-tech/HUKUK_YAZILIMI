/**
 * CLIENT-OWN-13-I02-R3 — bulk/backfill CLIENT mutasyon yetki testleri (SAF, DB-siz).
 *
 * Owner D04/D06 (RATIFIED): seed (`/seed/clients`, `/seed/all`, `/seed/fix-clients`) ve
 * contact-followup backfill YALNIZ `elevatedAuthority` aktörü tarafından çalıştırılabilir —
 * `UserRole.ADMIN` TEK BAŞINA YETMEZ (adres ARCHIVE/RESTORE ile AYNI eşik, D07'nin bu
 * programdaki üçüncü tekrarı). Paralel bir capability sistemi kurulmadı: `decideClientBulkMutation`
 * ve `ClientService.assertCanRunElevatedClientBulkOperation` mevcut `UserRole` +
 * `officeApproval.isApproverEligible` primitiflerini reuse eder.
 */
import { ForbiddenException } from '@nestjs/common';
import {
  decideClientBulkMutation,
  CLIENT_MUTATION_REASON,
} from '../client-mutation-policy';
import { ClientService } from '../client.service';

const forbiddenBody = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ForbiddenException);
    return (e as ForbiddenException).getResponse() as any;
  }
  throw new Error('ForbiddenException bekleniyordu, atılmadı');
};

describe('decideClientBulkMutation (SAF politika, D04/D06/D07)', () => {
  it('actor yok -> NO_ACTOR', () => {
    expect(decideClientBulkMutation({})).toEqual({
      allowed: false,
      reasonCode: CLIENT_MUTATION_REASON.NO_ACTOR,
    });
  });

  it('tanınmayan rol -> UNKNOWN_ROLE (fail-closed)', () => {
    expect(
      decideClientBulkMutation({ userId: 'u1', role: 'GARBAGE', elevatedAuthority: true }),
    ).toEqual({ allowed: false, reasonCode: CLIENT_MUTATION_REASON.UNKNOWN_ROLE });
  });

  it('VIEWER -> VIEWER_DENIED (elevatedAuthority=true olsa BİLE)', () => {
    expect(
      decideClientBulkMutation({ userId: 'u1', role: 'VIEWER', elevatedAuthority: true }),
    ).toEqual({ allowed: false, reasonCode: CLIENT_MUTATION_REASON.VIEWER_DENIED });
  });

  it('USER + elevatedAuthority=false -> LIFECYCLE_DENIED', () => {
    expect(
      decideClientBulkMutation({ userId: 'u1', role: 'USER', elevatedAuthority: false }),
    ).toEqual({ allowed: false, reasonCode: CLIENT_MUTATION_REASON.LIFECYCLE_DENIED });
  });

  it('ADMIN + elevatedAuthority=false -> LIFECYCLE_DENIED (D04: ADMIN TEK BAŞINA YETMEZ)', () => {
    expect(
      decideClientBulkMutation({ userId: 'u1', role: 'ADMIN', elevatedAuthority: false }),
    ).toEqual({ allowed: false, reasonCode: CLIENT_MUTATION_REASON.LIFECYCLE_DENIED });
  });

  it('USER + elevatedAuthority=true -> ALLOWED (rol değil, elevated karar verir)', () => {
    expect(
      decideClientBulkMutation({ userId: 'u1', role: 'USER', elevatedAuthority: true }),
    ).toEqual({ allowed: true, reasonCode: CLIENT_MUTATION_REASON.ALLOWED });
  });

  it('ADMIN + elevatedAuthority=true -> ALLOWED', () => {
    expect(
      decideClientBulkMutation({ userId: 'u1', role: 'ADMIN', elevatedAuthority: true }),
    ).toEqual({ allowed: true, reasonCode: CLIENT_MUTATION_REASON.ALLOWED });
  });
});

describe('ClientService.assertCanRunElevatedClientBulkOperation (servis sınırında, D04/D06)', () => {
  function buildService(isApproverEligible: boolean) {
    const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(isApproverEligible) };
    const audit = { logInTransaction: jest.fn(), log: jest.fn() };
    const svc = new ClientService({} as any, audit as any, officeApproval as any);
    return { svc, officeApproval };
  }

  it('non-eligible ADMIN reddedilir (LIFECYCLE_DENIED) — ADMIN rolü tek başına elevated SAYILMAZ', async () => {
    const { svc, officeApproval } = buildService(false);
    const body = await forbiddenBody(() =>
      svc.assertCanRunElevatedClientBulkOperation('t1', { userId: 'u1', tenantId: 't1', role: 'ADMIN' }),
    );
    expect(body.code).toBe(CLIENT_MUTATION_REASON.LIFECYCLE_DENIED);
    expect(officeApproval.isApproverEligible).toHaveBeenCalledWith('u1', 't1');
  });

  it('eligible USER (isApproverEligible=true) izin verilir — rol değil elevated sinyali karar verir', async () => {
    const { svc } = buildService(true);
    await expect(
      svc.assertCanRunElevatedClientBulkOperation('t1', { userId: 'u1', tenantId: 't1', role: 'USER' }),
    ).resolves.toBeUndefined();
  });

  it('VIEWER reddedilir (VIEWER_DENIED) — elevatedAuthority sinyali ne olursa olsun', async () => {
    const { svc } = buildService(true);
    const body = await forbiddenBody(() =>
      svc.assertCanRunElevatedClientBulkOperation('t1', { userId: 'u1', tenantId: 't1', role: 'VIEWER' }),
    );
    expect(body.code).toBe(CLIENT_MUTATION_REASON.VIEWER_DENIED);
  });

  it('actor yok (userId boş) -> NO_ACTOR, officeApproval hiç sorgulanmaz', async () => {
    const { svc, officeApproval } = buildService(true);
    const body = await forbiddenBody(() =>
      svc.assertCanRunElevatedClientBulkOperation('t1', { userId: '', tenantId: 't1', role: 'ADMIN' }),
    );
    expect(body.code).toBe(CLIENT_MUTATION_REASON.NO_ACTOR);
    expect(officeApproval.isApproverEligible).not.toHaveBeenCalled();
  });

  it('D09/owner req.7: tenant mismatch -> TENANT_MISMATCH, officeApproval HİÇ sorgulanmaz (yazma denemesi hiç başlamaz)', async () => {
    const { svc, officeApproval } = buildService(true);
    const body = await forbiddenBody(() =>
      // actor 't1' tenant'ına ait ama işlem 't2' hedefiyle çağrılıyor.
      svc.assertCanRunElevatedClientBulkOperation('t2', { userId: 'u1', tenantId: 't1', role: 'ADMIN' }),
    );
    expect(body.code).toBe(CLIENT_MUTATION_REASON.TENANT_MISMATCH);
    expect(officeApproval.isApproverEligible).not.toHaveBeenCalled();
  });
});
