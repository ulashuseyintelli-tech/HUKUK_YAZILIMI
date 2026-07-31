/** @jest-environment node */
/**
 * I15-D1 — TriggerHacizAuthorizationService gerçek Postgres üzerinde uçtan uca kompozisyon.
 *
 * Sahte `where` koşulları değil, GERÇEK Prisma sorguları + gerçek satırlar kullanılır — bu,
 * mocked unit testlerin yakalayamayacağı (ör. Prisma composite-FK/select şekli hataları)
 * bir güvence katmanıdır. TEST_DATABASE_URL yoksa suite atlanır.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:test@localhost:5436/hukuk_test_i15d1
 */
import { PrismaClient, PermissionGrantEffect, PermissionGrantScope } from '@prisma/client';
import { ActingLawyerResolverService } from '../../../lawyer/acting-lawyer-resolver.service';
import { UyapSendAuthorityResolverService } from '../uyap-send-authority-resolver.service';
import { TriggerHacizCapabilityAuthorizationService, TRIGGER_HACIZ_PERMISSION_KEY } from '../trigger-haciz-capability-authorization.service';
import { TriggerHacizAuthorizationService } from '../trigger-haciz-authorization.service';

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe('I15-D1 TriggerHacizAuthorizationService — disposable DB', () => {
  let prisma: PrismaClient;
  let service: TriggerHacizAuthorizationService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const actingLawyerResolver = new ActingLawyerResolverService(prisma as any);
    const sendAuthorityResolver = new UyapSendAuthorityResolverService(prisma as any);
    const capabilityAuthorization = new TriggerHacizCapabilityAuthorizationService(prisma as any);
    service = new TriggerHacizAuthorizationService(
      prisma as any,
      actingLawyerResolver,
      sendAuthorityResolver,
      capabilityAuthorization,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Her test kendi tam-izole tenant/case/lawyer/client/POA/grant kümesini kurar. */
  async function seed(opts: {
    scopeType?: 'GENEL' | 'ICRA_TAKIP' | 'BU_DOSYA' | 'OZEL';
    assignOtherLawyerToCase?: boolean;
    poaForOtherLawyer?: boolean;
    grant?: { effect: PermissionGrantEffect; scope?: PermissionGrantScope; validUntil?: Date | null } | null;
    poaRevoked?: boolean;
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

    return { tenant, user, lawyer, otherLawyer, client, case: caseRow, poa };
  }

  it('TEST-01: GENEL POA + case-assignment + explicit ALLOW grant → gerçek Postgres üzerinde başarı', async () => {
    const { tenant, user, case: caseRow } = await seed({ scopeType: 'GENEL' });
    await expect(
      service.assertAuthorized({ tenantId: tenant.id, authenticatedUserId: user.id, caseId: caseRow.id }),
    ).resolves.toBeUndefined();
  });

  it('TEST-02: ICRA_TAKIP POA + case-assignment + explicit ALLOW grant → başarı', async () => {
    const { tenant, user, case: caseRow } = await seed({ scopeType: 'ICRA_TAKIP' });
    await expect(
      service.assertAuthorized({ tenantId: tenant.id, authenticatedUserId: user.id, caseId: caseRow.id }),
    ).resolves.toBeUndefined();
  });

  it.each(['BU_DOSYA', 'OZEL'] as const)('TEST-03/04: %s scope → deny (gerçek DB, owner-ratifiye kapsam dışı)', async (scopeType) => {
    const { tenant, user, case: caseRow } = await seed({ scopeType });
    await expect(
      service.assertAuthorized({ tenantId: tenant.id, authenticatedUserId: user.id, caseId: caseRow.id }),
    ).rejects.toMatchObject({ response: { code: 'POWER_OF_ATTORNEY_SCOPE_MISMATCH' } });
  });

  it('TEST-05: PermissionGrant hiç yoksa → deny (gerçek DB)', async () => {
    const { tenant, user, case: caseRow } = await seed({ grant: null });
    await expect(
      service.assertAuthorized({ tenantId: tenant.id, authenticatedUserId: user.id, caseId: caseRow.id }),
    ).rejects.toMatchObject({ response: { code: 'TRIGGER_HACIZ_CAPABILITY_REQUIRED' } });
  });

  it('TEST-06: explicit DENY, ALLOW\'un yanında olsa bile öncelikli → deny (gerçek DB)', async () => {
    const { tenant, user, case: caseRow } = await seed();
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
      service.assertAuthorized({ tenantId: tenant.id, authenticatedUserId: user.id, caseId: caseRow.id }),
    ).rejects.toMatchObject({ response: { code: 'TRIGGER_HACIZ_CAPABILITY_EXPLICIT_DENY' } });
  });

  it('TEST-07: acting lawyer case\'e atanmamışsa (başka avukat atanmış) → deny — gerçek CaseLawyer sorgusu', async () => {
    const { tenant, user, case: caseRow } = await seed({ assignOtherLawyerToCase: true });
    await expect(
      service.assertAuthorized({ tenantId: tenant.id, authenticatedUserId: user.id, caseId: caseRow.id }),
    ).rejects.toMatchObject({ response: { code: 'TRIGGER_HACIZ_CASE_ASSIGNMENT_REQUIRED' } });
  });

  it('TEST-08: POA başka avukata aitse (acting lawyer POA-lawyer eşleşmesi yok) → deny', async () => {
    const { tenant, user, case: caseRow } = await seed({ poaForOtherLawyer: true });
    await expect(
      service.assertAuthorized({ tenantId: tenant.id, authenticatedUserId: user.id, caseId: caseRow.id }),
    ).rejects.toMatchObject({ response: { code: 'POWER_OF_ATTORNEY_MISSING' } });
  });

  it('TEST-09: revoked POA → deny (gerçek DB lifecycle kontrolü)', async () => {
    const { tenant, user, case: caseRow } = await seed({ poaRevoked: true });
    await expect(
      service.assertAuthorized({ tenantId: tenant.id, authenticatedUserId: user.id, caseId: caseRow.id }),
    ).rejects.toMatchObject({ response: { code: 'POWER_OF_ATTORNEY_REVOKED' } });
  });

  it('TEST-10: süresi dolmuş GLOBAL grant → deny (gerçek DB temporal filtre)', async () => {
    const { tenant, user, case: caseRow } = await seed({
      grant: { effect: PermissionGrantEffect.ALLOW, validUntil: new Date('2020-01-01T00:00:00.000Z') },
    });
    await expect(
      service.assertAuthorized({ tenantId: tenant.id, authenticatedUserId: user.id, caseId: caseRow.id }),
    ).rejects.toMatchObject({ response: { code: 'TRIGGER_HACIZ_CAPABILITY_REQUIRED' } });
  });

  it('TEST-11: cross-tenant PermissionGrant (başka tenant\'ta grant var) requester\'ı yetkilendirmez', async () => {
    const { user, case: caseRow } = await seed({ grant: null });
    const { tenant: otherTenant } = await seed(); // farklı tenant'ta ALLOW grant içeren tam set
    await expect(
      service.assertAuthorized({ tenantId: otherTenant.id, authenticatedUserId: user.id, caseId: caseRow.id }),
    ).rejects.toBeInstanceOf(Error); // acting-lawyer bile bu yabancı tenant'ta çözümlenemez (LAWYER_TENANT_MISMATCH ailesi)
  });
});
