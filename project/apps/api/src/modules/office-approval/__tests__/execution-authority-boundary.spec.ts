/**
 * B4 + B10 (owner GO 2026-09-27) — mali YÜRÜTME yetkili kontrolünün birim sınırı.
 *
 * Her yürütme yüklemi transaction içinde: (1) aktör satırlarını Lawyer → User sırasıyla FOR SHARE kilitler
 * (yetki iptali yollarıyla AYNI sıra; kilitlenme döngüsü yok), (2) VIEWER'ı reddeder, (3) yol-özel yüklemi kilit
 * ALTINDA aynı tx ile değerlendirir. Gerçek kilit davranışı: execution-authority-revocation-race.db-gated.
 * Okuma yüklemleri (isApproverEligible, PayoutApprovalPolicy.isEligible, isDisclosureApproverEligible) DEĞİŞMEZ.
 */
import { ForbiddenException } from '@nestjs/common';
import { OfficeApprovalService } from '../office-approval.service';
import { PayoutApprovalPolicy } from '../client-payout-approval.policy';
import { FINANCIAL_EXECUTION_DENIED_VIEWER, lockExecutionActorRows } from '../office-approval-execution-authority';
import { ClientFinancialDisclosurePublicationService } from '../../client-financial-disclosure/client-financial-disclosure-publication.service';

const TENANT = 't1';
type Actor = { role: string; lawyer: { lawyerRank: string; canApproveOfficeActions: boolean } | null };

/** Kilit sorgularını sıra ile kaydeden, kullanıcı satırını fikstürden döndüren tx sahtesi. */
function txFor(actor: Actor | null) {
  const sql: string[] = [];
  const tx: any = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      sql.push(strings.join('?'));
      return [];
    }),
    user: {
      findUnique: jest.fn(async () =>
        actor
          ? { id: 'u1', role: actor.role, isActive: true, tenantId: TENANT, staffMember: null, lawyer: actor.lawyer }
          : null,
      ),
    },
  };
  return { tx, sql };
}

const PARTNER = { lawyerRank: 'PARTNER', canApproveOfficeActions: false };
const MANAGER = { lawyerRank: 'MANAGER', canApproveOfficeActions: false };
const PLAIN = { lawyerRank: 'LAWYER', canApproveOfficeActions: false };

describe('kilit sırası — iptal yollarıyla AYNI (Lawyer → User), FOR SHARE', () => {
  it('lockExecutionActorRows önce Lawyer sonra User satırını FOR SHARE kilitler', async () => {
    const { tx, sql } = txFor(null);
    await lockExecutionActorRows(tx, 'u1');
    expect(sql).toHaveLength(2);
    expect(sql[0]).toMatch(/FROM "Lawyer" WHERE "userId" = \? FOR SHARE/);
    expect(sql[1]).toMatch(/FROM "User" WHERE "id" = \? FOR SHARE/);
  });
});

describe('OfficeApprovalService.assertApproverExecutionAuthorityInTx (dağıtım post)', () => {
  const svc = new OfficeApprovalService({} as any, { log: jest.fn() } as any);

  it('bağlı VIEWER (PARTNER) → 403 FINANCIAL_EXECUTION_DENIED_VIEWER; kilit ÖNCE alınır', async () => {
    const { tx, sql } = txFor({ role: 'VIEWER', lawyer: PARTNER });
    await expect(svc.assertApproverExecutionAuthorityInTx(tx, 'u1', TENANT)).rejects.toMatchObject({
      response: expect.objectContaining({ code: FINANCIAL_EXECUTION_DENIED_VIEWER }),
    });
    expect(sql).toHaveLength(2);
  });

  it('yüklemi sağlamayan USER (düz avukat) → 403', async () => {
    const { tx } = txFor({ role: 'USER', lawyer: PLAIN });
    await expect(svc.assertApproverExecutionAuthorityInTx(tx, 'u1', TENANT)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('USER + PARTNER → geçer; yüklem kilit ALTINDA aynı tx ile okunur', async () => {
    const { tx } = txFor({ role: 'USER', lawyer: PARTNER });
    await expect(svc.assertApproverExecutionAuthorityInTx(tx, 'u1', TENANT)).resolves.toBeUndefined();
    expect(tx.user.findUnique).toHaveBeenCalledTimes(2); // rol + yüklem, ikisi de tx'ten
  });

  it('okuma yüklemi isApproverEligible DEĞİŞMEDİ: bağlı VIEWER için hâlâ true (inbox görünürlüğü)', async () => {
    const { tx } = txFor({ role: 'VIEWER', lawyer: PARTNER });
    await expect(svc.isApproverEligible('u1', TENANT, tx)).resolves.toBe(true);
  });
});

describe('PayoutApprovalPolicy.assertExecutionEligibleInTx (payout kesinleştirme)', () => {
  const policy = new PayoutApprovalPolicy({} as any);

  it('bağlı VIEWER (MANAGER) → 403 FINANCIAL_EXECUTION_DENIED_VIEWER', async () => {
    const { tx } = txFor({ role: 'VIEWER', lawyer: MANAGER });
    await expect(policy.assertExecutionEligibleInTx(tx, 'u1', TENANT)).rejects.toMatchObject({
      response: expect.objectContaining({ code: FINANCIAL_EXECUTION_DENIED_VIEWER }),
    });
  });

  it('USER + MANAGER → geçer ve capacity döner', async () => {
    const { tx } = txFor({ role: 'USER', lawyer: MANAGER });
    await expect(policy.assertExecutionEligibleInTx(tx, 'u1', TENANT)).resolves.toBe('MANAGER');
  });

  it('dispatcher yüklemi isEligible DEĞİŞMEDİ: bağlı VIEWER için hâlâ true', async () => {
    const { tx } = txFor({ role: 'VIEWER', lawyer: MANAGER });
    await expect(new PayoutApprovalPolicy(tx).isEligible('u1', TENANT)).resolves.toBe(true);
  });
});

describe('FD yayın assertEligibleActor (publish / retry / reverse / supersede)', () => {
  const svc = new ClientFinancialDisclosurePublicationService({} as any, {} as any);

  it('bağlı VIEWER (PARTNER) → 403 DISCLOSURE_PUBLICATION_NOT_ELIGIBLE; kilit ÖNCE alınır', async () => {
    const { tx, sql } = txFor({ role: 'VIEWER', lawyer: PARTNER });
    await expect((svc as any).assertEligibleActor(tx, 'u1', TENANT)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DISCLOSURE_PUBLICATION_NOT_ELIGIBLE' }),
    });
    expect(sql[0]).toMatch(/"Lawyer".*FOR SHARE/);
    expect(sql[1]).toMatch(/"User".*FOR SHARE/);
  });

  it('USER + PARTNER → geçer', async () => {
    const { tx } = txFor({ role: 'USER', lawyer: PARTNER });
    await expect((svc as any).assertEligibleActor(tx, 'u1', TENANT)).resolves.toBeUndefined();
  });
});
