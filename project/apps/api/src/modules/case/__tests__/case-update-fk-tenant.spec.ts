/**
 * CASE-UPDATE-FK-TENANT — tekil update()/patchFlags() FK tenant ownership guard.
 *
 * Açık: clientId/courtId (UpdateCaseDto, PUT /cases/:id update) ve executionOfficeId
 * (patchFlags allowedFlags, PATCH /cases/:id) tenant-scoped FK'lerdi ama guard YOKTU →
 * cross-tenant id `{...dto}`/allowedFlags spread'i ile persist ediliyor, findOne FK-join'i
 * (client/court/executionOffice: true) başka tenant'ın tam kaydını döndürüyordu (sızıntı).
 * Fix: `validateCaseFkOwnership` → cross-tenant/geçersiz → BadRequest; null/undefined → atla.
 *
 * Test deseni (case-assignment-audit/case-create-sorumlu ile aynı): mock prisma + findOne override.
 */

import { BadRequestException } from '@nestjs/common';
import { CaseService } from '../case.service';

function setup() {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);

  const clientFindFirst = jest.fn(async () => ({ id: 'cli-1' }) as any); // default: same-tenant (bulundu)
  const courtFindFirst = jest.fn(async () => ({ id: 'crt-1' }) as any);
  const officeFindFirst = jest.fn(async () => ({ id: 'off-1' }) as any);
  const caseUpdate = jest.fn(async ({ data }: any) => ({ id: 'case-1', fileNumber: 'F-1', ...data }));

  (service as any).findOne = jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-1', fileNumber: 'F-1' }));
  (service as any).auditService = { log: jest.fn(async () => undefined) };
  (service as any).prisma = {
    client: { findFirst: clientFindFirst },
    court: { findFirst: courtFindFirst },
    executionOffice: { findFirst: officeFindFirst },
    case: { update: caseUpdate },
  };

  return { service, clientFindFirst, courtFindFirst, officeFindFirst, caseUpdate };
}

describe('CASE-UPDATE-FK-TENANT update() — clientId/courtId tenant guard', () => {
  it('same-tenant clientId+courtId → persist (FK tenant-scope ile doğrulanır)', async () => {
    const { service, clientFindFirst, courtFindFirst, caseUpdate } = setup();

    await service.update('tenant-1', 'case-1', { clientId: 'cli-1', courtId: 'crt-1', notes: 'x' } as any, 'user-1');

    expect(clientFindFirst).toHaveBeenCalledWith({ where: { id: 'cli-1', tenantId: 'tenant-1' }, select: { id: true } });
    expect(courtFindFirst).toHaveBeenCalledWith({ where: { id: 'crt-1', tenantId: 'tenant-1' }, select: { id: true } });
    expect(caseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'case-1' }, data: expect.objectContaining({ clientId: 'cli-1', courtId: 'crt-1' }) }),
    );
  });

  it('cross-tenant/geçersiz clientId → BadRequest, case.update YOK', async () => {
    const { service, caseUpdate } = setup();
    (service as any).prisma.client.findFirst = jest.fn(async () => null);

    await expect(
      service.update('tenant-1', 'case-1', { clientId: 'foreign' } as any, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(caseUpdate).not.toHaveBeenCalled();
  });

  it('cross-tenant/geçersiz courtId (clientId geçerli) → BadRequest, case.update YOK', async () => {
    const { service, caseUpdate } = setup();
    (service as any).prisma.court.findFirst = jest.fn(async () => null);

    await expect(
      service.update('tenant-1', 'case-1', { clientId: 'cli-1', courtId: 'foreign' } as any, 'user-1'),
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

  it('executionOfficeId yoksa (yalnız caseStatus) → guard çalışmaz, case.update yapılır', async () => {
    const { service, officeFindFirst, caseUpdate } = setup();

    await service.patchFlags('tenant-1', 'case-1', { caseStatus: 'DERDEST' } as any);

    expect(officeFindFirst).not.toHaveBeenCalled();
    expect(caseUpdate).toHaveBeenCalled();
  });
});
