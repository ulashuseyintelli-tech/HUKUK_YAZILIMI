// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir.
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

/**
 * K4-2..4 (owner GO 2026-09-28) — yetki VERME / erişim açma yazıları ile yetki iptali arasındaki yarış, gerçek
 * PostgreSQL'de. Dört yol, tx dışındaki kontrolü ucuz erken-fail olarak tutar; YETKİLİ karar yazma transaction'ında,
 * aktörün `Lawyer` → `User` satırları `FOR SHARE` kilitliyken ve güncel satırdan verilir:
 *  - K2 dosya yetkisi dağıtımı (`CaseService.updateCaseLawyer`, F01 kuralı),
 *  - avukat delegasyonu / rütbe (`LawyerService.update`; ADMIN kısa yolu da kilitli güncel satırdan),
 *  - portal hesabı açma (`PortalService.createPortalUser`, `isApproverEligible`),
 *  - dosya ücret sözleşmesi (`CaseFeeAgreementService.create`, `isApproverEligible`).
 * "Sonrasında onay var" gerekçesi kullanılmaz: yetki dağıtımı başlı başına bir yetki değişikliğidir.
 *
 * `iptal satırı önce kilitler` senaryoları, transaction'ı açık tutabilmek için iptal yollarının çalıştırdığı AYNI
 * satır güncellemesini (Lawyer rütbe/delegasyon, User.isActive) elle açılan transaction'da yürütür.
 * GÜVENLİK: yalnız TEST_DATABASE_URL (test/gate adlı disposable DB); her test kendi sentetik tenant'ında.
 */
import { ForbiddenException, INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CaseModule } from '../../case/case.module';
import { CaseService } from '../../case/case.service';
import { CaseFeeAgreementService } from '../../client-settlement/case-fee-agreement.service';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { LawyerService } from '../../lawyer/lawyer.service';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { PortalService } from '../../portal/portal.service';
import { OfficeApprovalService } from '../office-approval.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('K4-2..4 yetki dagitimi yaris DB kapisi: CI onayli TEST_DATABASE_URL ister.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const BLOCK_PROBE_MS = 700;

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

