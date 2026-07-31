import { ForbiddenException } from '@nestjs/common';
import { TriggerHacizAuthorizationService } from '../trigger-haciz-authorization.service';
import { UyapSendAuthorityOperation } from '../uyap-send-authority.types';

/**
 * I15-D1: `TriggerHacizAuthorizationService` — pushHacizRequest()'e özel dar orchestration.
 * Her bileşen (ActingLawyerResolverService, CaseLawyer assignment, UyapSendAuthorityResolverService,
 * TriggerHacizCapabilityAuthorizationService) BAĞIMSIZ mock'lanır — hiçbiri diğerinin yerine
 * geçmediğini kanıtlamak için her biri AYRI AYRI başarısız kılınır.
 */
const TENANT = 't-1';
const OTHER_TENANT = 't-2';
const USER = 'user-1';
const LAWYER = 'lawyer-1';
const OTHER_LAWYER = 'lawyer-2';
const CASE = 'case-1';

function buildOrchestrator(opts: {
  actingLawyerResolves?: boolean;
  actingLawyerId?: string;
  assignedLawyerIds?: string[];
  caseFound?: boolean;
  authorityAllowed?: boolean;
  authorityFailureCode?: string;
  capabilitySucceeds?: boolean;
  capabilityErrorCode?: string;
} = {}) {
  const resolvedLawyerId = opts.actingLawyerId ?? LAWYER;
  const assignedLawyerIds = opts.assignedLawyerIds ?? [LAWYER];
  const caseFound = opts.caseFound ?? true;

  const prisma: any = {
    case: {
      findFirst: jest.fn(async () =>
        caseFound ? { lawyers: assignedLawyerIds.map((lawyerId) => ({ lawyerId })) } : null,
      ),
    },
  };

  const actingLawyerResolver: any = {
    resolveOrThrow: jest.fn(async () => {
      if (opts.actingLawyerResolves === false) {
        throw new ForbiddenException({ code: 'ACTING_LAWYER_NOT_RESOLVED' });
      }
      return { lawyerId: resolvedLawyerId, userId: USER, tenantId: TENANT };
    }),
  };

  const sendAuthorityResolver: any = {
    resolve: jest.fn(async () => {
      if (opts.authorityAllowed === false) {
        return { allowed: false, failureCode: opts.authorityFailureCode ?? 'POWER_OF_ATTORNEY_MISSING' };
      }
      return { allowed: true };
    }),
  };

  const capabilityAuthorization: any = {
    assertAuthorized: jest.fn(async () => {
      if (opts.capabilitySucceeds === false) {
        throw new ForbiddenException({ code: opts.capabilityErrorCode ?? 'TRIGGER_HACIZ_CAPABILITY_REQUIRED' });
      }
    }),
  };

  const service = new TriggerHacizAuthorizationService(
    prisma,
    actingLawyerResolver,
    sendAuthorityResolver,
    capabilityAuthorization,
  );

  return { service, prisma, actingLawyerResolver, sendAuthorityResolver, capabilityAuthorization };
}

