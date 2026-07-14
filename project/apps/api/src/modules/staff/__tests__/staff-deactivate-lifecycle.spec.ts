/**
 * CANDIDATE-A (OFF/OD-14, WAVE 1 — Session/Lifecycle Safety, RATIFIED Contract) —
 * StaffService.remove() artık $transaction içinde çalışır ve bağlı UserAccount'ı (varsa)
 * AYNI transaction'da deaktive eder. Fail-closed + atomic: userId dolu VE
 * user.updateMany({id,tenantId}) count!==1 ise ConflictException fırlar ve TÜM transaction
 * (StaffMember write dahil) rollback edilir — best-effort/sessiz-no-op YASAK (owner
 * ratifikasyonu, LawyerService.delete() ile BİREBİR desen). userId null ise mevcut
 * profile-only davranış (yalnız StaffMember.isActive=false) korunur.
 *
 * BOUNDARY (RATIFIED Contract): audit log eksikliği bu testte/serviste DÜZELTİLMEZ — ayrı,
 * FUTURE WAVE bulgusu (OFFICE-DELIVERY-MANIFEST.md §2b).
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { StaffService } from '../staff.service';

const TENANT = 't1';
const STAFF_ID = 'S1';

const EXISTING = {
  id: STAFF_ID,
  tenantId: TENANT,
  firstName: 'Grace',
  lastName: 'Hopper',
  staffType: 'PARALEGAL',
  isActive: true,
};

const build = (
  opts: {
    existing?: Record<string, unknown> | null;
    userUpdateCount?: number;
  } = {},
) => {
  const existing = opts.existing === undefined ? EXISTING : opts.existing;

  const prisma: any = {
    staffMember: {
      findFirst: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, ...data })),
    },
    user: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.userUpdateCount ?? 1 }),
    },
    $transaction: jest.fn().mockImplementation((fn: any) => fn(prisma)),
  };
  return { svc: new StaffService(prisma), prisma };
};

describe('CANDIDATE-A — StaffService.remove() deactivate lifecycle', () => {
  it('kayıt bulunamaz (yok/başka tenant) → NotFoundException, transaction hiç açılmaz', async () => {
    const { svc, prisma } = build({ existing: null });
    await expect(svc.remove(STAFF_ID, TENANT)).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('userId NULL ise user.updateMany HİÇ ÇAĞRILMAZ (mevcut profile-only davranış korunur)', async () => {
    const { svc, prisma } = build(); // EXISTING'de userId yok
    const result = await svc.remove(STAFF_ID, TENANT);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.staffMember.update).toHaveBeenCalledWith({
      where: { id: STAFF_ID },
      data: { isActive: false },
    });
    expect(result.isActive).toBe(false);
  });

  it('bağlı userId VARSA → user.updateMany({id,tenantId}, isActive:false) doğru where ile çağrılır, AYNI transaction içinde', async () => {
    const { svc, prisma } = build({ existing: { ...EXISTING, userId: 'u-linked' } });
    const result = await svc.remove(STAFF_ID, TENANT);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u-linked', tenantId: TENANT },
      data: { isActive: false },
    });
    expect(prisma.staffMember.update).toHaveBeenCalledWith({
      where: { id: STAFF_ID },
      data: { isActive: false },
    });
    expect(result.isActive).toBe(false);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('bağlı User ZATEN inactive olsa bile updateMany count=1 döner → idempotent, hata FIRLATILMAZ', async () => {
    const { svc } = build({ existing: { ...EXISTING, userId: 'u-linked' }, userUpdateCount: 1 });
    await expect(svc.remove(STAFF_ID, TENANT)).resolves.toMatchObject({ isActive: false });
  });

  it(
    'user.updateMany count!==1 (tenant uyuşmazlığı/bütünlük sorunu) → ConflictException; ' +
      'StaffMember AKTİF profil YAYINLAMAZ (rollback — gerçek atomicity Prisma $transaction\'ın ' +
      'kendi garantisi, aynı tx callback\'i içinde doğrulandı; bu unit test yalnız fail-closed ' +
      'throw\'u doğrular)',
    async () => {
      const { svc, prisma } = build({ existing: { ...EXISTING, userId: 'u-linked' }, userUpdateCount: 0 });
      await expect(svc.remove(STAFF_ID, TENANT)).rejects.toThrow(ConflictException);
      // StaffMember write hiç YAPILMADI (User check, StaffMember write'tan ÖNCE çalışır) —
      // fail-closed tasarımın erken-çıkış özelliği.
      expect(prisma.staffMember.update).not.toHaveBeenCalled();
    },
  );

  it('REGRESYON: zaten pasif bir StaffMember tekrar deactivate edilirse idempotent no-op görünümlü davranır', async () => {
    const { svc, prisma } = build({ existing: { ...EXISTING, isActive: false } });
    const result = await svc.remove(STAFF_ID, TENANT);
    expect(prisma.staffMember.update).toHaveBeenCalledTimes(1);
    expect(result.isActive).toBe(false);
  });
});
