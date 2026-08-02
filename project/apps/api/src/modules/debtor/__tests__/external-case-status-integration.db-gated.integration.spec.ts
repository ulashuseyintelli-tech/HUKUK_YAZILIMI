import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { ThirdPartyService } from '../third-party.service';
import { CaseDebtorLifecycleGuardService } from '../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import { CollectionService } from '../../collection/collection.service';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { AuditService } from '../../audit/audit.service';
import { ActingLawyerResolverService } from '../../lawyer/acting-lawyer-resolver.service';
import { ExternalCaseStatusAuthorityService } from '../external-case-status-authority.service';
import { ExternalCaseStatusTransitionService } from '../external-case-status-transition.service';

// DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2-I02 (OWNER D2 POLICY DECISION —
// RATIFIED). Bu spec, TÜM D2-I02 zincirini (ActingLawyerResolverService (I01) +
// ExternalCaseStatusAuthorityService + ExternalCaseStatusTransitionService +
// ThirdPartyService) GERÇEK Postgres üzerinde, GERÇEK CaseLawyer/CaseStaff
// atamalarıyla uçtan uca kanıtlar. En kritik test (TEST-9), owner'ın açıkça
// istediği concurrency-fix kanıtıdır: N eşzamanlı addExternalCaseCollection()
// çağrısı sonrası receivedAmount TAM OLARAK toplam tahsilata eşit olmalı — eski
// read-aggregate-write deseninde bu kayıp güncellemeye (lost update) açıktı.

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('D2-I02 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('D2-I02 — ExternalCase status transition/close/collection (gerçek Postgres)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let thirdPartyService: ThirdPartyService;
  let transitionService: ExternalCaseStatusTransitionService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();

    const lifecycleGuard = new CaseDebtorLifecycleGuardService(prisma as any);
    const collectionService = new CollectionService(
      prisma as any,
      new DomainEventIngestService(),
      lifecycleGuard,
      undefined,
      undefined,
      undefined,
      new AuditService(prisma as any),
    );
    const authority = new ExternalCaseStatusAuthorityService(
      prisma as any,
      new ActingLawyerResolverService(prisma as any),
    );
    transitionService = new ExternalCaseStatusTransitionService(
      prisma as any,
      new AuditService(prisma as any),
      authority,
      lifecycleGuard,
    );
    thirdPartyService = new ThirdPartyService(prisma as any, collectionService, lifecycleGuard, transitionService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createFixture(label: string) {
    const suffix = randomUUID();
    const tenantId = `d2i02-${label}-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: `D2-I02 ${label}`, slug: tenantId } });
    const client = await prisma.client.create({
      data: { tenantId, displayName: 'D2-I02 Client', type: 'INDIVIDUAL' },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `D2I02-${suffix.slice(0, 8)}`,
        type: 'GENERAL_EXECUTION',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
      },
    });
    const debtor = await prisma.debtor.create({
      data: { tenantId, type: 'INDIVIDUAL', firstName: 'Test', lastName: 'Borclu', name: 'Test Borclu' },
    });
    const caseDebtor = await prisma.caseDebtor.create({
      data: { caseId: caseRow.id, debtorId: debtor.id, lifecycleStatus: 'ACTIVE' },
    });

    // Atanmış avukat (CaseLawyer roster üyesi).
    const lawyerUser = await prisma.user.create({
      data: { tenantId, email: `lawyer-${suffix}@test.local`, name: 'Test', surname: 'Avukat' },
    });
    const lawyer = await prisma.lawyer.create({
      data: { tenantId, name: 'Test', surname: 'Avukat', userId: lawyerUser.id, isActive: true },
    });
    await prisma.caseLawyer.create({ data: { caseId: caseRow.id, lawyerId: lawyer.id } });

    // canEdit=true atanmış personel.
    const editableStaffUser = await prisma.user.create({
      data: { tenantId, email: `staff-edit-${suffix}@test.local`, name: 'Test', surname: 'Personel' },
    });
    const editableStaff = await prisma.staffMember.create({
      data: {
        tenantId,
        firstName: 'Test',
        lastName: 'Personel',
        staffType: 'SEKRETER',
        userId: editableStaffUser.id,
        isActive: true,
      },
    });
    await prisma.caseStaff.create({
      data: { caseId: caseRow.id, staffMemberId: editableStaff.id, roleOnCase: 'KONTROL', canEdit: true },
    });

    // canEdit=false atanmış personel (yetkisiz).
    const readonlyStaffUser = await prisma.user.create({
      data: { tenantId, email: `staff-ro-${suffix}@test.local`, name: 'Test', surname: 'ReadOnly' },
    });
    const readonlyStaff = await prisma.staffMember.create({
      data: {
        tenantId,
        firstName: 'Test',
        lastName: 'ReadOnly',
        staffType: 'SEKRETER',
        userId: readonlyStaffUser.id,
        isActive: true,
      },
    });
    await prisma.caseStaff.create({
      data: { caseId: caseRow.id, staffMemberId: readonlyStaff.id, roleOnCase: 'KONTROL', canEdit: false },
    });

    // Hiçbir atamaya sahip olmayan kullanıcı.
    const strangerUser = await prisma.user.create({
      data: { tenantId, email: `stranger-${suffix}@test.local`, name: 'Test', surname: 'Yabanci' },
    });

    return {
      tenantId,
      caseId: caseRow.id,
      caseDebtorId: caseDebtor.id,
      lawyerUserId: lawyerUser.id,
      editableStaffUserId: editableStaffUser.id,
      readonlyStaffUserId: readonlyStaffUser.id,
      strangerUserId: strangerUser.id,
    };
  }

  async function createExternalCaseFixture(fx: Awaited<ReturnType<typeof createFixture>>, overrides: Record<string, unknown> = {}) {
    return prisma.externalCase.create({
      data: {
        tenantId: fx.tenantId,
        caseDebtorId: fx.caseDebtorId,
        externalOffice: 'Ankara 5. İcra Dairesi',
        externalCaseNo: `2026/${randomUUID().slice(0, 8)}`,
        counterpartyName: 'Karşı Taraf A.Ş.',
        claimAmount: 1000,
        claimCurrency: 'TRY',
        ...overrides,
      },
    });
  }

  it('TEST-1: atanmış avukat manuel geçiş yapabilir (HACIZ_TALEP->CEVAP_BEKLENIYOR)', async () => {
    const fx = await createFixture('t1');
    const ec = await createExternalCaseFixture(fx);

    const result = await transitionService.transitionManual(
      fx.tenantId,
      ec.id,
      { expectedStatus: 'HACIZ_TALEP' as any, targetStatus: 'CEVAP_BEKLENIYOR' as any },
      fx.lawyerUserId,
    );
    expect(result.status).toBe('TRANSITIONED');

    const reloaded = await prisma.externalCase.findUnique({ where: { id: ec.id } });
    expect(reloaded?.attachmentStatus).toBe('CEVAP_BEKLENIYOR');
    expect(reloaded?.statusChangedBy).toBe(fx.lawyerUserId);

    const auditRows = await prisma.auditLog.findMany({ where: { tenantId: fx.tenantId, entityId: ec.id } });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    expect(auditRows[0].action).toBe('EXTERNAL_CASE_STATUS_TRANSITIONED');
  });

  it('TEST-2: canEdit=true personel manuel FACT/PROCESS geçişi yapabilir', async () => {
    const fx = await createFixture('t2');
    const ec = await createExternalCaseFixture(fx);

    const result = await transitionService.transitionManual(
      fx.tenantId,
      ec.id,
      { expectedStatus: 'HACIZ_TALEP' as any, targetStatus: 'HACIZ_KONDU' as any },
      fx.editableStaffUserId,
    );
    expect(result.status).toBe('TRANSITIONED');
  });

  it('TEST-3: canEdit=false personel REDDEDİLİR, DB değişmez', async () => {
    const fx = await createFixture('t3');
    const ec = await createExternalCaseFixture(fx);

    await expect(
      transitionService.transitionManual(
        fx.tenantId,
        ec.id,
        { expectedStatus: 'HACIZ_TALEP' as any, targetStatus: 'HACIZ_KONDU' as any },
        fx.readonlyStaffUserId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const reloaded = await prisma.externalCase.findUnique({ where: { id: ec.id } });
    expect(reloaded?.attachmentStatus).toBe('HACIZ_TALEP');
  });

  it('TEST-4: hiçbir ataması olmayan kullanıcı REDDEDİLİR', async () => {
    const fx = await createFixture('t4');
    const ec = await createExternalCaseFixture(fx);

    await expect(
      transitionService.transitionManual(
        fx.tenantId,
        ec.id,
        { expectedStatus: 'HACIZ_TALEP' as any, targetStatus: 'CEVAP_BEKLENIYOR' as any },
        fx.strangerUserId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('TEST-5: avukat manuel kapatabilir (NEGATIVE_RESPONSE)', async () => {
    const fx = await createFixture('t5');
    const ec = await createExternalCaseFixture(fx, { attachmentStatus: 'HACIZ_KONDU' });

    const result = await transitionService.closeManual(
      fx.tenantId,
      ec.id,
      { expectedStatus: 'HACIZ_KONDU' as any, closureReason: 'NEGATIVE_RESPONSE' as any },
      fx.lawyerUserId,
    );
    expect(result.status).toBe('TRANSITIONED');
    const reloaded = await prisma.externalCase.findUnique({ where: { id: ec.id } });
    expect(reloaded?.attachmentStatus).toBe('KAPANDI');
    expect(reloaded?.closureReason).toBe('NEGATIVE_RESPONSE');
  });

  it('TEST-6: canEdit=true personel manuel kapatamaz (yalnız avukat)', async () => {
    const fx = await createFixture('t6');
    const ec = await createExternalCaseFixture(fx, { attachmentStatus: 'HACIZ_KONDU' });

    await expect(
      transitionService.closeManual(
        fx.tenantId,
        ec.id,
        { expectedStatus: 'HACIZ_KONDU' as any, closureReason: 'OTHER' as any },
        fx.editableStaffUserId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const reloaded = await prisma.externalCase.findUnique({ where: { id: ec.id } });
    expect(reloaded?.attachmentStatus).toBe('HACIZ_KONDU');
  });

  it('TEST-7: pasif CaseDebtor üzerinde manuel geçiş reddedilir', async () => {
    const fx = await createFixture('t7');
    await prisma.caseDebtor.update({ where: { id: fx.caseDebtorId }, data: { lifecycleStatus: 'PASSIVE' } });
    const ec = await createExternalCaseFixture(fx);

    await expect(
      transitionService.transitionManual(
        fx.tenantId,
        ec.id,
        { expectedStatus: 'HACIZ_TALEP' as any, targetStatus: 'CEVAP_BEKLENIYOR' as any },
        fx.lawyerUserId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('TEST-8: CAS çakışması — stale expectedStatus ile ikinci istek ConflictException alır', async () => {
    const fx = await createFixture('t8');
    const ec = await createExternalCaseFixture(fx);

    await transitionService.transitionManual(
      fx.tenantId,
      ec.id,
      { expectedStatus: 'HACIZ_TALEP' as any, targetStatus: 'CEVAP_BEKLENIYOR' as any },
      fx.lawyerUserId,
    );

    // Aynı stale expectedStatus (HACIZ_TALEP) ile TEKRAR — gerçek durum artık CEVAP_BEKLENIYOR.
    await expect(
      transitionService.transitionManual(
        fx.tenantId,
        ec.id,
        { expectedStatus: 'HACIZ_TALEP' as any, targetStatus: 'HACIZ_KONDU' as any },
        fx.lawyerUserId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('TEST-9 (KRİTİK — concurrency fix kanıtı): 10 eşzamanlı addExternalCaseCollection() lost-update YARATMAZ', async () => {
    const fx = await createFixture('t9');
    const ec = await createExternalCaseFixture(fx, { attachmentStatus: 'HACIZ_KONDU', claimAmount: 10000 });

    const CONCURRENT_COUNT = 10;
    const AMOUNT_EACH = 100;
    const results = await Promise.all(
      Array.from({ length: CONCURRENT_COUNT }, (_, i) =>
        thirdPartyService.addExternalCaseCollection(
          fx.tenantId,
          ec.id,
          { amount: AMOUNT_EACH, date: '2026-07-01', idempotencyKey: `concurrent-${i}-${ec.id}` },
          fx.lawyerUserId,
        ),
      ),
    );
    expect(results).toHaveLength(CONCURRENT_COUNT);

    const reloaded = await prisma.externalCase.findUnique({ where: { id: ec.id } });
    // Eski read-aggregate-write deseninde bu değer < 1000 olabilirdi (lost update).
    expect(Number(reloaded?.receivedAmount)).toBe(CONCURRENT_COUNT * AMOUNT_EACH);

    const confirmedSum = await prisma.collection.aggregate({
      where: { tenantId: fx.tenantId, sourceType: 'EXTERNAL_CASE', status: 'CONFIRMED', sourceId: { startsWith: `${ec.id}:` } },
      _sum: { amount: true },
    });
    expect(Number(confirmedSum._sum.amount)).toBe(CONCURRENT_COUNT * AMOUNT_EACH);
    // receivedAmount projeksiyonu canonical Collection toplamıyla TAM eşleşmeli.
    expect(Number(reloaded?.receivedAmount)).toBe(Number(confirmedSum._sum.amount));
  });

  it('TEST-10: tam tahsilat sonrası KAPANDI + closureReason=FULLY_COLLECTED sistem tarafından set edilir', async () => {
    const fx = await createFixture('t10');
    const ec = await createExternalCaseFixture(fx, { attachmentStatus: 'HACIZ_KONDU', claimAmount: 500 });

    await thirdPartyService.addExternalCaseCollection(
      fx.tenantId,
      ec.id,
      { amount: 500, date: '2026-07-01' },
      fx.lawyerUserId,
    );

    const reloaded = await prisma.externalCase.findUnique({ where: { id: ec.id } });
    expect(reloaded?.attachmentStatus).toBe('KAPANDI');
    expect(reloaded?.closureReason).toBe('FULLY_COLLECTED');
    expect(reloaded?.statusSource).toBe('SYSTEM_DERIVED');
    expect(reloaded?.statusChangedBy).toBeNull();
  });

  it('TEST-11: generic updateExternalCase() sistem tarafından türetilmiş KAPANDI/closureReason\'ı bozamaz (alan yok)', async () => {
    const fx = await createFixture('t11');
    const ec = await createExternalCaseFixture(fx, { attachmentStatus: 'HACIZ_KONDU', claimAmount: 200 });
    await thirdPartyService.addExternalCaseCollection(fx.tenantId, ec.id, { amount: 200, date: '2026-07-01' }, fx.lawyerUserId);

    await thirdPartyService.updateExternalCase(fx.tenantId, ec.id, { notes: 'yalnız not güncellemesi' } as any);

    const reloaded = await prisma.externalCase.findUnique({ where: { id: ec.id } });
    expect(reloaded?.attachmentStatus).toBe('KAPANDI');
    expect(reloaded?.closureReason).toBe('FULLY_COLLECTED');
    expect(reloaded?.notes).toBe('yalnız not güncellemesi');
  });
});
