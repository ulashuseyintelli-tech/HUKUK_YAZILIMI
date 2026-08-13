/**
 * OFFICE-P5-SECURITY-COMPLETION-R01 / P5-B04 — maskeli TCKN geri-yazım koruması.
 *
 * ÖLÇÜM (P5-B03 §5, site #8): cases/new StaffDetailModal, GET /staff listesinden gelen
 * satırın TAMAMINI geri PUT eder — liste maskeli tckn taşıdığı için (123****01) maskeli
 * değer update'e girer. Korumasız halde iki hasar: (a) maskeli değer "değişiklik" sayılıp
 * DUPLICATE_IDENTITY/SIMILAR akışını yanlış tetikler, (b) persist edilip GERÇEK TCKN'yi
 * EZER (bilinen tam-form POST veri-kaybı deseni). Sözleşme: '*' içeren tckn NO-CHANGE
 * sayılır — gerçek TCKN 11 hane rakamdır, '*' asla meşru değer değildir.
 */
import { StaffService } from '../staff.service';

const EXISTING = {
  id: 's1',
  tenantId: 't1',
  firstName: 'Aysu',
  lastName: 'Aktay',
  tckn: '12345678901',
  isActive: true,
};

const build = () => {
  const prisma: any = {
    staffMember: {
      findFirst: jest.fn().mockResolvedValue({ ...EXISTING }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...EXISTING, ...data })),
    },
  };
  return { svc: new StaffService(prisma), prisma };
};

describe('P5-B04 — StaffService.update maskeli tckn no-change sözleşmesi', () => {
  it("maskeli tckn ('123****01') persist EDİLMEZ ve duplicate probe TETİKLENMEZ", async () => {
    const { svc, prisma } = build();

    await svc.update('s1', 't1', { tckn: '123****01', phone: '0533' });

    const updateData = prisma.staffMember.update.mock.calls[0][0].data;
    expect('tckn' in updateData).toBe(false); // gerçek TCKN ezilmedi
    expect(updateData.phone).toBe('0533'); // düzenlenen alan yazıldı
    // tcknChanged=false → kimlik-duplicate probe'u (findMany) hiç çağrılmadı
    expect(prisma.staffMember.findMany).not.toHaveBeenCalled();
  });

  it('gerçek (rakam) TCKN değişikliği AYNEN çalışmaya devam eder (duplicate probe dahil)', async () => {
    const { svc, prisma } = build();

    await svc.update('s1', 't1', { tckn: '99999999999' });

    // değişiklik gerçek → probe koşar (boş sonuç → guard geçer) ve değer yazılır
    expect(prisma.staffMember.findMany).toHaveBeenCalledTimes(1);
    const updateData = prisma.staffMember.update.mock.calls[0][0].data;
    expect(updateData.tckn).toBe('99999999999');
  });

  it('tckn göndermeyen update etkilenmez (undefined → alan yazılmaz)', async () => {
    const { svc, prisma } = build();

    await svc.update('s1', 't1', { firstName: 'Aysu' });

    const updateData = prisma.staffMember.update.mock.calls[0][0].data;
    expect('tckn' in updateData).toBe(false);
  });
});
