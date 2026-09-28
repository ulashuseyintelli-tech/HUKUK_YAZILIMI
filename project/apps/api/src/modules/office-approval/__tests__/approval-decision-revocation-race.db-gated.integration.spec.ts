/**
 * K4-1 (owner GO 2026-09-28) — genel onay KARARLARI ile yetki iptali arasındaki yarış, gerçek PostgreSQL'de.
 *
 * Önceki kusur: `approve / reject / approveWithChanges / requestRevision` yetkiyi transaction DIŞINDA kilitsiz
 * okuyordu; `commitDecision` aynı transaction'da durum CAS'ı + domain senkronu (burada: ClaimItem yüksek etkili
 * faiz değişikliğinin uygulanması) yapıyordu. Arada commit edilen iptal kararı durdurmuyordu.
 *
 * Ölçülen:
 *  - meşru yollar: delege avukatın approve / reject / requestRevision / approveWithChanges kararları;
 *  - iptal ÖNCE commit eder (gerçek LawyerService.update) → dört yolun hiçbiri karar/yan etki/denetim yazmaz;
 *  - karar kilidi ÖNCE alır → iptal (gerçek LawyerService.update) karar commit edene kadar BEKLER;
 *  - iptal satırı ÖNCE kilitler → karar BEKLER, iptal commit edince taze satırı okur ve REDDEDİLİR
 *    (yamasız kodda bu karar GEÇİYOR ve ClaimItem değişiyordu);
 *  - pasifleştirme (gerçek LawyerService.delete: Lawyer → User) karar kilidini bekler, kilitlenme olmaz;
 *  - hata: domain senkronu yazdıktan SONRA hata → karar ve ClaimItem değişikliği birlikte geri alınır;
 *  - actionCode dağıtımı kilit altında: CLIENT_PAYOUT_POST (MANAGER) payout politikasıyla değerlendirilir;
 *  - öz-onay yasağı korunur.
 *
 * Gerçek Nest DI (ClaimItemModule → OfficeApprovalModule → DomainSync); talepler üretim yoluyla
 * (ClaimItemService.updateFromUser → yüksek etkili onay talebi) açılır. GÜVENLİK: yalnız TEST_DATABASE_URL
 * (test/gate adlı disposable DB); her test kendi sentetik tenant'ında.
 */
import { ForbiddenException, INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OfficeApprovalStatus, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ClaimItemModule } from '../../claim-item/claim-item.module';
import { ClaimItemService } from '../../claim-item/claim-item.service';
import { LawyerService } from '../../lawyer/lawyer.service';
import { OfficeApprovalDomainSyncService } from '../office-approval-domain-sync.service';
import { OfficeApprovalService } from '../office-approval.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('K4-1 karar yarisi DB kapisi: CI onayli TEST_DATABASE_URL ister.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const BLOCK_PROBE_MS = 700;

/** Bir promise'in verilen süre içinde SONUÇLANMADIĞINI (kilitte beklediğini) ölçer. */
async function isStillPending(p: Promise<unknown>, ms = BLOCK_PROBE_MS): Promise<boolean> {
  const marker = Symbol('pending');
  const winner = await Promise.race([p.then(() => 'settled', () => 'settled'), new Promise((r) => setTimeout(() => r(marker), ms))]);
  return winner === marker;
}

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((r) => { open = r; });
  return { open, opened };
}

type Decision = 'approve' | 'reject' | 'requestRevision' | 'approveWithChanges';

/** Karar denetimleri (talep açılışının `OFFICE_APPROVAL_REQUESTED` kaydı HARİÇ). */
const DECISION_AUDIT_ACTIONS = [
  'OFFICE_APPROVAL_APPROVED',
  'OFFICE_APPROVAL_REJECTED',
  'OFFICE_APPROVAL_REVISION_REQUESTED',
  'OFFICE_APPROVAL_APPROVED_WITH_CHANGES',
];

