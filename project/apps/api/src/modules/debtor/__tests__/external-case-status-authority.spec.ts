import { ForbiddenException } from '@nestjs/common';
import { ExternalCaseStatusAuthorityService } from '../external-case-status-authority.service';

// DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2-I02 (OWNER D2 POLICY DECISION —
// RATIFIED, Bölüm 3 — Writer Authority). Bu suite, iki ayrı yetki predikatının
// (manuel FACT/PROCESS: lawyer VEYA staff+canEdit; manuel KAPANDI: yalnız lawyer)
// ActingLawyerResolverService (I01, reuse) + CaseLawyer/CaseStaff roster üyeliği
// üzerinden DOĞRU birleştirildiğini kanıtlar. İkinci bir authority motoru İCAT
// EDİLMEDİĞİ için burada yalnız case.findFirst + staffMember.findMany mock'lanır.

const TENANT = 't1';
const CASE_ID = 'case1';
const USER_ID = 'user-1';

function buildService(opts: {
  lawyerResolution?: any;
  caseLawyers?: Array<{ lawyerId: string }>;
  staffMatches?: Array<{ id: string; tenantId: string; isActive: boolean }>;
  caseStaff?: Array<{ staffMemberId: string; canEdit: boolean }>;
} = {}) {
  const {
    lawyerResolution = { resolved: false, failureCode: 'ACTING_LAWYER_NOT_RESOLVED' },
    caseLawyers = [],
    staffMatches = [],
    caseStaff = [],
  } = opts;

  const actingLawyerResolver = {
    tryResolve: jest.fn().mockResolvedValue(lawyerResolution),
  };
  const prisma: any = {
    case: {
      findFirst: jest.fn().mockImplementation(({ select }: any) => {
        if (select?.lawyers) return Promise.resolve({ lawyers: caseLawyers });
        if (select?.staff) return Promise.resolve({ staff: caseStaff });
        return Promise.resolve(null);
      }),
    },
    staffMember: {
      findMany: jest.fn().mockResolvedValue(staffMatches),
    },
  };
  const svc = new ExternalCaseStatusAuthorityService(prisma, actingLawyerResolver as any);
  return { svc, prisma, actingLawyerResolver };
}

