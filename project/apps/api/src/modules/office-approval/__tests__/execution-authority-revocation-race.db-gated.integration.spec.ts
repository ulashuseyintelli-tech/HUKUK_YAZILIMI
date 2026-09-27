/**
 * B10 (owner GO 2026-09-27) — yetki kontrolü ile mali yazma arasındaki YARIŞ, gerçek PostgreSQL'de.
 *
 * Yürütme yolları (dağıtım post'u, payout kesinleştirme, FD yayın/karar/kurtarma) yetkili aktör kontrolünü
 * transaction içinde, aktörün `Lawyer` ve `User` satırlarını `FOR SHARE` ile kilitleyerek yapar. Bu spec o
 * kilidin gerçek iptal yollarıyla (LawyerService.update: delegasyon kaldırma; LawyerService.delete: Lawyer +
 * User pasifleştirme) NASIL serileştiğini ölçer:
 *   - yetkili başarı / yetkisiz ret (VIEWER, delegesiz avukat),
 *   - iptal ÖNCE commit ederse yürütme reddedilir,
 *   - yürütme kilidi ÖNCE alırsa iptal yürütme bitene kadar BEKLER (ve sonra uygulanır),
 *   - iptal satırı ÖNCE kilitlerse yürütme BEKLER, iptal commit edince taze satırı okuyup REDDEDİLİR,
 *   - Lawyer → User sırasıyla kilitleyen pasifleştirme yolu kilitlenme (deadlock) üretmez.
 * `iptal satırı önce kilitler` senaryosu, transaction'ı açık tutabilmek için LawyerService.update'in çalıştırdığı
 * AYNI `UPDATE "Lawyer"` ifadesini elle açılan transaction'da yürütür; diğer iptaller gerçek servis çağrısıdır.
 *
 * GÜVENLİK: yalnız `TEST_DATABASE_URL` (test/gate adlı disposable DB); her koşum kendi sentetik tenant'ında.
 */
