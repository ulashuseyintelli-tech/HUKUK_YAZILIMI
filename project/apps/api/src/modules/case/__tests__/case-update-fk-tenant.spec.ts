/**
 * CASE-UPDATE-FK-TENANT — tekil update()/patchFlags() FK tenant ownership guard.
 *
 * Açık: clientId/courtId (UpdateCaseDto, PUT /cases/:id update) ve executionOfficeId
 * (patchFlags allowedFlags, PATCH /cases/:id) tenant-scoped FK'lerdi ama guard YOKTU →
 * cross-tenant id `{...dto}`/allowedFlags spread'i ile persist ediliyor, findOne FK-join'i
 * (client/court/executionOffice: true) başka tenant'ın tam kaydını döndürüyordu (sızıntı).
 * Fix: `validateCaseFkOwnership` → cross-tenant/geçersiz → BadRequest; null/undefined → atla.
 *
 * CBND-1 (H1) notu: clientId artık bu FK-ownership mekanizmasından TAMAMEN çıkarıldı — aşağıdaki
 * "CBND-1" describe bloğundaki ayrı yan-kapı guard'ı (existing.clientId'den FARKLI değer → 409,
 * her durumda data'dan silinir) devrede; validateCaseFkOwnership artık yalnız courtId'yi doğrular.
 *
 * Test deseni (case-assignment-audit/case-create-sorumlu ile aynı): mock prisma + findOne override.
 */

import { BadRequestException, ConflictException } from '@nestjs/common';
import { CaseService } from '../case.service';

function setup(existingOverrides: Record<string, any> = {}) {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);

  const clientFindFirst = jest.fn(async () => ({ id: 'cli-1' }) as any); // default: same-tenant (bulundu)
  const courtFindFirst = jest.fn(async () => ({ id: 'crt-1' }) as any);
  const officeFindFirst = jest.fn(async () => ({ id: 'off-1' }) as any);
  const caseUpdate = jest.fn(async ({ data }: any) => ({ id: 'case-1', fileNumber: 'F-1', ...data }));

  (service as any).findOne = jest.fn(async () => ({
    id: 'case-1',
    tenantId: 'tenant-1',
    fileNumber: 'F-1',
    ...existingOverrides,
  }));
  (service as any).auditService = { log: jest.fn(async () => undefined) };
  (service as any).prisma = {
    client: { findFirst: clientFindFirst },
    court: { findFirst: courtFindFirst },
    executionOffice: { findFirst: officeFindFirst },
    case: { update: caseUpdate },
  };

  return { service, clientFindFirst, courtFindFirst, officeFindFirst, caseUpdate };
}

describe('CASE-UPDATE-FK-TENANT update() — courtId tenant guard', () => {
  it('same-tenant courtId → persist (FK tenant-scope ile doğrulanır)', async () => {
    const { service, courtFindFirst, caseUpdate } = setup();

    await service.update('tenant-1', 'case-1', { courtId: 'crt-1', notes: 'x' } as any, 'user-1');

    expect(courtFindFirst).toHaveBeenCalledWith({ where: { id: 'crt-1', tenantId: 'tenant-1' }, select: { id: true } });
    expect(caseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'case-1' }, data: expect.objectContaining({ courtId: 'crt-1' }) }),
    );
  });

  it('cross-tenant/geçersiz courtId → BadRequest, case.update YOK', async () => {
    const { service, caseUpdate } = setup();
    (service as any).prisma.court.findFirst = jest.fn(async () => null);

    await expect(
      service.update('tenant-1', 'case-1', { courtId: 'foreign' } as any, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(caseUpdate).not.toHaveBeenCalled();
  });

  it('FK yoksa (yalnız notes) → guard çalışmaz, case.update yapılır', async () => {
    const { service, clientFindFirst, courtFindFirst, caseUpdate } = setup();

    await service.update('tenant-1', 'case-1', { notes: 'sadece not' } as any, 'user-1');

    expect(clientFindFirst).not.toHaveBeenCalled();
    expect(courtFindFirst).not.toHaveBeenCalled();
    expect(caseUpdate).toHaveBeenCalled();
  });
});

