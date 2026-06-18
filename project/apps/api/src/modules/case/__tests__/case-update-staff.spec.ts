/**
 * PR-ASSIGN-3a — CaseService.updateCaseStaff davranış testi (kırık PATCH kontratı fix'i).
 *
 * Karar (Ulaş): PATCH /cases/:id/staff/:caseStaffId backend ucu eksikti (404). Yalnız CaseStaff
 * modeli alanları güncellenir (service-whitelist); canSign/permissions (lawyer-kopyası) SESSİZCE
 * yok sayılır. Tenant guard (case+caseStaff). Audit: UPDATE / CASE_STAFF. add/remove audit AYRI iş.
 *
 * updateCaseStaff `this.prisma`/`this.auditService` kullanır → constructor stub'lanır, ikisi override edilir.
 */

import { NotFoundException } from '@nestjs/common';
import { CaseService } from '../case.service';

describe('CaseService.updateCaseStaff (PR-ASSIGN-3a)', () => {
  const stub = {} as any;
  // RFA-016: constructor 10 dep — hepsi stub; prisma + auditService test içinde override edilir.
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);

  function setup(opts: { caseFound?: any; caseStaffFound?: any } = {}) {
    const update = jest.fn(async ({ data }: any) => ({
      id: 'cs-1',
      ...data,
      staffMember: { id: 'sm-1', firstName: 'Ali', lastName: 'Veli', staffType: 'MUHASEBE' },
    }));
    const auditLog = jest.fn(async () => undefined);
    const mockPrisma = {
      case: {
        findFirst: jest.fn(async () =>
          'caseFound' in opts ? opts.caseFound : { id: 'case-1', tenantId: 'tenant-1' },
        ),
      },
      caseStaff: {
        findFirst: jest.fn(async () =>
          'caseStaffFound' in opts ? opts.caseStaffFound : { id: 'cs-1', caseId: 'case-1' },
        ),
        update,
      },
    };
    (service as any).prisma = mockPrisma;
    (service as any).auditService = { log: auditLog };
    return { mockPrisma, update, auditLog };
  }

  const call = (data: any) => (service as any).updateCaseStaff('tenant-1', 'case-1', 'cs-1', data);

  it('(a) roleOnCase + receiveNotifications güncellenir', async () => {
    const { update } = setup();

    await call({ roleOnCase: 'MUHASEBE', receiveNotifications: false });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cs-1' },
        data: expect.objectContaining({ roleOnCase: 'MUHASEBE', receiveNotifications: false }),
      }),
    );
  });

  it('(b) canEdit/canApprove/canView güncellenir', async () => {
    const { update } = setup();

    await call({ canEdit: true, canApprove: false, canView: true });

    expect(update.mock.calls[0][0].data).toEqual({ canEdit: true, canApprove: false, canView: true });
  });

  it("(c) case başka tenant'ta → 404 (NotFound), update yok", async () => {
    const { update } = setup({ caseFound: null });

    await expect(call({ roleOnCase: 'X' })).rejects.toThrow(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('(c) caseStaffId yanlış dosyada/yok → 404 (NotFound), update yok', async () => {
    const { update } = setup({ caseStaffFound: null });

    await expect(call({ roleOnCase: 'X' })).rejects.toThrow(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('(d) bilinmeyen alanlar (canSign/permissions) update edilmez (service-whitelist)', async () => {
    const { update } = setup();

    await call({ roleOnCase: 'X', canSign: true, permissions: { canEditCase: true } });

    const dataArg = update.mock.calls[0][0].data;
    expect(dataArg).toEqual({ roleOnCase: 'X' });
    expect(dataArg).not.toHaveProperty('canSign');
    expect(dataArg).not.toHaveProperty('permissions');
  });

  it('(e) audit üretilir (UPDATE / CASE_STAFF / entityId=caseStaffId)', async () => {
    const { auditLog } = setup();

    await call({ roleOnCase: 'X' });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        action: 'UPDATE',
        entityType: 'CASE_STAFF',
        entityId: 'cs-1',
        newValues: { roleOnCase: 'X' },
      }),
    );
  });
});
