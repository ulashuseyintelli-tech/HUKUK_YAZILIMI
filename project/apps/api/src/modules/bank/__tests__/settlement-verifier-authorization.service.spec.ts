import { ForbiddenException } from '@nestjs/common';
import { PermissionGrantEffect, PermissionGrantScope } from '@prisma/client';
import {
  SETTLEMENT_VERIFY_PERMISSION_KEY,
  SettlementVerifierAuthorizationService,
} from '../settlement-verifier-authorization.service';

const NOW = new Date('2026-07-18T10:00:00.000Z');

type Grant = {
  tenantId: string;
  subjectUserId: string;
  permissionKey: string;
  effect: PermissionGrantEffect;
  scope: PermissionGrantScope;
  validFrom: Date;
  validUntil: Date | null;
};

function grant(overrides: Partial<Grant> = {}): Grant {
  return {
    tenantId: 'tenant-1',
    subjectUserId: 'user-1',
    permissionKey: SETTLEMENT_VERIFY_PERMISSION_KEY,
    effect: PermissionGrantEffect.ALLOW,
    scope: PermissionGrantScope.GLOBAL,
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validUntil: null,
    ...overrides,
  };
}

function make(options: {
  userTenantId?: string;
  userActive?: boolean;
  profile?: 'LAWYER' | 'STAFF' | 'NONE' | 'BOTH';
  profileTenantId?: string;
  profileActive?: boolean;
  grants?: Grant[];
} = {}) {
  const profile = options.profile ?? 'LAWYER';
  const humanProfile = {
    tenantId: options.profileTenantId ?? 'tenant-1',
    isActive: options.profileActive ?? true,
  };
  const writes = {
    evidenceCreate: jest.fn(),
    transactionUpdate: jest.fn(),
    collectionCreate: jest.fn(),
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        tenantId: options.userTenantId ?? 'tenant-1',
        isActive: options.userActive ?? true,
        lawyer: profile === 'LAWYER' || profile === 'BOTH' ? humanProfile : null,
        staffMember: profile === 'STAFF' || profile === 'BOTH' ? humanProfile : null,
      }),
    },
    permissionGrant: {
      findMany: jest.fn().mockResolvedValue(options.grants ?? [grant()]),
    },
    bankSettlementEvidence: { create: writes.evidenceCreate },
    bankTransaction: { update: writes.transactionUpdate },
    collection: { create: writes.collectionCreate },
  };

  return {
    service: new SettlementVerifierAuthorizationService(prisma as any),
    prisma,
    writes,
  };
}

describe('W2.2C-3 SettlementVerifierAuthorizationService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(['LAWYER', 'STAFF'] as const)(
    'allows an active tenant-bound %s with an exact active GLOBAL grant',
    async (profile) => {
      const { service, prisma, writes } = make({ profile });

      await expect(
        service.assertAuthorized({
          trustedTenantId: 'tenant-1',
          actorUserId: 'user-1',
        }),
      ).resolves.toBeUndefined();

      expect(prisma.permissionGrant.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          subjectUserId: 'user-1',
          permissionKey: SETTLEMENT_VERIFY_PERMISSION_KEY,
          scope: PermissionGrantScope.GLOBAL,
          validFrom: { lte: NOW },
          OR: [{ validUntil: null }, { validUntil: { gt: NOW } }],
        },
        select: {
          tenantId: true,
          subjectUserId: true,
          permissionKey: true,
          effect: true,
          scope: true,
          validFrom: true,
          validUntil: true,
        },
      });
      expect(writes.evidenceCreate).not.toHaveBeenCalled();
      expect(writes.transactionUpdate).not.toHaveBeenCalled();
      expect(writes.collectionCreate).not.toHaveBeenCalled();
    },
  );

  it('gives an exact active GLOBAL DENY precedence over ALLOW', async () => {
    const { service, writes } = make({
      grants: [grant(), grant({ effect: PermissionGrantEffect.DENY })],
    });

    await expect(
      service.assertAuthorized({
        trustedTenantId: 'tenant-1',
        actorUserId: 'user-1',
      }),
    ).rejects.toMatchObject({
      response: { code: 'SETTLEMENT_VERIFIER_EXPLICIT_DENY' },
    });
    expect(writes.evidenceCreate).not.toHaveBeenCalled();
    expect(writes.transactionUpdate).not.toHaveBeenCalled();
    expect(writes.collectionCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['missing grant', []],
    ['different permission key', [grant({ permissionKey: 'bank.settlement.read' })]],
    ['non-GLOBAL scope', [grant({ scope: PermissionGrantScope.TEAM })]],
    [
      'expired grant',
      [grant({ validUntil: new Date('2026-07-18T09:59:59.999Z') })],
    ],
    [
      'not-yet-active grant',
      [grant({ validFrom: new Date('2026-07-18T10:00:00.001Z') })],
    ],
    ['different tenant grant', [grant({ tenantId: 'tenant-2' })]],
    ['different actor grant', [grant({ subjectUserId: 'user-2' })]],
  ] as const)('fails closed for %s', async (_label, grants) => {
    const { service } = make({ grants: [...grants] });

    await expect(
      service.assertAuthorized({
        trustedTenantId: 'tenant-1',
        actorUserId: 'user-1',
      }),
    ).rejects.toMatchObject({
      response: { code: 'SETTLEMENT_VERIFIER_PERMISSION_REQUIRED' },
    });
  });

  it.each([
    ['wrong user tenant', { userTenantId: 'tenant-2' }],
    ['inactive user', { userActive: false }],
    ['missing human profile', { profile: 'NONE' as const }],
    ['ambiguous human profile', { profile: 'BOTH' as const }],
    ['inactive human profile', { profileActive: false }],
    ['wrong profile tenant', { profileTenantId: 'tenant-2' }],
  ])('fails closed for %s', async (_label, options) => {
    const { service, prisma } = make(options);

    await expect(
      service.assertAuthorized({
        trustedTenantId: 'tenant-1',
        actorUserId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.permissionGrant.findMany).not.toHaveBeenCalled();
  });

  it.each([
    { trustedTenantId: '', actorUserId: 'user-1' },
    { trustedTenantId: 'tenant-1', actorUserId: '' },
  ])('rejects missing trusted identity before database access', async (input) => {
    const { service, prisma } = make();

    await expect(service.assertAuthorized(input)).rejects.toMatchObject({
      response: { code: 'SETTLEMENT_VERIFIER_IDENTITY_REQUIRED' },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.permissionGrant.findMany).not.toHaveBeenCalled();
  });
});
