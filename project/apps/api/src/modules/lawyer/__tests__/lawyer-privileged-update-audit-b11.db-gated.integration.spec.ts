/**
 * B11 — AYRICALIKLI AVUKAT GÜNCELLEMESİ + AUDIT: GERÇEK COMMIT / ROLLBACK KANITI (disposable PostgreSQL).
 *
 * Birim spec'i (`lawyer-privileged-update-audit-b11.spec.ts`) hangi client ile yazıldığını kanıtlar; bir
 * yazmanın gerçekten GERİ ALINDIĞINI ancak veritabanı söyler. Owner politikası (2026-09-12): "Güncelleme ile
 * audit aynı transaction'da olacak; audit yazılamazsa güncelleme geri alınacak."
 *
 * HATA ENJEKSİYONU: sarmalayıcı `logInTransaction`, audit satırını GERÇEKTEN transaction içine yazar ve SONRA
 * fırlatır. Bu, en güçlü kanıttır: yalnız avukat satırının değil, zaten yazılmış audit satırının da geri
 * alındığını — yani ikisinin gerçekten AYNI transaction'da olduğunu — ölçer.
 *
 * GÜVENLİK: yalnız `TEST_DATABASE_URL` ile koşar (`test-db-env` fail-closed; dev `hukuk_db` YASAK). Her test kendi
 * sentetik tenant'ında çalışır ve temizlenir; gerçek veriye dokunulmaz.
 */

import { randomUUID } from 'node:crypto';

import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { LawyerService } from '../lawyer.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
const describeWithDatabase = TEST_DB_URL ? describe : describe.skip;

describeWithDatabase('B11 — ayrıcalıklı güncelleme ve audit birlikte commit / rollback (gerçek DB)', () => {
  let prisma: PrismaService;
  let tenantId: string;
  let lawyerId: string;
  let adminId: string;

  const officeApproval = { isF01ActorAuthorized: jest.fn(async () => true) } as any;
  const admin = () => ({ userId: adminId, role: 'ADMIN' });

  /** Audit satırını tx içine YAZIP sonra fırlatan sarmalayıcı. */
  function failingAudit() {
    const real = new AuditService(prisma);
    return {
      log: (input: any) => real.log(input),
      logInTransaction: async (tx: any, input: any) => {
        await real.logInTransaction(tx, input);
        throw new Error('AUDIT_YAZILAMADI');
      },
    } as any;
  }

  const audits = (action?: string) =>
    prisma.auditLog.findMany({ where: { tenantId, ...(action ? { action } : {}) }, orderBy: { createdAt: 'asc' } });
  const lawyerRow = () => prisma.lawyer.findUniqueOrThrow({ where: { id: lawyerId } });

  beforeAll(async () => {
    prisma = new PrismaService({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    tenantId = `b11-${randomUUID().slice(0, 8)}`;
    await prisma.tenant.create({ data: { id: tenantId, name: `B11 ${tenantId}`, slug: tenantId } });
    const user = await prisma.user.create({
      data: { tenantId, email: `${tenantId}@test.invalid`, name: 'Test', surname: 'Admin', role: 'ADMIN' },
    });
    adminId = user.id;
    const office = await prisma.office.create({ data: { tenantId, name: 'B11 Büro' } });
    const lawyer = await prisma.lawyer.create({
      data: {
        tenantId, officeId: office.id, name: 'Ada', surname: 'Lovelace',
        lawyerRank: 'LAWYER', permissionsLocked: false, canModifyOtherPermissions: false,
        canApproveOfficeActions: false, defaultPermissions: { canEditCase: true },
      },
    });
    lawyerId = lawyer.id;
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.lawyer.deleteMany({ where: { tenantId } });
    await prisma.office.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  it('COMMIT: ADMIN lawyerRank değiştirir → satır güncellenir + TEK LAWYER_PRIVILEGE_CHANGED yalnız alan adıyla', async () => {
    const svc = new LawyerService(prisma, new AuditService(prisma), officeApproval);

    await svc.update(tenantId, lawyerId, { lawyerRank: 'PARTNER' } as never, admin());

    expect((await lawyerRow()).lawyerRank).toBe('PARTNER');
    const kayitlar = await audits('LAWYER_PRIVILEGE_CHANGED');
    expect(kayitlar).toHaveLength(1);
    expect(kayitlar[0]).toMatchObject({ tenantId, entityType: 'LAWYER', entityId: lawyerId, userId: adminId });
    expect(kayitlar[0].metadata).toEqual({ changedFields: ['lawyerRank'] });
    expect(kayitlar[0].oldValues).toBeNull();
    expect(kayitlar[0].newValues).toBeNull();
  });

  it('ROLLBACK: audit yazılamazsa ayrıcalıklı güncelleme GERİ ALINIR ve tx içine yazılmış audit satırı da KALMAZ', async () => {
    const svc = new LawyerService(prisma, failingAudit(), officeApproval);

    await expect(
      svc.update(tenantId, lawyerId, { lawyerRank: 'PARTNER', permissionsLocked: true } as never, admin()),
    ).rejects.toThrow('AUDIT_YAZILAMADI');

    const satir = await lawyerRow();
    expect(satir.lawyerRank).toBe('LAWYER');
    expect(satir.permissionsLocked).toBe(false);
    expect(await audits()).toHaveLength(0);
  });

  it('ROLLBACK (delegation): audit yazılamazsa canApproveOfficeActions değişikliği GERİ ALINIR', async () => {
    const svc = new LawyerService(prisma, failingAudit(), officeApproval);

    await expect(
      svc.update(tenantId, lawyerId, { canApproveOfficeActions: true } as never, admin()),
    ).rejects.toThrow('AUDIT_YAZILAMADI');

    expect((await lawyerRow()).canApproveOfficeActions).toBe(false);
    expect(await audits('LAWYER_OFFICE_APPROVAL_DELEGATION_CHANGED')).toHaveLength(0);
  });

  it('TEKİLLİK: delegation + lawyerRank birlikte → 1 DELEGATION_CHANGED + 1 PRIVILEGE_CHANGED; alan tekrarı yok', async () => {
    const svc = new LawyerService(prisma, new AuditService(prisma), officeApproval);

    await svc.update(tenantId, lawyerId, { canApproveOfficeActions: true, lawyerRank: 'MANAGER' } as never, admin());

    const delegation = await audits('LAWYER_OFFICE_APPROVAL_DELEGATION_CHANGED');
    const privilege = await audits('LAWYER_PRIVILEGE_CHANGED');
    expect(delegation).toHaveLength(1);
    expect(privilege).toHaveLength(1);
    expect((privilege[0].metadata as any).changedFields).toEqual(['lawyerRank']);
    expect((privilege[0].metadata as any).changedFields).not.toContain('canApproveOfficeActions');
    const satir = await lawyerRow();
    expect(satir.canApproveOfficeActions).toBe(true);
    expect(satir.lawyerRank).toBe('MANAGER');
  });

  it('NO-OP: aynı değerler (defaultPermissions anahtar sırası farklı) → değişiklik audit\'i YOK', async () => {
    const svc = new LawyerService(prisma, new AuditService(prisma), officeApproval);

    await svc.update(
      tenantId,
      lawyerId,
      { lawyerRank: 'LAWYER', permissionsLocked: false, defaultPermissions: { canEditCase: true } } as never,
      admin(),
    );

    expect(await audits()).toHaveLength(0);
  });
});