describe('ExternalCaseStatusAuthorityService.assertFactOrProcessTransitionAuthority', () => {
  it('TEST-1: atanmış avukat (CaseLawyer roster üyesi) → LAWYER olarak yetkilendirilir', async () => {
    const { svc } = buildService({
      lawyerResolution: { resolved: true, actingLawyer: { lawyerId: 'law-1', userId: USER_ID, tenantId: TENANT } },
      caseLawyers: [{ lawyerId: 'law-1' }],
    });
    const result = await svc.assertFactOrProcessTransitionAuthority(TENANT, CASE_ID, USER_ID);
    expect(result).toEqual({ actorKind: 'LAWYER', lawyerId: 'law-1' });
  });

  it('TEST-2: avukat çözülür ama BAŞKA dosyaya atanmış (roster üyesi değil) + canEdit=true staff ataması var → STAFF', async () => {
    const { svc } = buildService({
      lawyerResolution: { resolved: true, actingLawyer: { lawyerId: 'law-1', userId: USER_ID, tenantId: TENANT } },
      caseLawyers: [{ lawyerId: 'baska-avukat' }],
      staffMatches: [{ id: 'staff-1', tenantId: TENANT, isActive: true }],
      caseStaff: [{ staffMemberId: 'staff-1', canEdit: true }],
    });
    const result = await svc.assertFactOrProcessTransitionAuthority(TENANT, CASE_ID, USER_ID);
    expect(result).toEqual({ actorKind: 'STAFF', staffMemberId: 'staff-1' });
  });

  it('TEST-3: avukat hiç çözülmez (Lawyer.userId eşleşmesi yok) ama canEdit=true staff ataması var → STAFF', async () => {
    const { svc } = buildService({
      staffMatches: [{ id: 'staff-1', tenantId: TENANT, isActive: true }],
      caseStaff: [{ staffMemberId: 'staff-1', canEdit: true }],
    });
    const result = await svc.assertFactOrProcessTransitionAuthority(TENANT, CASE_ID, USER_ID);
    expect(result).toEqual({ actorKind: 'STAFF', staffMemberId: 'staff-1' });
  });

  it('TEST-4: staff atanmış ama canEdit=false → REDDEDİLİR (ne lawyer ne yetkili staff)', async () => {
    const { svc } = buildService({
      staffMatches: [{ id: 'staff-1', tenantId: TENANT, isActive: true }],
      caseStaff: [{ staffMemberId: 'staff-1', canEdit: false }],
    });
    await expect(svc.assertFactOrProcessTransitionAuthority(TENANT, CASE_ID, USER_ID)).rejects.toMatchObject({
      constructor: ForbiddenException,
      response: expect.objectContaining({ code: 'EXTERNAL_CASE_TRANSITION_ASSIGNMENT_REQUIRED' }),
    });
  });

  it('TEST-5: ne lawyer ne staff çözülür/atanır → ForbiddenException', async () => {
    const { svc } = buildService();
    await expect(svc.assertFactOrProcessTransitionAuthority(TENANT, CASE_ID, USER_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('TEST-6: staffMember cross-tenant (userId eşleşir ama tenantId farklı) → fail-closed reddedilir', async () => {
    const { svc } = buildService({
      staffMatches: [{ id: 'staff-1', tenantId: 'baska-tenant', isActive: true }],
      caseStaff: [{ staffMemberId: 'staff-1', canEdit: true }],
    });
    await expect(svc.assertFactOrProcessTransitionAuthority(TENANT, CASE_ID, USER_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('TEST-7: staffMember isActive=false → fail-closed reddedilir', async () => {
    const { svc } = buildService({
      staffMatches: [{ id: 'staff-1', tenantId: TENANT, isActive: false }],
      caseStaff: [{ staffMemberId: 'staff-1', canEdit: true }],
    });
    await expect(svc.assertFactOrProcessTransitionAuthority(TENANT, CASE_ID, USER_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('TEST-8: aynı userId için 2 StaffMember (ambiguity/@unique ihlali) → fail-closed reddedilir', async () => {
    const { svc } = buildService({
      staffMatches: [
        { id: 'staff-1', tenantId: TENANT, isActive: true },
        { id: 'staff-2', tenantId: TENANT, isActive: true },
      ],
      caseStaff: [{ staffMemberId: 'staff-1', canEdit: true }],
    });
    await expect(svc.assertFactOrProcessTransitionAuthority(TENANT, CASE_ID, USER_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('TEST-9: boş authenticatedUserId → fail-closed reddedilir (staff dalı asla sorgulanmaz)', async () => {
    const { svc, prisma } = buildService();
    await expect(svc.assertFactOrProcessTransitionAuthority(TENANT, CASE_ID, '')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.staffMember.findMany).not.toHaveBeenCalled();
  });
});

describe('ExternalCaseStatusAuthorityService.assertManualClosureAuthority', () => {
  it('TEST-10: atanmış avukat → LAWYER olarak yetkilendirilir', async () => {
    const { svc } = buildService({
      lawyerResolution: { resolved: true, actingLawyer: { lawyerId: 'law-1', userId: USER_ID, tenantId: TENANT } },
      caseLawyers: [{ lawyerId: 'law-1' }],
    });
    const result = await svc.assertManualClosureAuthority(TENANT, CASE_ID, USER_ID);
    expect(result).toEqual({ actorKind: 'LAWYER', lawyerId: 'law-1' });
  });

  it('TEST-11: canEdit=true staff ataması olsa BİLE manuel kapatma REDDEDİLİR (yalnız avukat)', async () => {
    const { svc, prisma } = buildService({
      staffMatches: [{ id: 'staff-1', tenantId: TENANT, isActive: true }],
      caseStaff: [{ staffMemberId: 'staff-1', canEdit: true }],
    });
    await expect(svc.assertManualClosureAuthority(TENANT, CASE_ID, USER_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EXTERNAL_CASE_CLOSURE_LAWYER_ASSIGNMENT_REQUIRED' }),
    });
    // Staff yolu hiç DEĞERLENDİRİLMEZ — closure yalnız lawyer predicate'ini kontrol eder.
    expect(prisma.staffMember.findMany).not.toHaveBeenCalled();
  });

  it('TEST-12: hiçbir CaseLawyer ataması yok → ForbiddenException', async () => {
    const { svc } = buildService({
      lawyerResolution: { resolved: true, actingLawyer: { lawyerId: 'law-1', userId: USER_ID, tenantId: TENANT } },
      caseLawyers: [{ lawyerId: 'baska-avukat' }],
    });
    await expect(svc.assertManualClosureAuthority(TENANT, CASE_ID, USER_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
