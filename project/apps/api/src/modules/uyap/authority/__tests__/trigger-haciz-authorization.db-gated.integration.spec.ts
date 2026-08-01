/** @jest-environment node */
/**
 * I15-D1 / I15-D1-R1 — TriggerHacizAuthorizationService gerçek Postgres üzerinde uçtan uca
 * kompozisyon (CaseDebtor target-binding dahil).
 *
 * Sahte `where` koşulları değil, GERÇEK Prisma sorguları + gerçek satırlar kullanılır — bu,
 * mocked unit testlerin yakalayamayacağı (ör. Prisma composite-FK/select şekli hataları)
 * bir güvence katmanıdır. TEST_DATABASE_URL yoksa suite atlanır.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:test@localhost:5436/hukuk_test_i15d1
 */
import { PrismaClient, PermissionGrantEffect, PermissionGrantScope, CaseDebtorLifecycleStatus, DebtorRole } from '@prisma/client';
import { ActingLawyerResolverService } from '../../../lawyer/acting-lawyer-resolver.service';
import { UyapSendAuthorityResolverService } from '../uyap-send-authority-resolver.service';
import { TriggerHacizCapabilityAuthorizationService, TRIGGER_HACIZ_PERMISSION_KEY } from '../trigger-haciz-capability-authorization.service';
import { TriggerHacizAuthorizationService } from '../trigger-haciz-authorization.service';
import { CaseDebtorLifecycleGuardService } from '../../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe('I15-D1-R1 TriggerHacizAuthorizationService — disposable DB (CaseDebtor target-binding)', () => {
  let prisma: PrismaClient;
  let service: TriggerHacizAuthorizationService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const actingLawyerResolver = new ActingLawyerResolverService(prisma as any);
    const sendAuthorityResolver = new UyapSendAuthorityResolverService(prisma as any);
    const capabilityAuthorization = new TriggerHacizCapabilityAuthorizationService(prisma as any);
    const caseDebtorLifecycleGuard = new CaseDebtorLifecycleGuardService(prisma as any);
    service = new TriggerHacizAuthorizationService(
      prisma as any,
      actingLawyerResolver,
      sendAuthorityResolver,
      capabilityAuthorization,
      caseDebtorLifecycleGuard,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Her test kendi tam-izole tenant/case/lawyer/client/debtor/POA/grant kümesini kurar. */
  async function seed(opts: {
    scopeType?: 'GENEL' | 'ICRA_TAKIP' | 'BU_DOSYA' | 'OZEL';
    assignOtherLawyerToCase?: boolean;
    poaForOtherLawyer?: boolean;
    grant?: { effect: PermissionGrantEffect; scope?: PermissionGrantScope; validUntil?: Date | null } | null;
    poaRevoked?: boolean;
    caseDebtorLifecycleStatus?: 'ACTIVE' | 'PASSIVE';
    /** İkinci bir CaseDebtor (farklı role) — "birden fazla borçlu" senaryosu için. */
    withSecondCaseDebtor?: boolean;
    secondCaseDebtorLifecycleStatus?: 'ACTIVE' | 'PASSIVE';
  } = {}) {
    const suffix = Math.random().toString(36).slice(2, 10);
    const tenant = await prisma.tenant.create({
      data: { name: `T-${suffix}`, slug: `t-${suffix}` },
    });
    const user = await prisma.user.create({
      data: { tenantId: tenant.id, email: `u-${suffix}@test.local`, name: 'Test', surname: 'User' },
    });
    const lawyer = await prisma.lawyer.create({
      data: { tenantId: tenant.id, name: 'Acting', surname: 'Lawyer', userId: user.id },
    });
    const otherLawyer = await prisma.lawyer.create({
      data: { tenantId: tenant.id, name: 'Other', surname: 'Lawyer' },
    });
    const client = await prisma.client.create({
      data: { tenantId: tenant.id, type: 'PERSON' as any },
    });
    const caseRow = await prisma.case.create({
      data: { tenantId: tenant.id, fileNumber: `F-${suffix}`, type: 'GENERAL_EXECUTION' as any },
    });
    await prisma.caseClient.create({ data: { caseId: caseRow.id, clientId: client.id } });
    await prisma.caseLawyer.create({
      data: { caseId: caseRow.id, lawyerId: opts.assignOtherLawyerToCase ? otherLawyer.id : lawyer.id },
    });

    const debtor = await prisma.debtor.create({
      data: { tenantId: tenant.id, type: 'INDIVIDUAL' as any, firstName: 'Asil', lastName: `Borclu-${suffix}`, name: `Asil Borclu-${suffix}` },
    });
    const caseDebtor = await prisma.caseDebtor.create({
      data: {
        caseId: caseRow.id,
        debtorId: debtor.id,
        role: DebtorRole.ASIL_BORCLU,
        lifecycleStatus:
          (opts.caseDebtorLifecycleStatus ?? 'ACTIVE') === 'PASSIVE'
            ? CaseDebtorLifecycleStatus.PASSIVE
            : CaseDebtorLifecycleStatus.ACTIVE,
      },
    });

    let secondCaseDebtor: { id: string; debtorId: string } | undefined;
    if (opts.withSecondCaseDebtor) {
      const secondDebtor = await prisma.debtor.create({
        data: { tenantId: tenant.id, type: 'INDIVIDUAL' as any, firstName: 'Musterek', lastName: `Borclu-${suffix}`, name: `Musterek Borclu-${suffix}` },
      });
      secondCaseDebtor = await prisma.caseDebtor.create({
        data: {
          caseId: caseRow.id,
          debtorId: secondDebtor.id,
          role: DebtorRole.MUSETEREK_BORCLU,
          lifecycleStatus:
            (opts.secondCaseDebtorLifecycleStatus ?? 'ACTIVE') === 'PASSIVE'
              ? CaseDebtorLifecycleStatus.PASSIVE
              : CaseDebtorLifecycleStatus.ACTIVE,
        },
      });
    }

    const poa = await prisma.clientPowerOfAttorney.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        scopeType: (opts.scopeType ?? 'GENEL') as any,
        status: (opts.poaRevoked ? 'REVOKED' : 'ACTIVE') as any,
        isActive: !opts.poaRevoked,
        dateIssued: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await prisma.poaLawyer.create({
      data: {
        tenantId: tenant.id,
        poaId: poa.id,
        lawyerId: opts.poaForOtherLawyer ? otherLawyer.id : lawyer.id,
      },
    });

    if (opts.grant !== null) {
      await prisma.permissionGrant.create({
        data: {
          tenantId: tenant.id,
          subjectUserId: user.id,
          permissionKey: TRIGGER_HACIZ_PERMISSION_KEY,
          effect: opts.grant?.effect ?? PermissionGrantEffect.ALLOW,
          scope: opts.grant?.scope ?? PermissionGrantScope.GLOBAL,
          validUntil: opts.grant?.validUntil,
        },
      });
    }

    return { tenant, user, lawyer, otherLawyer, client, case: caseRow, poa, debtor, caseDebtor, secondCaseDebtor };
  }

  it('TEST-01: GENEL POA + case-assignment + explicit ALLOW grant → gerçek Postgres üzerinde başarı, canonical debtorId döner', async () => {
    const { tenant, user, case: caseRow, debtor, caseDebtor } = await seed({ scopeType: 'GENEL' });
    await expect(
      service.assertAuthorized({
        tenantId: tenant.id,
        authenticatedUserId: user.id,
        caseId: caseRow.id,
        caseDebtorId: caseDebtor.id,
      }),
    ).resolves.toEqual({ debtorId: debtor.id });
  });

  it('TEST-02: ICRA_TAKIP POA + case-assignment + explicit ALLOW grant → başarı', async () => {
    const { tenant, user, case: caseRow, caseDebtor } = await seed({ scopeType: 'ICRA_TAKIP' });
    await expect(
      service.assertAuthorized({
        tenantId: tenant.id,
        authenticatedUserId: user.id,
        caseId: caseRow.id,
        caseDebtorId: caseDebtor.id,
      }),
    ).resolves.toMatchObject({ debtorId: expect.any(String) });
  });

  it.each(['BU_DOSYA', 'OZEL'] as const)('TEST-03/04: %s scope → deny (gerçek DB, owner-ratifiye kapsam dışı)', async (scopeType) => {
    const { tenant, user, case: caseRow, caseDebtor } = await seed({ scopeType });
    await expect(
      service.assertAuthorized({
        tenantId: tenant.id,
        authenticatedUserId: user.id,
        caseId: caseRow.id,
        caseDebtorId: caseDebtor.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'POWER_OF_ATTORNEY_SCOPE_MISMATCH' } });
  });

  it('TEST-05: PermissionGrant hiç yoksa → deny (gerçek DB)', async () => {
    const { tenant, user, case: caseRow, caseDebtor } = await seed({ grant: null });
    await expect(
      service.assertAuthorized({
        tenantId: tenant.id,
        authenticatedUserId: user.id,
        caseId: caseRow.id,
        caseDebtorId: caseDebtor.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'TRIGGER_HACIZ_CAPABILITY_REQUIRED' } });
  });

  it('TEST-06: explicit DENY, ALLOW\'un yanında olsa bile öncelikli → deny (gerçek DB)', async () => {
    const { tenant, user, case: caseRow, caseDebtor } = await seed();
    await prisma.permissionGrant.create({
      data: {
        tenantId: tenant.id,
        subjectUserId: user.id,
        permissionKey: TRIGGER_HACIZ_PERMISSION_KEY,
        effect: PermissionGrantEffect.DENY,
        scope: PermissionGrantScope.GLOBAL,
      },
    });
    await expect(
      service.assertAuthorized({
        tenantId: tenant.id,
        authenticatedUserId: user.id,
        caseId: caseRow.id,
        caseDebtorId: caseDebtor.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'TRIGGER_HACIZ_CAPABILITY_EXPLICIT_DENY' } });
  });

  it('TEST-07: acting lawyer case\'e atanmamışsa (başka avukat atanmış) → deny — gerçek CaseLawyer sorgusu', async () => {
    const { tenant, user, case: caseRow, caseDebtor } = await seed({ assignOtherLawyerToCase: true });
    await expect(
      service.assertAuthorized({
        tenantId: tenant.id,
        authenticatedUserId: user.id,
        caseId: caseRow.id,
        caseDebtorId: caseDebtor.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'TRIGGER_HACIZ_CASE_ASSIGNMENT_REQUIRED' } });
  });

  it('TEST-08: POA başka avukata aitse (acting lawyer POA-lawyer eşleşmesi yok) → deny', async () => {
    const { tenant, user, case: caseRow, caseDebtor } = await seed({ poaForOtherLawyer: true });
    await expect(
      service.assertAuthorized({
        tenantId: tenant.id,
        authenticatedUserId: user.id,
        caseId: caseRow.id,
        caseDebtorId: caseDebtor.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'POWER_OF_ATTORNEY_MISSING' } });
  });

  it('TEST-09: revoked POA → deny (gerçek DB lifecycle kontrolü)', async () => {
    const { tenant, user, case: caseRow, caseDebtor } = await seed({ poaRevoked: true });
    await expect(
      service.assertAuthorized({
        tenantId: tenant.id,
        authenticatedUserId: user.id,
        caseId: caseRow.id,
        caseDebtorId: caseDebtor.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'POWER_OF_ATTORNEY_REVOKED' } });
  });

  it('TEST-10: süresi dolmuş GLOBAL grant → deny (gerçek DB temporal filtre)', async () => {
    const { tenant, user, case: caseRow, caseDebtor } = await seed({
      grant: { effect: PermissionGrantEffect.ALLOW, validUntil: new Date('2020-01-01T00:00:00.000Z') },
    });
    await expect(
      service.assertAuthorized({
        tenantId: tenant.id,
        authenticatedUserId: user.id,
        caseId: caseRow.id,
        caseDebtorId: caseDebtor.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'TRIGGER_HACIZ_CAPABILITY_REQUIRED' } });
  });

  it('TEST-11: cross-tenant PermissionGrant (başka tenant\'ta grant var) requester\'ı yetkilendirmez', async () => {
    const { user, case: caseRow, caseDebtor } = await seed({ grant: null });
    const { tenant: otherTenant } = await seed(); // farklı tenant'ta ALLOW grant içeren tam set
    await expect(
      service.assertAuthorized({
        tenantId: otherTenant.id,
        authenticatedUserId: user.id,
        caseId: caseRow.id,
        caseDebtorId: caseDebtor.id,
      }),
    ).rejects.toBeInstanceOf(Error); // acting-lawyer bile bu yabancı tenant'ta çözümlenemez (LAWYER_TENANT_MISMATCH ailesi)
  });

  describe('I15-D1-R1 — CaseDebtor target-binding (TRIGGER_HACIZ_CASE_DEBTOR_TARGET_UNBOUND düzeltmesi)', () => {
    it('TEST-12: CaseDebtor PASSIVE → deny, acting-lawyer/POA/capability HİÇBİRİ çağrılmaz (gerçek DB)', async () => {
      const { tenant, user, case: caseRow, caseDebtor } = await seed({ caseDebtorLifecycleStatus: 'PASSIVE' });
      await expect(
        service.assertAuthorized({
          tenantId: tenant.id,
          authenticatedUserId: user.id,
          caseId: caseRow.id,
          caseDebtorId: caseDebtor.id,
        }),
      ).rejects.toMatchObject({ message: expect.stringContaining('Pasif') });
    });

    it('TEST-13: terminal (tam pasivasyon metadata\'sı işlenmiş) CaseDebtor → aynı deny', async () => {
      const { tenant, user, case: caseRow, caseDebtor } = await seed();
      await prisma.caseDebtor.update({
        where: { id: caseDebtor.id },
        data: {
          lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE,
          passivatedAt: new Date(),
          passivationReason: 'Takipten düşürüldü (test)',
        },
      });
      await expect(
        service.assertAuthorized({
          tenantId: tenant.id,
          authenticatedUserId: user.id,
          caseId: caseRow.id,
          caseDebtorId: caseDebtor.id,
        }),
      ).rejects.toMatchObject({ message: expect.stringContaining('Pasif') });
    });

    it('TEST-14: nonexistent caseDebtorId → safe deny (gerçek DB, NotFound ailesi)', async () => {
      const { tenant, user, case: caseRow } = await seed();
      await expect(
        service.assertAuthorized({
          tenantId: tenant.id,
          authenticatedUserId: user.id,
          caseId: caseRow.id,
          caseDebtorId: 'nonexistent-case-debtor-id',
        }),
      ).rejects.toMatchObject({ message: expect.stringContaining('bulunamadı') });
    });

    it('TEST-15: cross-tenant caseDebtorId (başka tenant\'ın CaseDebtor\'u) → aynı safe deny', async () => {
      const { tenant, user, case: caseRow } = await seed();
      const { caseDebtor: foreignCaseDebtor } = await seed(); // farklı tenant'ta tam bir CaseDebtor
      await expect(
        service.assertAuthorized({
          tenantId: tenant.id,
          authenticatedUserId: user.id,
          caseId: caseRow.id,
          caseDebtorId: foreignCaseDebtor.id,
        }),
      ).rejects.toMatchObject({ message: expect.stringContaining('bulunamadı') });
    });

    it('TEST-16: wrong-case caseDebtorId (aynı tenant, BAŞKA Case\'in CaseDebtor\'u) → aynı safe deny', async () => {
      const { tenant, user, case: caseRow } = await seed();
      // Aynı tenant altında, tamamen ayrı bir Case + CaseDebtor.
      const otherCase = await prisma.case.create({
        data: { tenantId: tenant.id, fileNumber: `F-other-${Math.random().toString(36).slice(2, 8)}`, type: 'GENERAL_EXECUTION' as any },
      });
      const otherDebtor = await prisma.debtor.create({
        data: { tenantId: tenant.id, type: 'INDIVIDUAL' as any, firstName: 'Wrong', lastName: 'Case', name: 'Wrong Case' },
      });
      const otherCaseDebtor = await prisma.caseDebtor.create({
        data: { caseId: otherCase.id, debtorId: otherDebtor.id, role: DebtorRole.ASIL_BORCLU },
      });

      await expect(
        service.assertAuthorized({
          tenantId: tenant.id,
          authenticatedUserId: user.id,
          caseId: caseRow.id, // requested caseId
          caseDebtorId: otherCaseDebtor.id, // ama bu caseDebtor BAŞKA case'e ait
        }),
      ).rejects.toMatchObject({ message: expect.stringContaining('bulunamadı') });
    });

    it('TEST-17: aynı Case\'te birden fazla CaseDebtor varken yalnız EXACT requested target değerlendirilir', async () => {
      const { tenant, user, case: caseRow, debtor, caseDebtor, secondCaseDebtor } = await seed({
        withSecondCaseDebtor: true,
      });
      await expect(
        service.assertAuthorized({
          tenantId: tenant.id,
          authenticatedUserId: user.id,
          caseId: caseRow.id,
          caseDebtorId: caseDebtor.id, // yalnız İLK debtor'u hedefler
        }),
      ).resolves.toEqual({ debtorId: debtor.id }); // ikinci debtor'un id'si DEĞİL

      expect(secondCaseDebtor).toBeDefined();
    });

    it('TEST-18: başka debtor ACTIVE diye PASSIVE requested target geçemez ("herhangi biri aktif" varsayımı geçersiz)', async () => {
      const { tenant, user, case: caseRow, caseDebtor, secondCaseDebtor } = await seed({
        withSecondCaseDebtor: true,
        caseDebtorLifecycleStatus: 'PASSIVE', // ilk debtor (requested target) PASSIVE
        secondCaseDebtorLifecycleStatus: 'ACTIVE', // ikinci debtor ACTIVE ama hedef DEĞİL
      });
      await expect(
        service.assertAuthorized({
          tenantId: tenant.id,
          authenticatedUserId: user.id,
          caseId: caseRow.id,
          caseDebtorId: caseDebtor.id, // PASSIVE olan hedefleniyor
        }),
      ).rejects.toMatchObject({ message: expect.stringContaining('Pasif') });
      expect(secondCaseDebtor?.id).not.toBe(caseDebtor.id);
    });
  });

  describe('I15-D1-R1 — revalidateCaseDebtorFreshness (immediately-pre-effect, gerçek DB)', () => {
    it('TEST-19: authorization anında ACTIVE, dispatch\'ten hemen önce PASSIVE olmuşsa (TOCTOU) deny', async () => {
      const { tenant, user, case: caseRow, caseDebtor } = await seed();

      // 1) Authorization anı — henüz ACTIVE, başarıyla geçer.
      await expect(
        service.assertAuthorized({
          tenantId: tenant.id,
          authenticatedUserId: user.id,
          caseId: caseRow.id,
          caseDebtorId: caseDebtor.id,
        }),
      ).resolves.toBeDefined();

      // 2) Authorization ile dispatch arasındaki pencerede borçlu pasifleştirilir (gerçek yazım).
      await prisma.caseDebtor.update({
        where: { id: caseDebtor.id },
        data: { lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE },
      });

      // 3) Immediately-pre-effect revalidation artık TAZE durumu görür ve reddeder.
      await expect(
        service.revalidateCaseDebtorFreshness(tenant.id, caseRow.id, caseDebtor.id),
      ).rejects.toMatchObject({ message: expect.stringContaining('Pasif') });
    });

    it('TEST-20: TOCTOU penceresinde değişiklik yoksa revalidation sessizce PASS olur', async () => {
      const { tenant, user, case: caseRow, caseDebtor } = await seed();
      await service.assertAuthorized({
        tenantId: tenant.id,
        authenticatedUserId: user.id,
        caseId: caseRow.id,
        caseDebtorId: caseDebtor.id,
      });
      await expect(
        service.revalidateCaseDebtorFreshness(tenant.id, caseRow.id, caseDebtor.id),
      ).resolves.toBeUndefined();
    });
  });
});