describe('I15-D1 TriggerHacizAuthorizationService', () => {
  it('tüm predicate\'ler PASS olunca başarıyla çözümlenir', async () => {
    const { service, sendAuthorityResolver, capabilityAuthorization } = buildOrchestrator();

    await expect(
      service.assertAuthorized({ tenantId: TENANT, authenticatedUserId: USER, caseId: CASE }),
    ).resolves.toBeUndefined();

    // operationType her zaman TRIGGER_HACIZ olarak sabit geçirilir — serbest string değil.
    expect(sendAuthorityResolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        authenticatedUserId: USER,
        actingLawyerId: LAWYER,
        caseId: CASE,
        operationType: UyapSendAuthorityOperation.TRIGGER_HACIZ,
      }),
    );
    expect(capabilityAuthorization.assertAuthorized).toHaveBeenCalledWith({
      tenantId: TENANT,
      actorUserId: USER,
    });
  });

  it('acting lawyer çözümlenemezse (ör. lawyer profili yok) deny — sonraki hiçbir predicate çalışmaz', async () => {
    const { service, prisma, sendAuthorityResolver, capabilityAuthorization } = buildOrchestrator({
      actingLawyerResolves: false,
    });

    await expect(
      service.assertAuthorized({ tenantId: TENANT, authenticatedUserId: USER, caseId: CASE }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
    expect(sendAuthorityResolver.resolve).not.toHaveBeenCalled();
    expect(capabilityAuthorization.assertAuthorized).not.toHaveBeenCalled();
  });

  it('acting lawyer case\'e ATANMAMIŞSA deny — POA/capability geçerli olsa bile (case assignment ayrı predicate)', async () => {
    const { service, sendAuthorityResolver, capabilityAuthorization } = buildOrchestrator({
      assignedLawyerIds: [OTHER_LAWYER], // acting lawyer (LAWYER) roster'da YOK
    });

    await expect(
      service.assertAuthorized({ tenantId: TENANT, authenticatedUserId: USER, caseId: CASE }),
    ).rejects.toMatchObject({ response: { code: 'TRIGGER_HACIZ_CASE_ASSIGNMENT_REQUIRED' } });
    // Assignment kapıdan önce durduğu için POA/capability hiç değerlendirilmez.
    expect(sendAuthorityResolver.resolve).not.toHaveBeenCalled();
    expect(capabilityAuthorization.assertAuthorized).not.toHaveBeenCalled();
  });

  it('case bulunamazsa (ör. cross-tenant) deny — case assignment sorgusu boş roster döner', async () => {
    const { service } = buildOrchestrator({ caseFound: false });

    await expect(
      service.assertAuthorized({ tenantId: OTHER_TENANT, authenticatedUserId: USER, caseId: CASE }),
    ).rejects.toMatchObject({ response: { code: 'TRIGGER_HACIZ_CASE_ASSIGNMENT_REQUIRED' } });
  });

  it('assignment VAR ama kendi POA\'sı bu operasyonu kapsamıyorsa deny — assignment tek başına yetmez', async () => {
    const { service, capabilityAuthorization } = buildOrchestrator({
      authorityAllowed: false,
      authorityFailureCode: 'POWER_OF_ATTORNEY_SCOPE_MISMATCH',
    });

    await expect(
      service.assertAuthorized({ tenantId: TENANT, authenticatedUserId: USER, caseId: CASE }),
    ).rejects.toMatchObject({ response: { code: 'POWER_OF_ATTORNEY_SCOPE_MISMATCH' } });
    // POA yetersizse capability hiç değerlendirilmez.
    expect(capabilityAuthorization.assertAuthorized).not.toHaveBeenCalled();
  });

  it('başka avukatın POA\'sı requester\'ı yetkilendirmez (resolver actingLawyerId ile eşleşen POA arar)', async () => {
    const { service, sendAuthorityResolver } = buildOrchestrator({
      authorityAllowed: false,
      authorityFailureCode: 'POWER_OF_ATTORNEY_MISSING',
    });

    await expect(
      service.assertAuthorized({ tenantId: TENANT, authenticatedUserId: USER, caseId: CASE }),
    ).rejects.toMatchObject({ response: { code: 'POWER_OF_ATTORNEY_MISSING' } });
    expect(sendAuthorityResolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ actingLawyerId: LAWYER }),
    );
  });

  it('assignment + POA PASS ama explicit PermissionGrant yoksa/DENY ise deny — capability ayrı predicate', async () => {
    const { service } = buildOrchestrator({
      capabilitySucceeds: false,
      capabilityErrorCode: 'TRIGGER_HACIZ_CAPABILITY_EXPLICIT_DENY',
    });

    await expect(
      service.assertAuthorized({ tenantId: TENANT, authenticatedUserId: USER, caseId: CASE }),
    ).rejects.toMatchObject({ response: { code: 'TRIGGER_HACIZ_CAPABILITY_EXPLICIT_DENY' } });
  });

  it.each([
    ['tenantId boş', { tenantId: '', authenticatedUserId: USER, caseId: CASE }],
    ['authenticatedUserId boş (SYSTEM/anonim aktör)', { tenantId: TENANT, authenticatedUserId: '', caseId: CASE }],
    ['caseId boş', { tenantId: TENANT, authenticatedUserId: USER, caseId: '' }],
  ])('%s → context-required deny, hiçbir alt-predicate çağrılmaz', async (_label, input) => {
    const { service, prisma, actingLawyerResolver, sendAuthorityResolver, capabilityAuthorization } =
      buildOrchestrator();

    await expect(service.assertAuthorized(input)).rejects.toMatchObject({
      response: { code: 'TRIGGER_HACIZ_AUTHORIZATION_CONTEXT_REQUIRED' },
    });
    expect(actingLawyerResolver.resolveOrThrow).not.toHaveBeenCalled();
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
    expect(sendAuthorityResolver.resolve).not.toHaveBeenCalled();
    expect(capabilityAuthorization.assertAuthorized).not.toHaveBeenCalled();
  });

  it('actingLawyerId ActingLawyerResolverService\'ten (authenticatedUserId üzerinden) türetilir — body/DTO\'dan asla', async () => {
    // Bu servisin girdi tipi (TriggerHacizAuthorizationInput) zaten `lawyerId`/`actingLawyerId`
    // alanı TAŞIMAZ — yalnız tenantId/authenticatedUserId/caseId. Bu, caller-supplied lawyerId
    // spoof'unun STRUCTURAL olarak imkansız olduğunun kanıtıdır (tip sisteminde yer yok).
    const { service, actingLawyerResolver } = buildOrchestrator();
    await service.assertAuthorized({ tenantId: TENANT, authenticatedUserId: USER, caseId: CASE });
    expect(actingLawyerResolver.resolveOrThrow).toHaveBeenCalledWith({ userId: USER, tenantId: TENANT });
  });
});
