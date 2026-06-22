/**
 * M2-A3a — CaseService.create() gerçek kişi Dosya Sorumlusu (tx-İÇİ atomik yazım + tx-öncesi validasyon).
 * create-then-PATCH footgun'u kapatır: responsibleLawyerId/StaffId artık POST create TX'inde yazılır.
 * none = sahipsiz (meşru); both → 400; pasif/cross-tenant aday → 400 (hiç dosya yaratılmaz);
 * legacy sorumluPersonelId hâlâ userId fallback'i KORUR.
 *
 * Harness (case-create-sorumlu-personel spec ile aynı): mock prisma + $transaction passthrough;
 * case.create STOP sentinel fırlatır → yazılan `data`yı yakalarız. pre-tx party/subcategory no-op.
 */
import { BadRequestException } from '@nestjs/common';
import { CaseService } from '../case.service';

const STOP = '__STOP_AFTER_CASE_CREATE__';

function setup(opts: { lawyerFound?: any; staffFound?: any } = {}) {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);

  const caseCreate = jest.fn(async (_args: any) => {
    throw new Error(STOP); // case.create'ten sonra dur → downstream tx mock'lanmaz
  });
  const lawyerFindFirst = jest.fn(async () => opts.lawyerFound ?? null);
  const staffFindFirst = jest.fn(async () => opts.staffFound ?? null);

  // Kapsam DIŞI pre-tx adımları no-op (4b/4c/sorumlu-personel izolasyon deseni).
  (service as any).validateSubCategoryRules = () => {};
  (service as any).resolveInlinePartiesBeforeTx = jest.fn(async () => {});
  (service as any).validateDebtorOwnershipBeforeCreate = jest.fn(async () => {});

  (service as any).prisma = {
    user: { findFirst: jest.fn(async () => ({ id: 'u1' })) },
    lawyer: { findFirst: lawyerFindFirst },
    staffMember: { findFirst: staffFindFirst },
    $transaction: jest.fn(async (cb: any) =>
      cb({
        executionOffice: { findUnique: jest.fn(async () => null) },
        case: { create: caseCreate },
      }),
    ),
  };

  return { service, caseCreate, lawyerFindFirst, staffFindFirst };
}

describe('M2-A3a CaseService.create() — gerçek kişi Dosya Sorumlusu (tx-içi yazım)', () => {
  it('lawyer owner → case.create data responsibleLawyerId yazar, staff null', async () => {
    const { service, caseCreate, lawyerFindFirst } = setup({ lawyerFound: { id: 'L1' } });
    await expect(
      service.create('tenant-1', { responsibleLawyerId: 'L1' } as any, 'user-1'),
    ).rejects.toThrow(STOP);
    expect(lawyerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'L1', tenantId: 'tenant-1', isActive: true, canBeResponsible: true },
      }),
    );
    const data = caseCreate.mock.calls[0][0].data;
    expect(data.responsibleLawyerId).toBe('L1');
    expect(data.responsibleStaffId).toBeNull();
  });

  it('staff owner → case.create data responsibleStaffId yazar, lawyer null', async () => {
    const { service, caseCreate, staffFindFirst } = setup({ staffFound: { id: 'S1' } });
    await expect(
      service.create('tenant-1', { responsibleStaffId: 'S1' } as any, 'user-1'),
    ).rejects.toThrow(STOP);
    expect(staffFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'S1', tenantId: 'tenant-1', isActive: true } }),
    );
    const data = caseCreate.mock.calls[0][0].data;
    expect(data.responsibleStaffId).toBe('S1');
    expect(data.responsibleLawyerId).toBeNull();
  });

  it('both set → 400 (tx ÖNCESİ); dosya yaratılmaz', async () => {
    const { service, caseCreate } = setup({ lawyerFound: { id: 'L1' }, staffFound: { id: 'S1' } });
    await expect(
      service.create(
        'tenant-1',
        { responsibleLawyerId: 'L1', responsibleStaffId: 'S1' } as any,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(caseCreate).not.toHaveBeenCalled();
  });

  it('pasif/cross-tenant aday (findFirst null) → 400; dosya yaratılmaz', async () => {
    const { service, caseCreate } = setup({ lawyerFound: null });
    await expect(
      service.create('tenant-1', { responsibleLawyerId: 'Lx' } as any, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(caseCreate).not.toHaveBeenCalled();
  });

  it('none → OK (sahipsiz meşru): responsible* null + legacy sorumluPersonelId = userId fallback', async () => {
    const { service, caseCreate, lawyerFindFirst, staffFindFirst } = setup();
    await expect(service.create('tenant-1', {} as any, 'user-1')).rejects.toThrow(STOP);
    expect(lawyerFindFirst).not.toHaveBeenCalled(); // none → aday sorgusu hiç çalışmaz
    expect(staffFindFirst).not.toHaveBeenCalled();
    const data = caseCreate.mock.calls[0][0].data;
    expect(data.responsibleLawyerId).toBeNull();
    expect(data.responsibleStaffId).toBeNull();
    expect(data.sorumluPersonelId).toBe('user-1'); // A2 fallback KORUNUR (gerçek kişi ayrı katman)
  });
});
