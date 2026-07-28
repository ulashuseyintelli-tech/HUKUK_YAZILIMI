import {
  CLIENT_FINANCIAL_DISCLOSURE_APPROVER_RANKS,
  DISCLOSURE_APPROVER_CANDIDATE_SELECT,
  isDisclosureApproverEligible,
} from '../client-financial-disclosure-approval-eligibility';
import {
  CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_AUTHORIZATION_ERROR_CODES,
  CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_INVARIANT_ERROR_CODES,
  CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE,
  ClientFinancialDisclosureApprovalAuthorizationError,
  ClientFinancialDisclosureApprovalError,
} from '../client-financial-disclosure-approval.contract';
import { ActionCode } from '../../policy-engine/types/action-code.enum';

/**
 * CLIENT-P2-U03-TRACK-B-I03 — SAF (DB-siz) yeterlilik ve sözleşme suite'i.
 * Charter §41.2 (owner kararları) + §41.3 (canonical rol eşlemesi) doğrudan doğrulanır.
 */
const T = 'tenant-1';
const candidate = (over: Partial<{
  isActive: boolean;
  tenantId: string | null;
  lawyerRank: string | null;
  canApproveOfficeActions: boolean | null;
  lawyer: null;
}>) => ({
  id: 'u1',
  isActive: over.isActive ?? true,
  tenantId: over.tenantId === undefined ? T : over.tenantId,
  lawyer:
    over.lawyer === null
      ? null
      : {
          lawyerRank: over.lawyerRank === undefined ? 'LAWYER' : over.lawyerRank,
          canApproveOfficeActions: over.canApproveOfficeActions ?? false,
        },
});

describe('CLIENT-P2-U03-TRACK-B-I03 — approver eligibility (§41.3 canonical predikat)', () => {
  it('[P1] PARTNER yeterlidir', () => {
    expect(isDisclosureApproverEligible(candidate({ lawyerRank: 'PARTNER' }), T)).toBe(true);
  });

  it('[P2] MANAGER yeterlidir (owner KARAR 1 genişlemesi)', () => {
    expect(isDisclosureApproverEligible(candidate({ lawyerRank: 'MANAGER' }), T)).toBe(true);
  });

  it('[P3] canApproveOfficeActions=true avukat yeterlidir (rank düşük olsa da)', () => {
    expect(
      isDisclosureApproverEligible(
        candidate({ lawyerRank: 'LAWYER', canApproveOfficeActions: true }),
        T,
      ),
    ).toBe(true);
  });

  it('[P4] yetkisiz avukat (LAWYER + capability yok) reddedilir', () => {
    expect(isDisclosureApproverEligible(candidate({ lawyerRank: 'LAWYER' }), T)).toBe(false);
  });

  it('[P4b] AUTHORIZED/INTERN rank tek başına YETMEZ — küme yalnız PARTNER+MANAGER', () => {
    expect(isDisclosureApproverEligible(candidate({ lawyerRank: 'AUTHORIZED' }), T)).toBe(false);
    expect(isDisclosureApproverEligible(candidate({ lawyerRank: 'INTERN' }), T)).toBe(false);
    expect([...CLIENT_FINANCIAL_DISCLOSURE_APPROVER_RANKS]).toEqual(['PARTNER', 'MANAGER']);
  });

  it('[P5] pasif kullanıcı reddedilir (rank PARTNER olsa bile)', () => {
    expect(
      isDisclosureApproverEligible(candidate({ isActive: false, lawyerRank: 'PARTNER' }), T),
    ).toBe(false);
  });

  it('[P6] başka tenant kullanıcısı reddedilir (rank PARTNER olsa bile)', () => {
    expect(
      isDisclosureApproverEligible(candidate({ tenantId: 'tenant-2', lawyerRank: 'PARTNER' }), T),
    ).toBe(false);
    expect(isDisclosureApproverEligible(candidate({ tenantId: null }), T)).toBe(false);
  });

  it('[P7] Lawyer linki OLMAYAN kullanıcı (staff) reddedilir — sıradan staff final approver olamaz', () => {
    expect(isDisclosureApproverEligible(candidate({ lawyer: null }), T)).toBe(false);
    expect(isDisclosureApproverEligible(null, T)).toBe(false);
    expect(isDisclosureApproverEligible(undefined, T)).toBe(false);
  });

  it('[P8] §41.3 SUPER_ADMIN bulgusu: UserRole HİÇ okunmaz — predikat yalnız Lawyer üzerinden çözer', () => {
    // Yeni role enum'u üretilmedi; UserRole.ADMIN finansal onaylayıcı SAYILMAZ.
    expect(Object.keys(DISCLOSURE_APPROVER_CANDIDATE_SELECT).sort()).toEqual([
      'id',
      'isActive',
      'lawyer',
      'tenantId',
    ]);
    expect(JSON.stringify(DISCLOSURE_APPROVER_CANDIDATE_SELECT)).not.toContain('role');
  });
});

describe('CLIENT-P2-U03-TRACK-B-I03 — sözleşme sınırları', () => {
  it('[P9] actionCode sabiti canonical ActionCode üyesiyle BİREBİR aynıdır', () => {
    expect(CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE).toBe(
      ActionCode.CLIENT_FINANCIAL_DISCLOSURE_APPROVE,
    );
  });

  it('[P10] yetkilendirme hataları 403, invariant hataları 409 döner ve kod taşır', () => {
    for (const code of CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_AUTHORIZATION_ERROR_CODES) {
      const err = new ClientFinancialDisclosureApprovalAuthorizationError(code);
      expect(err.getStatus()).toBe(403);
      expect(err.code).toBe(code);
    }
    for (const code of CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_INVARIANT_ERROR_CODES) {
      const err = new ClientFinancialDisclosureApprovalError(code);
      expect(err.getStatus()).toBe(409);
      expect(err.code).toBe(code);
    }
  });

  it('[P11] hata gövdesi finansal payload / alıcı / hash SIZDIRMAZ', () => {
    const body = JSON.stringify(
      new ClientFinancialDisclosureApprovalError('DISCLOSURE_APPROVAL_STALE_SNAPSHOT').getResponse(),
    );
    for (const forbidden of ['amount', 'clientNet', 'totalCollected', '@', 'Decimal', 'prisma']) {
      expect(body.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
