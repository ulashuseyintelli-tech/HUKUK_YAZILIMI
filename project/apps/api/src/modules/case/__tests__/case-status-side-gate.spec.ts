/**
 * P3-2B-3 — generic /cases/:id STATÜ YAN-KAPILARI kapatma.
 *
 * Statü değişimi YALNIZCA kanonik POST /case-status/:caseId/change'ten yapılır (history/decisionLog/observe orada).
 * - PUT update(): FARKLI caseStatus → 400; AYNI caseStatus → no-op (write'tan çıkar, hata yok); diğer alanlar çalışır.
 * - PATCH patchFlags(): caseStatus → 400 (allowedFlags'ten çıkarıldı); diğer flag'ler çalışır.
 *
 * Test deseni: case-update-fk-tenant.spec ile aynı (mock prisma + findOne override; findOne caseStatus döndürür).
 */
import { BadRequestException } from '@nestjs/common';
import { CaseService } from '../case.service';

function setup(currentStatus = 'DERDEST') {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);

  const caseUpdate = jest.fn(async ({ data }: any) => ({ id: 'case-1', fileNumber: 'F-1', ...data }));
  (service as any).findOne = jest.fn(async () => ({
    id: 'case-1',
    tenantId: 'tenant-1',
    fileNumber: 'F-1',
    caseStatus: currentStatus,
  }));
  (service as any).auditService = { log: jest.fn(async () => undefined) };
  (service as any).prisma = {
    client: { findFirst: jest.fn(async () => ({ id: 'cli-1' })) },
    court: { findFirst: jest.fn(async () => ({ id: 'crt-1' })) },
    executionOffice: { findFirst: jest.fn(async () => ({ id: 'off-1' })) },
    case: { update: caseUpdate },
  };
  return { service, caseUpdate };
}

describe('P3-2B-3 — PUT update() statü yan-kapısı', () => {
  it('FARKLI caseStatus → 400 BadRequest, case.update YOK', async () => {
    const { service, caseUpdate } = setup('DERDEST');
    await expect(
      service.update('tenant-1', 'case-1', { caseStatus: 'HITAM' } as any, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(caseUpdate).not.toHaveBeenCalled();
  });

  it('AYNI caseStatus → no-op: case.update çağrılır AMA data.caseStatus YAZILMAZ; diğer alan güncellenir', async () => {
    const { service, caseUpdate } = setup('DERDEST');
    await service.update('tenant-1', 'case-1', { caseStatus: 'DERDEST', notes: 'x' } as any, 'user-1');
    expect(caseUpdate).toHaveBeenCalledTimes(1);
    const data = caseUpdate.mock.calls[0][0].data;
    expect(data.caseStatus).toBeUndefined(); // statü generic update ile yazılmaz
    expect(data.notes).toBe('x');
  });

  it('caseStatus YOK → diğer alanlar normal güncellenir (yan-kapı tetiklenmez)', async () => {
    const { service, caseUpdate } = setup('DERDEST');
    await service.update('tenant-1', 'case-1', { notes: 'sadece not' } as any, 'user-1');
    expect(caseUpdate).toHaveBeenCalledTimes(1);
    expect(caseUpdate.mock.calls[0][0].data.notes).toBe('sadece not');
  });
});

describe('P3-2B-3 — PATCH patchFlags() statü yan-kapısı', () => {
  it('caseStatus → 400 BadRequest, case.update YOK', async () => {
    const { service, caseUpdate } = setup('DERDEST');
    await expect(
      service.patchFlags('tenant-1', 'case-1', { caseStatus: 'HITAM' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(caseUpdate).not.toHaveBeenCalled();
  });

  it('diğer flag (isArchived) → caseStatus reddi tetiklenmez, update çalışır; caseStatus yazılmaz', async () => {
    const { service, caseUpdate } = setup('DERDEST');
    await service.patchFlags('tenant-1', 'case-1', { isArchived: true } as any);
    expect(caseUpdate).toHaveBeenCalledTimes(1);
    const data = caseUpdate.mock.calls[0][0].data;
    expect(data.isArchived).toBe(true);
    expect(data.caseStatus).toBeUndefined();
  });
});