import { randomUUID } from 'crypto';
import { ForbiddenException } from '@nestjs/common';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { LawyerService } from '../../lawyer/lawyer.service';
import { OfficeApprovalService } from '../office-approval.service';
import { PayoutApprovalPolicy } from '../client-payout-approval.policy';
import { FINANCIAL_EXECUTION_DENIED_VIEWER } from '../office-approval-execution-authority';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('B10 yaris DB kapisi: CI onayli TEST_DATABASE_URL ister.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const TX = { timeout: 30_000, maxWait: 10_000 } as const;
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

describeWithDisposableDb('B10 — yürütme yetkisi ile yetki iptali gerçek PostgreSQL üzerinde serileşir', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaService;
  let audit: AuditService;
  let officeApproval: OfficeApprovalService;
  let payoutPolicy: PayoutApprovalPolicy;
  let lawyers: LawyerService;
  const tenants: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    audit = new AuditService(prisma);
    payoutPolicy = new PayoutApprovalPolicy(prisma);
    officeApproval = new OfficeApprovalService(prisma, audit, undefined, payoutPolicy);
    lawyers = new LawyerService(prisma, audit, officeApproval);
  });

  afterAll(async () => {
    for (const tenantId of tenants) {
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.lawyer.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.office.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  /** Sentetik tenant: tek ofis, ADMIN (iptali yapan), PARTNER (pasifleştirmeyi yapan) ve istenen yürütücü. */
  async function seed(executor: { role: 'USER' | 'VIEWER'; lawyerRank: 'PARTNER' | 'MANAGER' | 'LAWYER'; canApprove: boolean }) {
    const tenantId = `b10-${randomUUID().slice(0, 8)}`;
    tenants.push(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `B10 ${tenantId}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: 'B10 ofis' } });
    const admin = await prisma.user.create({
      data: { tenantId, email: `${tenantId}-admin@test.invalid`, name: 'B10', surname: 'Admin', role: 'ADMIN' },
    });
    const partnerUser = await prisma.user.create({
      data: { tenantId, email: `${tenantId}-partner@test.invalid`, name: 'B10', surname: 'Ortak', role: 'USER' },
    });
    await prisma.lawyer.create({
      data: { tenantId, officeId: office.id, userId: partnerUser.id, name: 'Ortak', surname: 'Avukat', lawyerRank: 'PARTNER' },
    });
    const execUser = await prisma.user.create({
      data: { tenantId, email: `${tenantId}-exec@test.invalid`, name: 'B10', surname: 'Yurutucu', role: executor.role },
    });
    const execLawyer = await prisma.lawyer.create({
      data: {
        tenantId,
        officeId: office.id,
        userId: execUser.id,
        name: 'Yurutucu',
        surname: 'Avukat',
        lawyerRank: executor.lawyerRank,
        canApproveOfficeActions: executor.canApprove,
      },
    });
    return { tenantId, adminId: admin.id, partnerUserId: partnerUser.id, execUserId: execUser.id, execLawyerId: execLawyer.id };
  }

  const execute = (tenantId: string, userId: string) =>
    prisma.$transaction((tx) => officeApproval.assertApproverExecutionAuthorityInTx(tx, userId, tenantId), TX);

  it('yetkili başarı: aktif delege avukat → yürütme yetkisi verilir', async () => {
    const s = await seed({ role: 'USER', lawyerRank: 'LAWYER', canApprove: true });
    await expect(execute(s.tenantId, s.execUserId)).resolves.toBeUndefined();
  });

  it('yetkisiz ret: PARTNER avukata bağlı VIEWER → 403 FINANCIAL_EXECUTION_DENIED_VIEWER', async () => {
    const s = await seed({ role: 'VIEWER', lawyerRank: 'PARTNER', canApprove: false });
    await expect(execute(s.tenantId, s.execUserId)).rejects.toMatchObject({
      response: expect.objectContaining({ code: FINANCIAL_EXECUTION_DENIED_VIEWER }),
    });
  });

  it('yetkisiz ret: delegasyonsuz sıradan avukat → 403', async () => {
    const s = await seed({ role: 'USER', lawyerRank: 'LAWYER', canApprove: false });
    await expect(execute(s.tenantId, s.execUserId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('iptal ÖNCE commit eder (gerçek LawyerService.update) → yürütme reddedilir', async () => {
    const s = await seed({ role: 'USER', lawyerRank: 'LAWYER', canApprove: true });
    await lawyers.update(s.tenantId, s.execLawyerId, { canApproveOfficeActions: false } as never, { userId: s.adminId, role: 'ADMIN' });
    await expect(execute(s.tenantId, s.execUserId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('yürütme kilidi ÖNCE alır → iptal (gerçek LawyerService.update) yürütme bitene kadar BEKLER, sonra uygulanır', async () => {
    const s = await seed({ role: 'USER', lawyerRank: 'LAWYER', canApprove: true });
    const g = gate();
    const events: string[] = [];
    const execution = prisma.$transaction(async (tx) => {
      await officeApproval.assertApproverExecutionAuthorityInTx(tx, s.execUserId, s.tenantId);
      events.push('exec:authorized');
      await g.opened; // mali yazmanın süresini temsil eder
      events.push('exec:commit');
    }, TX);
    await new Promise((r) => setTimeout(r, 200)); // yürütme kilidi alsın
    const revocation = lawyers
      .update(s.tenantId, s.execLawyerId, { canApproveOfficeActions: false } as never, { userId: s.adminId, role: 'ADMIN' })
      .then(() => { events.push('revoke:done'); });

    expect(await isStillPending(revocation)).toBe(true); // iptal kilitte bekliyor
    g.open();
    await execution;
    await revocation;
    expect(events).toEqual(['exec:authorized', 'exec:commit', 'revoke:done']);
    const after = await prisma.lawyer.findUniqueOrThrow({ where: { id: s.execLawyerId } });
    expect(after.canApproveOfficeActions).toBe(false);
    // İptal SONRASI yeni yürütme reddedilir.
    await expect(execute(s.tenantId, s.execUserId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('iptal satırı ÖNCE kilitler → yürütme BEKLER; iptal commit edince taze satırı okur ve REDDEDİLİR', async () => {
    const s = await seed({ role: 'USER', lawyerRank: 'LAWYER', canApprove: true });
    const g = gate();
    // LawyerService.update'in çalıştırdığı AYNI ifade; transaction açık tutulur.
    const revocation = prisma.$transaction(async (tx) => {
      await tx.lawyer.update({ where: { id: s.execLawyerId }, data: { canApproveOfficeActions: false } });
      await g.opened;
    }, TX);
    await new Promise((r) => setTimeout(r, 200)); // iptal satırı kilitlesin
    const execution = execute(s.tenantId, s.execUserId);

    expect(await isStillPending(execution)).toBe(true); // yürütme kilitte bekliyor
    g.open();
    await revocation;
    await expect(execution).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('pasifleştirme (gerçek LawyerService.delete: Lawyer → User) yürütme kilidini bekler; kilitlenme OLUŞMAZ', async () => {
    const s = await seed({ role: 'USER', lawyerRank: 'LAWYER', canApprove: true });
    const g = gate();
    const execution = prisma.$transaction(async (tx) => {
      await officeApproval.assertApproverExecutionAuthorityInTx(tx, s.execUserId, s.tenantId);
      await g.opened;
    }, TX);
    await new Promise((r) => setTimeout(r, 200));
    const deactivation = lawyers.delete(s.tenantId, s.execLawyerId, { userId: s.partnerUserId } as never);

    expect(await isStillPending(deactivation)).toBe(true);
    g.open();
    await expect(execution).resolves.toBeUndefined();
    await expect(deactivation).resolves.toBeDefined();
    const [lw, us] = await Promise.all([
      prisma.lawyer.findUniqueOrThrow({ where: { id: s.execLawyerId } }),
      prisma.user.findUniqueOrThrow({ where: { id: s.execUserId } }),
    ]);
    expect(lw.isActive).toBe(false);
    expect(us.isActive).toBe(false);
    await expect(execute(s.tenantId, s.execUserId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('payout yolu: MANAGER rütbesi (gerçek LawyerService.update, ADMIN) düşürülünce kesinleştirme yetkisi reddedilir', async () => {
    const s = await seed({ role: 'USER', lawyerRank: 'MANAGER', canApprove: false });
    await expect(
      prisma.$transaction((tx) => payoutPolicy.assertExecutionEligibleInTx(tx, s.execUserId, s.tenantId), TX),
    ).resolves.toBe('MANAGER');
    await lawyers.update(s.tenantId, s.execLawyerId, { lawyerRank: 'LAWYER' } as never, { userId: s.adminId, role: 'ADMIN' });
    await expect(
      prisma.$transaction((tx) => payoutPolicy.assertExecutionEligibleInTx(tx, s.execUserId, s.tenantId), TX),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