describeWithDisposableDb('K4-2..4 — yetki verme / erişim açma yazıları yetki iptaliyle gerçek PostgreSQL üzerinde serileşir', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let cases: CaseService;
  let lawyers: LawyerService;
  let officeApproval: OfficeApprovalService;
  let audit: AuditService;
  let portal: PortalService;
  let fees: CaseFeeAgreementService;
  const tenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        StorageModule,
        ErrorLogModule,
        MetricsRegistryModule,
        CaseModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    cases = app.get(CaseService);
    lawyers = app.get(LawyerService, { strict: false });
    officeApproval = app.get(OfficeApprovalService, { strict: false });
    audit = app.get(AuditService, { strict: false });
    const db = app.get(PrismaService, { strict: false });
    portal = new PortalService(db, {} as never, audit, officeApproval, {} as never, {} as never);
    fees = new CaseFeeAgreementService(db, officeApproval, audit);
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await app?.close();
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.caseFeeAgreement.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.clientPortalUser.deleteMany({ where: { client: { tenantId } } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  /**
   * Aktörler: admin (ADMIN) · partner (USER+PARTNER, F01 + onay yetkili) · delegate (USER+LAWYER, canApproveOfficeActions)
   * · target (USER+LAWYER, dosyada yetkisiz atama; delegasyon/rütbe hedefi). Dosya + müvekkil + dosya-müvekkil bağı.
   */
  async function seed(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-k42-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI K42 ${label}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: `CI K42 ofis ${label}` } });

    async function actor(key: string, role: 'USER' | 'ADMIN', lawyer?: { lawyerRank: 'LAWYER' | 'PARTNER'; canApprove?: boolean }) {
      const user = await prisma.user.create({
        data: { tenantId, email: `${key}-${suffix}@example.test`, name: key, surname: 'K42', role },
      });
      const lw = lawyer
        ? await prisma.lawyer.create({
            data: {
              tenantId,
              officeId: office.id,
              userId: user.id,
              name: key,
              surname: 'K42',
              lawyerRank: lawyer.lawyerRank,
              canApproveOfficeActions: lawyer.canApprove ?? false,
            },
          })
        : null;
      return { userId: user.id, lawyerId: lw?.id as string };
    }

    const admin = await actor('admin', 'ADMIN');
    const partner = await actor('partner', 'USER', { lawyerRank: 'PARTNER' });
    const delegate = await actor('delegate', 'USER', { lawyerRank: 'LAWYER', canApprove: true });
    const target = await actor('target', 'USER', { lawyerRank: 'LAWYER' });

    const legalCase = await prisma.case.create({
      data: { tenantId, fileNumber: `CI-K42-${label}-${suffix}`, type: 'GENERAL_EXECUTION' },
    });
    const targetCl = await prisma.caseLawyer.create({
      data: { caseId: legalCase.id, lawyerId: target.lawyerId, casePermissions: {} },
    });
    const client = await prisma.client.create({ data: { tenantId, type: 'COMPANY', name: `CI K42 muvekkil ${label}` } as never });
    const caseClient = await prisma.caseClient.create({ data: { caseId: legalCase.id, clientId: client.id } });

    return { tenantId, admin, partner, delegate, target, caseId: legalCase.id, targetClId: targetCl.id, clientId: client.id, caseClientId: caseClient.id };
  }
  type Seed = Awaited<ReturnType<typeof seed>>;

  /** Aktörün satırını iptal yolunun yazdığı biçimde güncelleyen, açık tutulan transaction (satır kilidi önce alınır). */
  function holdRevocation(write: (tx: any) => Promise<unknown>) {
    const g = gate();
    const tx$ = prisma.$transaction(async (tx) => {
      await write(tx);
      await g.opened;
    }, { timeout: 30_000 });
    return { release: g.open, done: tx$ };
  }

  const grantFinance = (s: Seed, actorUserId: string) =>
    cases.updateCaseLawyer(s.tenantId, s.caseId, s.targetClId, { casePermissions: { canEditFinance: true } }, actorUserId);
  const delegate = (s: Seed, actor: { userId: string; role: string }) =>
    lawyers.update(s.tenantId, s.target.lawyerId, { canApproveOfficeActions: true } as never, actor as never);
  const openPortal = (s: Seed, actorUserId: string) =>
    portal.createPortalUser(s.clientId, `portal-${randomUUID().slice(0, 8)}@example.test`, 'K42-parola-1!', s.tenantId, { userId: actorUserId } as never);
  const createFee = (s: Seed, actorUserId: string) =>
    fees.create(s.tenantId, { caseClientId: s.caseClientId, feeType: 'FLAT_AMOUNT', flatAmount: '1500.00' } as never, { userId: actorUserId });

  async function targetFinance(s: Seed) {
    const row = await prisma.caseLawyer.findUniqueOrThrow({ where: { id: s.targetClId } });
    return (row.casePermissions as any)?.canEditFinance === true;
  }
  const targetDelegated = async (s: Seed) =>
    (await prisma.lawyer.findUniqueOrThrow({ where: { id: s.target.lawyerId } })).canApproveOfficeActions;
  const portalUsers = (s: Seed) => prisma.clientPortalUser.count({ where: { clientId: s.clientId } });
  const feeAgreements = (s: Seed) => prisma.caseFeeAgreement.count({ where: { tenantId: s.tenantId } });

  describe('meşru kullanım çalışır', () => {
    it('PARTNER dosyada mali yetki verir; PARTNER delegasyon verir; delege portal hesabı açar ve ücret sözleşmesi yazar', async () => {
      const s = await seed('ok');
      await grantFinance(s, s.partner.userId);
      await delegate(s, { userId: s.partner.userId, role: 'USER' });
      await openPortal(s, s.delegate.userId);
      await createFee(s, s.delegate.userId);

      expect(await targetFinance(s)).toBe(true);
      expect(await targetDelegated(s)).toBe(true);
      expect(await portalUsers(s)).toBe(1);
      expect(await feeAgreements(s)).toBe(1);
    });

    it('ADMIN rütbe değiştirir (kilitli güncel satırdan ADMIN doğrulanır)', async () => {
      const s = await seed('ok-admin');
      await lawyers.update(s.tenantId, s.target.lawyerId, { lawyerRank: 'PARTNER' } as never, { userId: s.admin.userId, role: 'ADMIN' } as never);
      expect((await prisma.lawyer.findUniqueOrThrow({ where: { id: s.target.lawyerId } })).lawyerRank).toBe('PARTNER');
    });
  });

  describe('iptal satırı ÖNCE kilitler → yazı BEKLER, taze satırı okur, REDDEDİLİR; yazı oluşmaz', () => {
    it('K2 dosya yetkisi dağıtımı: PARTNER rütbesi düşürülürken verdiği canEditFinance kalıcı olmaz', async () => {
      const s = await seed('k2');
      const rev = holdRevocation((tx) => tx.lawyer.update({ where: { id: s.partner.lawyerId }, data: { lawyerRank: 'LAWYER' } }));
      await new Promise((r) => setTimeout(r, 200));

      const grant$ = grantFinance(s, s.partner.userId);
      expect(await isStillPending(grant$)).toBe(true);
      rev.release();
      await rev.done;
      await expect(grant$).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CASE_PERMISSION_GRANT_FORBIDDEN' }) });
      expect(await targetFinance(s)).toBe(false);
    });

    it('avukat delegasyonu: rütbesi düşürülen PARTNER eşzamanlı olarak kalıcı onaylayıcı atayamaz', async () => {
      const s = await seed('deleg');
      const rev = holdRevocation((tx) => tx.lawyer.update({ where: { id: s.partner.lawyerId }, data: { lawyerRank: 'LAWYER' } }));
      await new Promise((r) => setTimeout(r, 200));

      const change$ = delegate(s, { userId: s.partner.userId, role: 'USER' });
      expect(await isStillPending(change$)).toBe(true);
      rev.release();
      await rev.done;
      await expect(change$).rejects.toBeInstanceOf(ForbiddenException);
      expect(await targetDelegated(s)).toBe(false);
      expect(await prisma.auditLog.count({ where: { tenantId: s.tenantId, action: 'LAWYER_OFFICE_APPROVAL_DELEGATION_CHANGED' } })).toBe(0);
    });

    it('rütbe değişimi: pasifleştirilen ADMIN (istek anındaki rol beyanı ADMIN) eşzamanlı rütbe yükseltemez', async () => {
      const s = await seed('admin-deact');
      const rev = holdRevocation((tx) => tx.user.update({ where: { id: s.admin.userId }, data: { isActive: false } }));
      await new Promise((r) => setTimeout(r, 200));

      const change$ = lawyers.update(s.tenantId, s.target.lawyerId, { lawyerRank: 'PARTNER' } as never, { userId: s.admin.userId, role: 'ADMIN' } as never);
      expect(await isStillPending(change$)).toBe(true);
      rev.release();
      await rev.done;
      await expect(change$).rejects.toBeInstanceOf(ForbiddenException);
      expect((await prisma.lawyer.findUniqueOrThrow({ where: { id: s.target.lawyerId } })).lawyerRank).toBe('LAWYER');
    });

    it('portal hesabı: delegasyonu kaldırılan avukat eşzamanlı olarak kalıcı dış erişim açamaz', async () => {
      const s = await seed('portal');
      const rev = holdRevocation((tx) => tx.lawyer.update({ where: { id: s.delegate.lawyerId }, data: { canApproveOfficeActions: false } }));
      await new Promise((r) => setTimeout(r, 200));

      const open$ = openPortal(s, s.delegate.userId);
      expect(await isStillPending(open$)).toBe(true);
      rev.release();
      await rev.done;
      await expect(open$).rejects.toBeInstanceOf(ForbiddenException);
      expect(await portalUsers(s)).toBe(0);
      expect((await prisma.client.findUniqueOrThrow({ where: { id: s.clientId } })).hasPortalAccess).toBe(false);
    });

    it('ücret sözleşmesi: delegasyonu kaldırılan avukat eşzamanlı olarak dağıtım tutarını belirleyen sözleşme yazamaz', async () => {
      const s = await seed('fee');
      const rev = holdRevocation((tx) => tx.lawyer.update({ where: { id: s.delegate.lawyerId }, data: { canApproveOfficeActions: false } }));
      await new Promise((r) => setTimeout(r, 200));

      const create$ = createFee(s, s.delegate.userId);
      expect(await isStillPending(create$)).toBe(true);
      rev.release();
      await rev.done;
      await expect(create$).rejects.toBeInstanceOf(ForbiddenException);
      expect(await feeAgreements(s)).toBe(0);
    });
  });

  it('yazı yetkiyi ÖNCE güvenceye alır → iptal (gerçek LawyerService.update) yazı commit edene kadar BEKLER, sonra uygulanır', async () => {
    const s = await seed('write-first');
    const g = gate();
    const events: string[] = [];
    const realLog = audit.logInTransaction.bind(audit);
    jest.spyOn(audit, 'logInTransaction').mockImplementation(async (tx: any, entry: any) => {
      await realLog(tx, entry);
      if (entry?.entityType === 'CASE_FEE_AGREEMENT' || String(entry?.action ?? '').includes('FEE')) {
        events.push('fee:written');
        await g.opened;
      }
    });

    const create$ = createFee(s, s.delegate.userId).then((r) => { events.push('fee:committed'); return r; });
    await new Promise((r) => setTimeout(r, 300));
    const revocation = lawyers
      .update(s.tenantId, s.delegate.lawyerId, { canApproveOfficeActions: false } as never, { userId: s.admin.userId, role: 'ADMIN' } as never)
      .then(() => { events.push('revoke:done'); });

    expect(await isStillPending(revocation)).toBe(true);
    g.open();
    await create$;
    await revocation;
    expect(events).toEqual(['fee:written', 'fee:committed', 'revoke:done']);
    expect(await feeAgreements(s)).toBe(1);
    expect((await prisma.lawyer.findUniqueOrThrow({ where: { id: s.delegate.lawyerId } })).canApproveOfficeActions).toBe(false);
  });
});
