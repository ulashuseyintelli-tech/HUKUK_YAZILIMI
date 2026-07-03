/**
 * CS2 — patchFlags() actor + audit (arşivleme artık İZLİ).
 *
 * Önceki durum: PATCH /cases/:id (patchFlags) ne userId alıyordu ne audit yazıyordu — isArchived
 * (dosyayı otomasyondan düşüren tek etki) anonim/izsizdi; silme ADMIN-gate'liyken arşivleme izsizdi.
 * CS2: actor threading (@CurrentUser) + CASE_FLAGS_UPDATE audit (yalnız gerçekten yazılan alanlar).
 * Semantik DEĞİŞMEDİ: allowedFlags aynı, caseStatus yan-kapısı aynı şekilde 400.
 */
import { CaseService } from '../case.service';

function setup(existing: Record<string, any> = {}) {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);

  const caseUpdate = jest.fn(async ({ data }: any) => ({ id: 'case-1', ...data }));
  // jest.Mock tipi: calls[0][0] erişimi boş-tuple çıkarsamasına takılmasın (TS2493).
  const auditLog: jest.Mock = jest.fn(async () => undefined);

  (service as any).findOne = jest.fn(async () => ({
    id: 'case-1', tenantId: 'tenant-1', fileNumber: 'F-1',
    isArchived: false, showToClient: true, notes: null,
    ...existing,
  }));
  (service as any).validateCaseFkOwnership = jest.fn(async () => undefined);
  (service as any).auditService = { log: auditLog, logInTransaction: jest.fn(async () => undefined) };
  (service as any).prisma = { case: { update: caseUpdate } };

  return { service, caseUpdate, auditLog };
}

describe('CS2 CaseService.patchFlags() — actor + audit', () => {
  it('isArchived=true → CASE_FLAGS_UPDATE audit actor + oldValues/newValues ile yazılır', async () => {
    const { service, caseUpdate, auditLog } = setup({ isArchived: false });

    await service.patchFlags('tenant-1', 'case-1', { isArchived: true } as any, { userId: 'u-1' });

    expect(caseUpdate).toHaveBeenCalledWith({ where: { id: 'case-1' }, data: { isArchived: true } });
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        action: 'CASE_FLAGS_UPDATE',
        entityType: 'CASE',
        entityId: 'case-1',
        userId: 'u-1',
        oldValues: { isArchived: false },
        newValues: { isArchived: true },
      }),
    );
  });

  it('arşivden geri alma (isArchived=false) da aynı şekilde audit yazılır', async () => {
    const { service, auditLog } = setup({ isArchived: true });

    await service.patchFlags('tenant-1', 'case-1', { isArchived: false } as any, { userId: 'u-2' });

    const input = auditLog.mock.calls[0][0] as any;
    expect(input.oldValues).toEqual({ isArchived: true });
    expect(input.newValues).toEqual({ isArchived: false });
    expect(input.userId).toBe('u-2');
  });

  it('audit yalnız GERÇEKTEN yazılan (allowedFlags-filtreli) alanları içerir; ham dto sızmaz', async () => {
    const { service, auditLog } = setup();

    await service.patchFlags(
      'tenant-1',
      'case-1',
      { notes: 'yeni not', hackAttempt: 'x', principalAmount: 999 } as any,
      { userId: 'u-1' },
    );

    const input = auditLog.mock.calls[0][0] as any;
    expect(Object.keys(input.newValues)).toEqual(['notes']);
    expect(input.newValues.hackAttempt).toBeUndefined();
    expect(input.oldValues).toEqual({ notes: null });
  });

  it('izinli alan yoksa erken dönüş — update de audit de ÇAĞRILMAZ (mevcut davranış korunur)', async () => {
    const { service, caseUpdate, auditLog } = setup();

    await service.patchFlags('tenant-1', 'case-1', { unknownField: 1 } as any, { userId: 'u-1' });

    expect(caseUpdate).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('actor verilmezse (geriye-uyumlu iç çağrı) audit yine yazılır, userId undefined', async () => {
    const { service, auditLog } = setup();

    await service.patchFlags('tenant-1', 'case-1', { isArchived: true } as any);

    expect((auditLog.mock.calls[0][0] as any).userId).toBeUndefined();
  });
});
