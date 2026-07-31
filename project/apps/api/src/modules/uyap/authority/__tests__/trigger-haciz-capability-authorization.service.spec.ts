import { ForbiddenException } from '@nestjs/common';
import { PermissionGrantEffect, PermissionGrantScope } from '@prisma/client';
import {
  TRIGGER_HACIZ_PERMISSION_KEY,
  TriggerHacizCapabilityAuthorizationService,
} from '../trigger-haciz-capability-authorization.service';

/**
 * I15-D1: `bank/settlement-verifier-authorization.service.spec.ts` (W2.2C-3) desenini
 * birebir izler — ikinci bir capability motoru test edilmiyor, aynı desen ikinci bir
 * permissionKey için tekrarlanıyor.
 */
const NOW = new Date('2026-08-01T10:00:00.000Z');

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
    permissionKey: TRIGGER_HACIZ_PERMISSION_KEY,
    effect: PermissionGrantEffect.ALLOW,
    scope: PermissionGrantScope.GLOBAL,
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validUntil: null,
    ...overrides,
  };
}

function make(
  options: {
    userTenantId?: string;
    userActive?: boolean;
    profile?: 'LAWYER' | 'STAFF' | 'NONE' | 'BOTH';
    profileTenantId?: string;
    profileActive?: boolean;
    grants?: Grant[];
  } = {},
) {
  const profile = options.profile ?? 'LAWYER';
  const humanProfile = {
    tenantId: options.profileTenantId ?? 'tenant-1',
    isActive: options.profileActive ?? true,
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
  };

  return { service: new TriggerHacizCapabilityAuthorizationService(prisma as any), prisma };
}

describe('I15-D1 TriggerHacizCapabilityAuthorizationService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(['LAWYER', 'STAFF'] as const)(
    'allows an active tenant-bound %s with an exact active GLOBAL ALLOW grant',
    async (profile) => {
      const { service, prisma } = make({ profile });

      await expect(
        service.assertAuthorized({ tenantId: 'tenant-1', actorUserId: 'user-1' }),
      ).resolves.toBeUndefined();

      expect(prisma.permissionGrant.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          subjectUserId: 'user-1',
          permissionKey: TRIGGER_HACIZ_PERMISSION_KEY,
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
    },
  );

  it('gives an exact active GLOBAL DENY precedence over ALLOW', async () => {
    const { service } = make({
      grants: [grant(), grant({ effect: PermissionGrantEffect.DENY })],
    });

    await expect(
      service.assertAuthorized({ tenantId: 'tenant-1', actorUserId: 'user-1' }),
    ).rejects.toMatchObject({
      response: { code: 'TRIGGER_HACIZ_CAPABILITY_EXPLICIT_DENY' },
    });
  });

  it.each([
    ['ADMIN role alone (not modeled here — no grant at all)', []],
    ['missing grant', []],
    ['different permission key', [grant({ permissionKey: 'debtor.enforcement.other' })]],
    ['non-GLOBAL scope', [grant({ scope: PermissionGrantScope.TEAM })]],
    ['expired grant', [grant({ validUntil: new Date('2026-08-01T09:59:59.999Z') })]],
    ['not-yet-active grant', [grant({ validFrom: new Date('2026-08-01T10:00:00.001Z') })]],
    ['different tenant grant', [grant({ tenantId: 'tenant-2' })]],
    ['different actor grant (another lawyer)', [grant({ subjectUserId: 'user-2' })]],
  ] as const)('fails closed for %s', async (_label, grants) => {
    const { service } = make({ grants: [...grants] });

    await expect(
      service.assertAuthorized({ tenantId: 'tenant-1', actorUserId: 'user-1' }),
    ).rejects.toMatchObject({
      response: { code: 'TRIGGER_HACIZ_CAPABILITY_REQUIRED' },
    });
  });

  it.each([
    ['wrong user tenant (cross-tenant)', { userTenantId: 'tenant-2' }],
    ['inactive user', { userActive: false }],
    ['missing human profile', { profile: 'NONE' as const }],
    ['ambiguous human profile (both lawyer and staff)', { profile: 'BOTH' as const }],
    ['inactive human profile', { profileActive: false }],
    ['wrong profile tenant', { profileTenantId: 'tenant-2' }],
  ])('fails closed for %s before consulting PermissionGrant', async (_label, options) => {
    const { service, prisma } = make(options);

    await expect(
      service.assertAuthorized({ tenantId: 'tenant-1', actorUserId: 'user-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.permissionGrant.findMany).not.toHaveBeenCalled();
  });

  it.each([
    { tenantId: '', actorUserId: 'user-1' },
    { tenantId: 'tenant-1', actorUserId: '' },
  ])('rejects missing identity before any database access', async (input) => {
    const { service, prisma } = make();

    await expect(service.assertAuthorized(input)).rejects.toMatchObject({
      response: { code: 'TRIGGER_HACIZ_CAPABILITY_IDENTITY_REQUIRED' },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.permissionGrant.findMany).not.toHaveBeenCalled();
  });
});