describeWithDisposableDb('K4-1 — genel onay kararı ile yetki iptali gerçek PostgreSQL üzerinde serileşir', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let approvals: OfficeApprovalService;
  let claimItems: ClaimItemService;
  let domainSync: OfficeApprovalDomainSyncService;
  let lawyers: LawyerService;
  const tenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), ClaimItemModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    approvals = app.get(OfficeApprovalService);
    claimItems = app.get(ClaimItemService);
    domainSync = app.get(OfficeApprovalDomainSyncService, { strict: false });
    // Gerçek iptal yolları (LawyerModule'ün kurduğu grafiğin aynısı; aynı OfficeApprovalService örneği).
    lawyers = new LawyerService(app.get(PrismaService, { strict: false }), app.get(AuditService, { strict: false }), approvals);
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await app?.close();
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  /**
   * Tenant + ofis + dosya + ClaimItem (faiz işletimi UNKNOWN). Aktörler:
   *  requester (USER+LAWYER, dosyada canEditFinance) · approver (USER+LAWYER, delege canApproveOfficeActions)
   *  admin (ADMIN; delegasyon/rütbe iptali) · partner (USER+PARTNER; pasifleştirmeyi yapan)
   */
  async function seed(label: string, approverShape: { lawyerRank: 'LAWYER' | 'MANAGER'; canApprove: boolean } = { lawyerRank: 'LAWYER', canApprove: true }) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-k41-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI K41 ${label}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: `CI K41 ofis ${label}` } });

    async function actor(key: string, role: 'USER' | 'ADMIN', lawyer?: { lawyerRank: 'LAWYER' | 'MANAGER' | 'PARTNER'; canApprove?: boolean }) {
      const user = await prisma.user.create({
        data: { tenantId, email: `${key}-${suffix}@example.test`, name: key, surname: 'K41', role },
      });
      const lw = lawyer
        ? await prisma.lawyer.create({
            data: {
              tenantId,
              officeId: office.id,
              userId: user.id,
              name: key,
              surname: 'K41',
              lawyerRank: lawyer.lawyerRank,
              canApproveOfficeActions: lawyer.canApprove ?? false,
            },
          })
        : null;
      return { userId: user.id, lawyerId: lw?.id as string };
    }

    const requester = await actor('req', 'USER', { lawyerRank: 'LAWYER' });
    const approver = await actor('appr', 'USER', approverShape);
    const admin = await actor('admin', 'ADMIN');
    const partner = await actor('partner', 'USER', { lawyerRank: 'PARTNER' });

    const legalCase = await prisma.case.create({
      data: { tenantId, fileNumber: `CI-K41-${label}-${suffix}`, type: 'GENERAL_EXECUTION' },
    });
    await prisma.caseLawyer.create({
      data: { caseId: legalCase.id, lawyerId: requester.lawyerId, casePermissions: { canEditFinance: true } },
    });
    const item = await prisma.claimItem.create({
      data: {
        tenantId,
        caseId: legalCase.id,
        itemType: 'PRINCIPAL',
        originalAmount: 10_000,
        demandedAmount: 10_000,
        amount: 10_000,
        currency: 'TRY',
        interestTypeCode: 'LEGAL_3095',
        interestType: 'YASAL',
        interestAccrualStatus: 'UNKNOWN',
        liableDebtorIds: [],
      },
    });
    return { tenantId, requester, approver, admin, partner, claimItemId: item.id };
  }
  type Seed = Awaited<ReturnType<typeof seed>>;

  /** Üretim yolu: kullanıcı faiz işletimi yaması → yüksek etkili onay talebi (kalem onaya kadar DEĞİŞMEZ). */
  async function claimItemRequest(s: Seed): Promise<string> {
    const res: any = await claimItems.updateFromUser(s.tenantId, s.requester.userId, s.claimItemId, {
      interestAccrualStatus: 'ACCRUES',
      interestStartDate: '2026-01-15T00:00:00.000Z',
      interestStartDateProvenance: 'DOCUMENT_DUE_DATE',
    } as any);
    expect(res).toEqual(expect.objectContaining({ applied: false, approvalRequired: true }));
    return res.approvalRequestId as string;
  }

  /** Domain senkronu OLMAYAN genel talep (approveWithChanges'in meşru yolu). */
  async function genericRequest(s: Seed, actionCode = 'CHANGE_STATUS'): Promise<string> {
    const req = await approvals.createPendingRequest({
      tenantId: s.tenantId,
      actionCode: actionCode as any,
      targetType: 'LegalCase',
      targetRef: `case-${randomUUID().slice(0, 8)}`,
      requesterUserId: s.requester.userId,
      savedIntent: { status: 'HITAM' },
    });
    return req.id;
  }

  function decide(decision: Decision, requestId: string, approverUserId: string) {
    switch (decision) {
      case 'approve':
        return approvals.approve(requestId, approverUserId, 'K41 onay');
      case 'reject':
        return approvals.reject(requestId, approverUserId, 'K41 ret');
      case 'requestRevision':
        return approvals.requestRevision(requestId, approverUserId, 'K41 revizyon');
      case 'approveWithChanges':
        return approvals.approveWithChanges(requestId, approverUserId, { status: 'DERDEST' }, 'K41 degisiklikle');
    }
  }

  const expectedStatus: Record<Decision, OfficeApprovalStatus> = {
    approve: OfficeApprovalStatus.APPROVED,
    reject: OfficeApprovalStatus.REJECTED,
    requestRevision: OfficeApprovalStatus.REVISION_REQUESTED,
    approveWithChanges: OfficeApprovalStatus.APPROVED_WITH_CHANGES,
  };

  /** Karar/yan etki/denetim YOK: talep PENDING + onaylayıcısız, kalem UNKNOWN, karar denetim kaydı yok. */
  async function expectNoDecision(s: Seed, requestId: string) {
    const req = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(req.status).toBe(OfficeApprovalStatus.PENDING_APPROVAL);
    expect(req.approverUserId).toBeNull();
    expect(req.decidedAt).toBeNull();
    const item = await prisma.claimItem.findUniqueOrThrow({ where: { id: s.claimItemId } });
    expect(item.interestAccrualStatus).toBe('UNKNOWN');
    expect(
      await prisma.auditLog.count({ where: { tenantId: s.tenantId, action: { in: DECISION_AUDIT_ACTIONS }, entityId: requestId } }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({ where: { tenantId: s.tenantId, action: 'CLAIM_ITEM_HIGH_IMPACT_UPDATE_APPLIED' } }),
    ).toBe(0);
  }

  const revokeDelegation = (s: Seed) =>
    lawyers.update(s.tenantId, s.approver.lawyerId, { canApproveOfficeActions: false } as never, { userId: s.admin.userId, role: 'ADMIN' } as never);

  describe('meşru kararlar çalışır', () => {
    it('approve: delege avukat onaylar → APPROVED, ClaimItem faiz değişikliği uygulanır', async () => {
      const s = await seed('ok-approve');
      const requestId = await claimItemRequest(s);
      const decided = await approvals.approve(requestId, s.approver.userId);

      expect(decided.status).toBe(OfficeApprovalStatus.APPROVED);
      const item = await prisma.claimItem.findUniqueOrThrow({ where: { id: s.claimItemId } });
      expect(item.interestAccrualStatus).toBe('ACCRUES');
    });

    it.each(['reject', 'requestRevision'] as const)('%s: delege avukat karar verir; ClaimItem değişmez', async (decision) => {
      const s = await seed(`ok-${decision}`);
      const requestId = await claimItemRequest(s);
      const decided = await decide(decision, requestId, s.approver.userId);

      expect(decided.status).toBe(expectedStatus[decision]);
      const item = await prisma.claimItem.findUniqueOrThrow({ where: { id: s.claimItemId } });
      expect(item.interestAccrualStatus).toBe('UNKNOWN');
    });

    it('approveWithChanges: genel talepte delege avukat → APPROVED_WITH_CHANGES + replacement izi', async () => {
      const s = await seed('ok-awc');
      const requestId = await genericRequest(s);
      const decided = await approvals.approveWithChanges(requestId, s.approver.userId, { status: 'DERDEST' });

      expect(decided.status).toBe(OfficeApprovalStatus.APPROVED_WITH_CHANGES);
      expect(decided.replacementPayloadHash).toEqual(expect.any(String));
    });

    it('öz-onay yasağı korunur: talep sahibi kendi talebini onaylayamaz', async () => {
      const s = await seed('self');
      const requestId = await claimItemRequest(s);
      await expect(approvals.approve(requestId, s.requester.userId)).rejects.toThrow('SELF_APPROVAL_FORBIDDEN');
      await expectNoDecision(s, requestId);
    });
  });

  describe('iptal ÖNCE commit eder (gerçek LawyerService.update) → karar ve yan etkileri uygulanmaz', () => {
    it.each(['approve', 'reject', 'requestRevision'] as const)('%s: 403; talep PENDING, ClaimItem değişmez, denetim yok', async (decision) => {
      const s = await seed(`revoked-${decision}`);
      const requestId = await claimItemRequest(s);
      await revokeDelegation(s);

      await expect(decide(decision, requestId, s.approver.userId)).rejects.toBeInstanceOf(ForbiddenException);
      await expectNoDecision(s, requestId);
    });

    it('approveWithChanges: 403; genel talep PENDING kalır', async () => {
      const s = await seed('revoked-awc');
      const requestId = await genericRequest(s);
      await revokeDelegation(s);

      await expect(decide('approveWithChanges', requestId, s.approver.userId)).rejects.toBeInstanceOf(ForbiddenException);
      const req = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: requestId } });
      expect(req.status).toBe(OfficeApprovalStatus.PENDING_APPROVAL);
      expect(req.replacementPayloadHash).toBeNull();
    });
  });

  describe('iptal satırı ÖNCE kilitler → karar BEKLER, taze satırı okur ve REDDEDİLİR', () => {
    it.each(['approve', 'reject', 'requestRevision'] as const)('%s: kilit bekler; iptal commit edince 403, yan etki yok', async (decision) => {
      const s = await seed(`lockfirst-${decision}`);
      const requestId = await claimItemRequest(s);
      const g = gate();
      // LawyerService.update'in delegasyon iptali için çalıştırdığı AYNI satır güncellemesi; transaction açık tutulur.
      const revocation = prisma.$transaction(async (tx) => {
        await tx.lawyer.update({ where: { id: s.approver.lawyerId }, data: { canApproveOfficeActions: false } });
        await g.opened;
      }, { timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 200)); // iptal satırı kilitlesin

      const decision$ = decide(decision, requestId, s.approver.userId);
      expect(await isStillPending(decision$)).toBe(true); // karar aktör satırı kilidinde bekliyor
      g.open();
      await revocation;
      await expect(decision$).rejects.toBeInstanceOf(ForbiddenException);
      await expectNoDecision(s, requestId);
    });
  });

  it('karar kilidi ÖNCE alır → iptal (gerçek LawyerService.update) karar commit edene kadar BEKLER, sonra uygulanır', async () => {
    const s = await seed('decision-first');
    const requestId = await claimItemRequest(s);
    const g = gate();
    const events: string[] = [];
    const realSync = domainSync.syncAfterDecision.bind(domainSync);
    jest.spyOn(domainSync, 'syncAfterDecision').mockImplementation(async (tx, updated) => {
      await realSync(tx, updated);
      events.push('decision:side-effect-written');
      await g.opened; // kararın commit'ten önceki süresini temsil eder
    });

    const decision$ = approvals.approve(requestId, s.approver.userId).then((r) => { events.push('decision:committed'); return r; });
    await new Promise((r) => setTimeout(r, 300)); // karar kilidi alsın
    const revocation = revokeDelegation(s).then(() => { events.push('revoke:done'); });

    expect(await isStillPending(revocation)).toBe(true); // iptal kilitte bekliyor
    g.open();
    const decided = await decision$;
    await revocation;

    expect(events).toEqual(['decision:side-effect-written', 'decision:committed', 'revoke:done']);
    expect(decided.status).toBe(OfficeApprovalStatus.APPROVED);
    expect((await prisma.claimItem.findUniqueOrThrow({ where: { id: s.claimItemId } })).interestAccrualStatus).toBe('ACCRUES');
    expect((await prisma.lawyer.findUniqueOrThrow({ where: { id: s.approver.lawyerId } })).canApproveOfficeActions).toBe(false);

    // İptal SONRASI yeni karar reddedilir.
    const next = await genericRequest(s);
    await expect(approvals.approve(next, s.approver.userId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('pasifleştirme (gerçek LawyerService.delete: Lawyer → User) karar kilidini bekler; kilitlenme OLUŞMAZ', async () => {
    const s = await seed('deactivate');
    const requestId = await claimItemRequest(s);
    const g = gate();
    const realSync = domainSync.syncAfterDecision.bind(domainSync);
    jest.spyOn(domainSync, 'syncAfterDecision').mockImplementation(async (tx, updated) => {
      await realSync(tx, updated);
      await g.opened;
    });

    const decision$ = approvals.approve(requestId, s.approver.userId);
    await new Promise((r) => setTimeout(r, 300));
    const deactivation = lawyers.delete(s.tenantId, s.approver.lawyerId, { userId: s.partner.userId } as never);

    expect(await isStillPending(deactivation)).toBe(true);
    g.open();
    await expect(decision$).resolves.toEqual(expect.objectContaining({ status: OfficeApprovalStatus.APPROVED }));
    await expect(deactivation).resolves.toBeDefined();
    const [lw, us] = await Promise.all([
      prisma.lawyer.findUniqueOrThrow({ where: { id: s.approver.lawyerId } }),
      prisma.user.findUniqueOrThrow({ where: { id: s.approver.userId } }),
    ]);
    expect(lw.isActive).toBe(false);
    expect(us.isActive).toBe(false);
  });

  describe('hata halinde kısmi domain yazısı oluşmaz', () => {
    it('domain senkronu kalemi YAZDIKTAN sonra hata → karar + ClaimItem + uygulama denetimi birlikte geri alınır', async () => {
      const s = await seed('sync-fail');
      const requestId = await claimItemRequest(s);
      const realSync = domainSync.syncAfterDecision.bind(domainSync);
      jest.spyOn(domainSync, 'syncAfterDecision').mockImplementation(async (tx, updated) => {
        await realSync(tx, updated); // ClaimItem ACCRUES + uygulama denetimi tx içinde yazıldı
        throw new Error('K41 enjekte hata');
      });

      await expect(approvals.approve(requestId, s.approver.userId)).rejects.toThrow('K41 enjekte hata');
      await expectNoDecision(s, requestId);
    });

    it('üretim kuralı reddi (ClaimItem talebi değiştirerek onaylanamaz) → CAS yazısı geri alınır', async () => {
      const s = await seed('awc-claim');
      const requestId = await claimItemRequest(s);

      await expect(approvals.approveWithChanges(requestId, s.approver.userId, { interestAccrualStatus: 'NO_INTEREST' })).rejects.toThrow(
        'degistirerek onaylanamaz',
      );
      await expectNoDecision(s, requestId);
    });
  });

  describe('actionCode dağıtımı kilit altında (CLIENT_PAYOUT_POST → payout politikası)', () => {
    it('meşru: MANAGER (delegesiz) payout talebini onaylar — genel yüklem değil payout politikası', async () => {
      const s = await seed('payout-ok', { lawyerRank: 'MANAGER', canApprove: false });
      const requestId = await genericRequest(s, 'CLIENT_PAYOUT_POST');
      await expect(approvals.approve(requestId, s.approver.userId)).resolves.toEqual(
        expect.objectContaining({ status: OfficeApprovalStatus.APPROVED }),
      );
    });

    it('rütbe düşürme satırı ÖNCE kilitler → payout onayı bekler ve REDDEDİLİR', async () => {
      const s = await seed('payout-race', { lawyerRank: 'MANAGER', canApprove: false });
      const requestId = await genericRequest(s, 'CLIENT_PAYOUT_POST');
      const g = gate();
      const demotion = prisma.$transaction(async (tx) => {
        await tx.lawyer.update({ where: { id: s.approver.lawyerId }, data: { lawyerRank: 'LAWYER' } });
        await g.opened;
      }, { timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 200));

      const decision$ = approvals.approve(requestId, s.approver.userId);
      expect(await isStillPending(decision$)).toBe(true);
      g.open();
      await demotion;
      await expect(decision$).rejects.toBeInstanceOf(ForbiddenException);
      const req = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: requestId } });
      expect(req.status).toBe(OfficeApprovalStatus.PENDING_APPROVAL);
    });
  });
});
