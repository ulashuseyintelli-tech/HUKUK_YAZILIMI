/**
 * PR-ASSIGN-2a — CaseService.assignCaseStaff + auditStaffAssignment davranış testi.
 *
 * Karar (Ulaş onayı): dto.staff verilmişse SEÇİM KANONİK OTORİTEDİR (isDefaultForNewCases ile
 * MERGE YOK); dto.staff verilmezse mevcut default davranışı AYNEN korunur. staffMemberId dedupe;
 * tenant ownership (cross-tenant/nonexistent → BadRequestException); audit: "dosyaya personel ekleme".
 *
 * Helper saf olarak tx üzerinde çalışır → izole test (case-create-instruments.spec deseni).
 */

import { BadRequestException } from '@nestjs/common';
import { CaseService } from '../case.service';
import { CaseStaffInputDto } from '../dto/case.dto';

describe('CaseService.assignCaseStaff (PR-ASSIGN-2a)', () => {
  const stub = {} as any;
  // RFA-016: constructor 10 dep (prisma + 9 servis) — helper yalnız tx kullanır, hepsi stub.
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);

  function mockTx(opts: { owned?: any[]; defaults?: any[] } = {}) {
    const created: any[] = [];
    const tx = {
      staffMember: {
        findMany: jest.fn(async ({ where }: any) => {
          if (where?.id?.in) return opts.owned ?? []; // ownership sorgusu
          if (where?.isDefaultForNewCases) return opts.defaults ?? []; // default sorgusu
          return [];
        }),
      },
      caseStaff: {
        create: jest.fn(async ({ data }: any) => {
          created.push(data);
          return { id: `cs-${created.length}`, ...data };
        }),
      },
    } as any;
    return { tx, created };
  }

  const call = (tx: any, dtoStaff?: CaseStaffInputDto[]) =>
    (service as any).assignCaseStaff(tx, 'tenant-1', 'case-1', dtoStaff);

  it('(a) dto.staff verilince SADECE seçim yazılır; default OTOMATİK eklenmez', async () => {
    const { tx, created } = mockTx({ owned: [{ id: 's1', staffType: 'AVUKAT_KATIBI' }] });

    const res = await call(tx, [{ staffMemberId: 's1', roleOnCase: 'AVUKAT_KATIBI' }]);

    expect(res.selectionProvided).toBe(true);
    expect(created).toEqual([{ caseId: 'case-1', staffMemberId: 's1', roleOnCase: 'AVUKAT_KATIBI' }]);
    // default sorgusu (isDefaultForNewCases) HİÇ çalışmamalı (merge yok)
    const wheres = tx.staffMember.findMany.mock.calls.map((c: any) => c[0].where);
    expect(wheres.some((w: any) => w.isDefaultForNewCases)).toBe(false);
  });

  it('(a) boş dto.staff → hiç personel (deselection); default eklenmez', async () => {
    const { tx, created } = mockTx({ defaults: [{ id: 'd1', staffType: 'PERSONEL' }] });

    const res = await call(tx, []);

    expect(res.selectionProvided).toBe(true);
    expect(created).toHaveLength(0);
    expect(tx.staffMember.findMany).not.toHaveBeenCalled(); // requestedIds boş → sorgu yok
  });

  it('(b) dto.staff verilmezse eski isDefaultForNewCases davranışı AYNEN korunur', async () => {
    const { tx, created } = mockTx({
      defaults: [
        { id: 'd1', staffType: 'PERSONEL' },
        { id: 'd2', staffType: 'MUHASEBE' },
      ],
    });

    const res = await call(tx, undefined);

    expect(res.selectionProvided).toBe(false);
    expect(created).toEqual([
      { caseId: 'case-1', staffMemberId: 'd1', roleOnCase: 'PERSONEL' },
      { caseId: 'case-1', staffMemberId: 'd2', roleOnCase: 'MUHASEBE' },
    ]);
    expect(tx.staffMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-1', isDefaultForNewCases: true, isActive: true }),
      }),
    );
  });

  it('(c) cross-tenant / nonexistent staffMemberId reddedilir (BadRequest, create yok)', async () => {
    const { tx, created } = mockTx({ owned: [{ id: 's1', staffType: 'PERSONEL' }] }); // s2 owned değil

    await expect(
      call(tx, [{ staffMemberId: 's1' }, { staffMemberId: 's2' }]),
    ).rejects.toThrow(BadRequestException);

    expect(created).toHaveLength(0);
    expect(tx.caseStaff.create).not.toHaveBeenCalled();
  });

  it('(d) duplicate staffMemberId tek kayıt olur (dedupe)', async () => {
    const { tx, created } = mockTx({ owned: [{ id: 's1', staffType: 'PERSONEL' }] });

    const res = await call(tx, [{ staffMemberId: 's1' }, { staffMemberId: 's1' }]);

    expect(created).toHaveLength(1);
    expect(res.assigned).toEqual([{ staffMemberId: 's1', roleOnCase: 'PERSONEL' }]);
    expect(tx.staffMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ['s1'] } }) }),
    );
  });

  it('(d) roleOnCase verilmezse StaffMember.staffType kullanılır', async () => {
    const { tx, created } = mockTx({ owned: [{ id: 's1', staffType: 'SEKRETER' }] });

    await call(tx, [{ staffMemberId: 's1' }]); // roleOnCase yok

    expect(created[0].roleOnCase).toBe('SEKRETER');
  });

  it('(e) auditStaffAssignment → auditService.log CASE_STAFF üretir', async () => {
    const auditLog = jest.fn();
    (service as any).auditService = { log: auditLog };

    await (service as any).auditStaffAssignment('tenant-1', 'case-1', [
      { staffMemberId: 's1', roleOnCase: 'PERSONEL' },
    ]);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        action: 'CREATE',
        entityType: 'CASE_STAFF',
        entityId: 'case-1',
        newValues: { staff: [{ staffMemberId: 's1', roleOnCase: 'PERSONEL' }] },
      }),
    );
  });

  it('(e) auditStaffAssignment boş listede log ÜRETMEZ (default yol ek audit yok)', async () => {
    const auditLog = jest.fn();
    (service as any).auditService = { log: auditLog };

    await (service as any).auditStaffAssignment('tenant-1', 'case-1', []);

    expect(auditLog).not.toHaveBeenCalled();
  });
});
