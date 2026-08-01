import { ForbiddenException } from '@nestjs/common';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { OfficeF01AuthorizationGuard } from '../../office-approval/office-f01-authorization.guard';
import { projectF01Lawyer, projectF01Office } from '../office-f01-projection';

const TENANT = 'tenant-1';
const OFFICE = 'office-1';
const audit: any = { log: jest.fn() };

describe('OFFICE-SC-F01 — canonical actor allowlist', () => {
  const makeService = (user: unknown) =>
    new OfficeApprovalService(
      { user: { findUnique: jest.fn().mockResolvedValue(user) } } as any,
      audit,
    );

  it('ADMIN is the canonical super-admin mapping; SUPER_ADMIN is not needed', async () => {
    const service = makeService({
      role: 'ADMIN',
      isActive: true,
      tenantId: TENANT,
      staffMember: null,
      lawyer: null,
    });
    await expect(service.isF01ActorAuthorized('u-admin', TENANT, OFFICE)).resolves.toBe(true);
  });

  it.each(['PARTNER', 'MANAGER'])('linked %s lawyer is authorized', async (lawyerRank) => {
    const service = makeService({
      role: 'USER',
      isActive: true,
      tenantId: TENANT,
      staffMember: null,
      lawyer: { officeId: OFFICE, lawyerRank, canApproveOfficeActions: false },
    });
    await expect(service.isF01ActorAuthorized('u-lawyer', TENANT, OFFICE)).resolves.toBe(true);
  });

  it('staff/personnel is denied even when canApproveOfficeActions is accidentally true', async () => {
    const service = makeService({
      role: 'USER',
      isActive: true,
      tenantId: TENANT,
      staffMember: { id: 'staff-1', officeId: OFFICE },
      lawyer: { officeId: OFFICE, lawyerRank: 'MANAGER', canApproveOfficeActions: true },
    });
    await expect(service.isF01ActorAuthorized('u-staff', TENANT, OFFICE)).resolves.toBe(false);
  });

  it('cross-office lawyer access is denied by default', async () => {
    const service = makeService({
      role: 'USER',
      isActive: true,
      tenantId: TENANT,
      staffMember: null,
      lawyer: { officeId: 'other-office', lawyerRank: 'PARTNER', canApproveOfficeActions: false },
    });
    await expect(service.isF01ActorAuthorized('u-lawyer', TENANT, OFFICE)).resolves.toBe(false);
  });
});

describe('OFFICE-SC-F01 — fail-closed server projection', () => {
  const lawyer = {
    id: 'lawyer-1',
    tenantId: TENANT,
    officeId: OFFICE,
    name: 'Ada',
    surname: 'Lovelace',
    displayName: 'Av. Ada Lovelace',
    barNumber: 'B-1',
    barCity: 'Istanbul',
    tckn: '11111111110',
    email: 'ada@example.test',
    iban: 'TR000000000000000000000000',
    lawyerRank: 'PARTNER',
    canApproveOfficeActions: true,
    uyapToken: 'raw-token',
    eSignatureSerial: 'raw-signature',
  };

  it('authorized projection keeps S0/S1 and omits S2/S3/HARD-DENY', () => {
    const out: any = projectF01Lawyer(lawyer, 'AUTHORIZED_S0_S1');
    expect(out).toMatchObject({ id: 'lawyer-1', name: 'Ada', barNumber: 'B-1', lawyerRank: 'PARTNER' });
    expect(out.tckn).toBeUndefined();
    expect(out.iban).toBeUndefined();
    expect(out.uyapToken).toBeUndefined();
    expect(out.eSignatureSerial).toBeUndefined();
  });

  it('unauthorized projection is S0-only and drops internal/personnel data', () => {
    const out: any = projectF01Lawyer(lawyer, 'PUBLIC_S0_ONLY');
    expect(out).toEqual({ barNumber: 'B-1', barCity: 'Istanbul' });
  });

  it('office projection applies the same class to nested lawyers and bank accounts', () => {
    const out: any = projectF01Office(
      {
        id: OFFICE,
        tenantId: TENANT,
        name: 'Büro',
        smtpPass: 'raw-secret',
        smsApiKey: 'raw-key',
        smsApiSecret: 'raw-api-secret',
        bankAccounts: [{ id: 'bank-1', officeId: OFFICE, iban: 'TR000' }],
        lawyers: [lawyer],
      },
      'AUTHORIZED_S0_S1',
    );
    expect(out).toMatchObject({ id: OFFICE, tenantId: TENANT, name: 'Büro' });
    expect(out.smtpPass).toBeUndefined();
    expect(out.smsApiKey).toBeUndefined();
    expect(out.smsApiSecret).toBeUndefined();
    expect(out.bankAccounts[0]).toEqual({ officeId: OFFICE });
    expect(out.lawyers[0].iban).toBeUndefined();
    expect(out.lawyers[0].uyapToken).toBeUndefined();
  });
});

describe('OFFICE-SC-F01 — mutation guard', () => {
  it('fails closed when JWT subject/tenant is missing', async () => {
    const approval = { isF01ActorAuthorized: jest.fn() } as any;
    const guard = new OfficeF01AuthorizationGuard(approval);
    await expect(
      guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ user: {} }) }) } as any),
    ).rejects.toThrow(ForbiddenException);
    expect(approval.isF01ActorAuthorized).not.toHaveBeenCalled();
  });

  it('delegates to the canonical actor predicate and denies when it is false', async () => {
    const approval = { isF01ActorAuthorized: jest.fn().mockResolvedValue(false) } as any;
    const guard = new OfficeF01AuthorizationGuard(approval);
    await expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', tenantId: TENANT } }) }),
      } as any),
    ).rejects.toThrow(ForbiddenException);
    expect(approval.isF01ActorAuthorized).toHaveBeenCalledWith('u1', TENANT);
  });
});
