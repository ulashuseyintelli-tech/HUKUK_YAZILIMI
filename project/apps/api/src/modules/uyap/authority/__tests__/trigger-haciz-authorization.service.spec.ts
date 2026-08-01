import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TriggerHacizAuthorizationService } from '../trigger-haciz-authorization.service';
import { UyapSendAuthorityOperation } from '../uyap-send-authority.types';

/**
 * I15-D1 / I15-D1-R1: `TriggerHacizAuthorizationService` — pushHacizRequest()'e özel dar
 * orchestration. Her bileşen (CaseDebtorLifecycleGuardService, ActingLawyerResolverService,
 * CaseLawyer assignment, UyapSendAuthorityResolverService, TriggerHacizCapabilityAuthorizationService)
 * BAĞIMSIZ mock'lanır — hiçbiri diğerinin yerine geçmediğini kanıtlamak için her biri AYRI AYRI
 * başarısız kılınır. I15-D1-R1: CaseDebtor target-binding artık İLK predicate (owner-ratified sıra).
 */
const TENANT = 't-1';
const OTHER_TENANT = 't-2';
const USER = 'user-1';
const LAWYER = 'lawyer-1';
const OTHER_LAWYER = 'lawyer-2';
const CASE = 'case-1';
const CASE_DEBTOR = 'case-debtor-1';
const DEBTOR = 'debtor-1';