describe('CBND-1 (H1) update() — Case.clientId generic-update yan-kapısı kapalı', () => {
  it('clientId gönderilmemişse → guard devreye girmez, update olağan gider, data clientId taşımaz', async () => {
    const { service, clientFindFirst, caseUpdate } = setup({ clientId: 'cli-existing' });

    await service.update('tenant-1', 'case-1', { notes: 'sadece not' } as any, 'user-1');

    expect(clientFindFirst).not.toHaveBeenCalled(); // clientId artık validateCaseFkOwnership'e hiç geçmiyor
    const call = caseUpdate.mock.calls[0][0];
    expect(call.data).not.toHaveProperty('clientId');
  });

  it('clientId mevcut değerle AYNI ise → no-op (409 yok), persist edilir ama data clientId taşımaz', async () => {
    const { service, clientFindFirst, caseUpdate } = setup({ clientId: 'cli-existing' });

    const result = await service.update(
      'tenant-1',
      'case-1',
      { clientId: 'cli-existing', notes: 'aynı müvekkil' } as any,
      'user-1',
    );

    expect(result).toBeDefined();
    expect(clientFindFirst).not.toHaveBeenCalled(); // clientId eşleşmesi FK-ownership tetiklemez
    const call = caseUpdate.mock.calls[0][0];
    expect(call.data).not.toHaveProperty('clientId'); // asla generic update ile persist edilmez
    expect(call.data).toEqual(expect.objectContaining({ notes: 'aynı müvekkil' }));
  });

  it('clientId FARKLI bir değere değiştirilmeye çalışılırsa → 409 Conflict, case.update HİÇ çağrılmaz', async () => {
    const { service, caseUpdate } = setup({ clientId: 'cli-existing' });

    await expect(
      service.update('tenant-1', 'case-1', { clientId: 'cli-other' } as any, 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(caseUpdate).not.toHaveBeenCalled();
  });

  it('existing.clientId yoksa (legacy/null) ve dto clientId gönderirse → yine 409 (backfill generic update ile yapılmaz)', async () => {
    const { service, caseUpdate } = setup({ clientId: null });

    await expect(
      service.update('tenant-1', 'case-1', { clientId: 'cli-new' } as any, 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(caseUpdate).not.toHaveBeenCalled();
  });

  it('çoklu-alacaklı dosyada (CaseClient set > 1) clientId değiştirme denemesi de 409 — set korunur', async () => {
    const { service, caseUpdate } = setup({
      clientId: 'cli-primary',
      caseClients: [{ id: 'cc-1', clientId: 'cli-primary', role: 'ALACAKLI' }, { id: 'cc-2', clientId: 'cli-secondary', role: 'ORTAK_ALACAKLI' }],
    });

    await expect(
      service.update('tenant-1', 'case-1', { clientId: 'cli-secondary' } as any, 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(caseUpdate).not.toHaveBeenCalled();
  });
});

describe('CASE-UPDATE-FK-TENANT patchFlags() — executionOfficeId tenant guard', () => {
  it('same-tenant executionOfficeId → persist', async () => {
    const { service, officeFindFirst, caseUpdate } = setup();

    await service.patchFlags('tenant-1', 'case-1', { executionOfficeId: 'off-1' } as any);

    expect(officeFindFirst).toHaveBeenCalledWith({ where: { id: 'off-1', tenantId: 'tenant-1' }, select: { id: true } });
    expect(caseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ executionOfficeId: 'off-1' }) }),
    );
  });

  it('cross-tenant/geçersiz executionOfficeId → BadRequest, case.update YOK', async () => {
    const { service, caseUpdate } = setup();
    (service as any).prisma.executionOffice.findFirst = jest.fn(async () => null);

    await expect(
      service.patchFlags('tenant-1', 'case-1', { executionOfficeId: 'foreign' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(caseUpdate).not.toHaveBeenCalled();
  });

  it('executionOfficeId yoksa (yalnız notes) → guard çalışmaz, case.update yapılır', async () => {
    const { service, officeFindFirst, caseUpdate } = setup();

    await service.patchFlags('tenant-1', 'case-1', { notes: 'sadece not' } as any);

    expect(officeFindFirst).not.toHaveBeenCalled();
    expect(caseUpdate).toHaveBeenCalled();
  });
});