function buildOrchestrator(opts: {
  caseDebtorFound?: boolean;
  caseDebtorActive?: boolean;
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
  const caseDebtorFound = opts.caseDebtorFound ?? true;
  const caseDebtorActive = opts.caseDebtorActive ?? true;

  const prisma: any = {
    case: {
      findFirst: jest.fn(async () =>
        caseFound ? { lawyers: assignedLawyerIds.map((lawyerId) => ({ lawyerId })) } : null,
      ),
    },
  };

  const caseDebtorLifecycleGuard: any = {
    assertActiveByCaseDebtorId: jest.fn(async () => {
      if (!caseDebtorFound) {
        throw new NotFoundException('Dosya borçlusu bulunamadı.');
      }
      if (!caseDebtorActive) {
        throw new BadRequestException('Pasif dosya borçlusu yeni operasyon hedefi olamaz.');
      }
      return { id: CASE_DEBTOR, caseId: CASE, debtorId: DEBTOR, lifecycleStatus: 'ACTIVE' };
    }),
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
    caseDebtorLifecycleGuard,
  );

  return {
    service,
    prisma,
    caseDebtorLifecycleGuard,
    actingLawyerResolver,
    sendAuthorityResolver,
    capabilityAuthorization,
  };
}

const baseInput = () => ({
  tenantId: TENANT,
  authenticatedUserId: USER,
  caseId: CASE,
  caseDebtorId: CASE_DEBTOR,
});

describe('I15-D1-R1 TriggerHacizAuthorizationService', () => {
  it('tüm predicate\'ler PASS olunca canonical debtorId ile başarıyla çözümlenir', async () => {
    const { service, caseDebtorLifecycleGuard, sendAuthorityResolver, capabilityAuthorization } =
      buildOrchestrator();

    await expect(service.assertAuthorized(baseInput())).resolves.toEqual({ debtorId: DEBTOR });

    expect(caseDebtorLifecycleGuard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(
      TENANT,
      CASE_DEBTOR,
      { expectedCaseId: CASE },
    );
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

  it('CaseDebtor bulunamazsa (nonexistent) deny — acting-lawyer/POA/capability HİÇBİRİ çağrılmaz (İLK predicate)', async () => {
    const { service, actingLawyerResolver, sendAuthorityResolver, capabilityAuthorization } =
      buildOrchestrator({ caseDebtorFound: false });

    await expect(service.assertAuthorized(baseInput())).rejects.toBeInstanceOf(NotFoundException);
    expect(actingLawyerResolver.resolveOrThrow).not.toHaveBeenCalled();
    expect(sendAuthorityResolver.resolve).not.toHaveBeenCalled();
    expect(capabilityAuthorization.assertAuthorized).not.toHaveBeenCalled();
  });

  it('CaseDebtor PASSIVE ise deny — sonraki hiçbir predicate çalışmaz', async () => {
    const { service, actingLawyerResolver } = buildOrchestrator({ caseDebtorActive: false });

    await expect(service.assertAuthorized(baseInput())).rejects.toBeInstanceOf(BadRequestException);
    expect(actingLawyerResolver.resolveOrThrow).not.toHaveBeenCalled();
  });

  it('acting lawyer çözümlenemezse (ör. lawyer profili yok) deny — sonraki hiçbir predicate çalışmaz', async () => {
    const { service, prisma, sendAuthorityResolver, capabilityAuthorization } = buildOrchestrator({
      actingLawyerResolves: false,
    });

    await expect(service.assertAuthorized(baseInput())).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
    expect(sendAuthorityResolver.resolve).not.toHaveBeenCalled();
    expect(capabilityAuthorization.assertAuthorized).not.toHaveBeenCalled();
  });

  it('acting lawyer case\'e ATANMAMIŞSA deny — POA/capability geçerli olsa bile (case assignment ayrı predicate)', async () => {
    const { service, sendAuthorityResolver, capabilityAuthorization } = buildOrchestrator({
      assignedLawyerIds: [OTHER_LAWYER], // acting lawyer (LAWYER) roster'da YOK
    });

    await expect(service.assertAuthorized(baseInput())).rejects.toMatchObject({
      response: { code: 'TRIGGER_HACIZ_CASE_ASSIGNMENT_REQUIRED' },
    });
    // Assignment kapıdan önce durduğu için POA/capability hiç değerlendirilmez.
    expect(sendAuthorityResolver.resolve).not.toHaveBeenCalled();
    expect(capabilityAuthorization.assertAuthorized).not.toHaveBeenCalled();
  });

  it('case bulunamazsa (ör. cross-tenant) deny — case assignment sorgusu boş roster döner', async () => {
    const { service } = buildOrchestrator({ caseFound: false });

    await expect(
      service.assertAuthorized({ ...baseInput(), tenantId: OTHER_TENANT }),
    ).rejects.toMatchObject({ response: { code: 'TRIGGER_HACIZ_CASE_ASSIGNMENT_REQUIRED' } });
  });

  it('assignment VAR ama kendi POA\'sı bu operasyonu kapsamıyorsa deny — assignment tek başına yetmez', async () => {
    const { service, capabilityAuthorization } = buildOrchestrator({
      authorityAllowed: false,
      authorityFailureCode: 'POWER_OF_ATTORNEY_SCOPE_MISMATCH',
    });

    await expect(service.assertAuthorized(baseInput())).rejects.toMatchObject({
      response: { code: 'POWER_OF_ATTORNEY_SCOPE_MISMATCH' },
    });
    // POA yetersizse capability hiç değerlendirilmez.
    expect(capabilityAuthorization.assertAuthorized).not.toHaveBeenCalled();
  });

  it('başka avukatın POA\'sı requester\'ı yetkilendirmez (resolver actingLawyerId ile eşleşen POA arar)', async () => {
    const { service, sendAuthorityResolver } = buildOrchestrator({
      authorityAllowed: false,
      authorityFailureCode: 'POWER_OF_ATTORNEY_MISSING',
    });

    await expect(service.assertAuthorized(baseInput())).rejects.toMatchObject({
      response: { code: 'POWER_OF_ATTORNEY_MISSING' },
    });
    expect(sendAuthorityResolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ actingLawyerId: LAWYER }),
    );
  });

  it('assignment + POA PASS ama explicit PermissionGrant yoksa/DENY ise deny — capability ayrı predicate', async () => {
    const { service } = buildOrchestrator({
      capabilitySucceeds: false,
      capabilityErrorCode: 'TRIGGER_HACIZ_CAPABILITY_EXPLICIT_DENY',
    });

    await expect(service.assertAuthorized(baseInput())).rejects.toMatchObject({
      response: { code: 'TRIGGER_HACIZ_CAPABILITY_EXPLICIT_DENY' },
    });
  });

  it.each([
    ['tenantId boş', { ...baseInput(), tenantId: '' }],
    ['authenticatedUserId boş (SYSTEM/anonim aktör)', { ...baseInput(), authenticatedUserId: '' }],
    ['caseId boş', { ...baseInput(), caseId: '' }],
    ['caseDebtorId boş', { ...baseInput(), caseDebtorId: '' }],
  ])('%s → context-required deny, hiçbir alt-predicate çağrılmaz', async (_label, input) => {
    const {
      service,
      prisma,
      caseDebtorLifecycleGuard,
      actingLawyerResolver,
      sendAuthorityResolver,
      capabilityAuthorization,
    } = buildOrchestrator();

    await expect(service.assertAuthorized(input)).rejects.toMatchObject({
      response: { code: 'TRIGGER_HACIZ_AUTHORIZATION_CONTEXT_REQUIRED' },
    });
    expect(caseDebtorLifecycleGuard.assertActiveByCaseDebtorId).not.toHaveBeenCalled();
    expect(actingLawyerResolver.resolveOrThrow).not.toHaveBeenCalled();
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
    expect(sendAuthorityResolver.resolve).not.toHaveBeenCalled();
    expect(capabilityAuthorization.assertAuthorized).not.toHaveBeenCalled();
  });

  it('actingLawyerId ActingLawyerResolverService\'ten (authenticatedUserId üzerinden) türetilir — body/DTO\'dan asla', async () => {
    // Bu servisin girdi tipi (TriggerHacizAuthorizationInput) zaten `lawyerId`/`actingLawyerId`
    // alanı TAŞIMAZ — yalnız tenantId/authenticatedUserId/caseId/caseDebtorId. Bu, caller-supplied
    // lawyerId spoof'unun STRUCTURAL olarak imkansız olduğunun kanıtıdır (tip sisteminde yer yok).
    const { service, actingLawyerResolver } = buildOrchestrator();
    await service.assertAuthorized(baseInput());
    expect(actingLawyerResolver.resolveOrThrow).toHaveBeenCalledWith({ userId: USER, tenantId: TENANT });
  });

  describe('revalidateCaseDebtorFreshness — immediately-pre-effect ikinci okuma', () => {
    it('ACTIVE ise sessizce PASS olur (aynı kanonik guard, bağımsız ikinci çağrı)', async () => {
      const { service, caseDebtorLifecycleGuard } = buildOrchestrator();

      await expect(
        service.revalidateCaseDebtorFreshness(TENANT, CASE, CASE_DEBTOR),
      ).resolves.toBeUndefined();
      expect(caseDebtorLifecycleGuard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(
        TENANT,
        CASE_DEBTOR,
        { expectedCaseId: CASE },
      );
    });

    it('authorization anından SONRA PASSIVE olmuşsa (TOCTOU) deny', async () => {
      const { service, caseDebtorLifecycleGuard } = buildOrchestrator();
      // İlk çağrı (assertAuthorized içinde) ACTIVE döner; burada guard'ı doğrudan
      // ikinci kez, artık PASSIVE döndürecek şekilde stub'luyoruz.
      caseDebtorLifecycleGuard.assertActiveByCaseDebtorId.mockRejectedValueOnce(
        new BadRequestException('Pasif dosya borçlusu yeni operasyon hedefi olamaz.'),
      );

      await expect(
        service.revalidateCaseDebtorFreshness(TENANT, CASE, CASE_DEBTOR),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('assertAuthorized ile BAĞIMSIZ bir çağrıdır — assertAuthorized tekrar çağrılmaz', async () => {
      const { service, actingLawyerResolver, sendAuthorityResolver, capabilityAuthorization } =
        buildOrchestrator();

      await service.revalidateCaseDebtorFreshness(TENANT, CASE, CASE_DEBTOR);
      expect(actingLawyerResolver.resolveOrThrow).not.toHaveBeenCalled();
      expect(sendAuthorityResolver.resolve).not.toHaveBeenCalled();
      expect(capabilityAuthorization.assertAuthorized).not.toHaveBeenCalled();
    });
  });
});
