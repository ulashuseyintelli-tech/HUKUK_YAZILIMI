import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UyapQueryService } from './uyap-query.service';
import { ActionCode } from '../policy-engine/types/action-code.enum';

/**
 * UYAP_QUERY soft-warning wiring (ASSIGN — [P] createQuery).
 *
 * createQuery'nin policy-engine UYAP_QUERY gate'ini ADVISORY çağırdığını kanıtlar:
 * - UYAP kesintisinde decision.warnings response'a `warnings` olarak EKLENİR (additive).
 * - ASLA bloklamaz: CPE allowed=false / throw / inject-yok durumlarında dahi sorgu oluşur.
 * - Mevcut createQuery davranışı (NotFound / "zaten var" BadRequest) korunur.
 *
 * DB yok: mock prisma + mock CasePolicyEngine.
 */
describe('UyapQueryService.createQuery — UYAP_QUERY soft-warning (advisory, [P])', () => {
  const caseDebtor = {
    id: 'cd-1',
    caseId: 'case-1',
    case: { tenantId: 't1', fileNumber: '2026/1' },
    debtor: { id: 'deb-1', name: 'Borçlu', identityNo: '111', type: 'INDIVIDUAL' },
  };
  const dto = { caseDebtorId: 'cd-1', queryType: 'NUFUS_ADRES' } as any;

  function makePrisma() {
    return {
      caseDebtor: { findFirst: jest.fn(async () => caseDebtor) },
      uyapQuery: {
        findFirst: jest.fn(async () => null), // mevcut sorgu yok
        create: jest.fn(async ({ data }: any) => ({ id: 'q-1', ...data, caseDebtor })),
      },
    };
  }

  const outageWarning = {
    code: 'UYAP_TEMPORARILY_UNAVAILABLE',
    message: 'UYAP geçici olarak erişilemiyor',
    severity: 'WARNING',
  };

  it('CPE outage → response.warnings UYAP_TEMPORARILY_UNAVAILABLE içerir (query yine oluşur)', async () => {
    const prisma = makePrisma();
    const cpe = {
      canPerformAction: jest.fn(async () => ({ allowed: true, warnings: [outageWarning] })),
    };
    const svc = new UyapQueryService(prisma as any, cpe as any);

    const res: any = await svc.createQuery('t1', 'u1', dto);

    expect(prisma.uyapQuery.create).toHaveBeenCalledTimes(1);
    expect(cpe.canPerformAction).toHaveBeenCalledWith('case-1', ActionCode.UYAP_QUERY, {
      debtorId: 'deb-1',
      userId: 'u1',
    });
    expect(res.id).toBe('q-1');
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0].code).toBe('UYAP_TEMPORARILY_UNAVAILABLE');
  });

  it('CPE uyarı yok → warnings boş, query oluşur', async () => {
    const prisma = makePrisma();
    const cpe = { canPerformAction: jest.fn(async () => ({ allowed: true, warnings: [] })) };
    const svc = new UyapQueryService(prisma as any, cpe as any);

    const res: any = await svc.createQuery('t1', 'u1', dto);

    expect(res.id).toBe('q-1');
    expect(res.warnings).toEqual([]);
  });

  it('CPE inject edilmemiş → fail-open: warnings boş, query oluşur, CPE çağrılmaz', async () => {
    const prisma = makePrisma();
    const svc = new UyapQueryService(prisma as any); // cpe undefined

    const res: any = await svc.createQuery('t1', 'u1', dto);

    expect(res.id).toBe('q-1');
    expect(res.warnings).toEqual([]);
  });

  it('CPE throw → fail-open: warnings boş, query oluşur (block YOK)', async () => {
    const prisma = makePrisma();
    const cpe = {
      canPerformAction: jest.fn(async () => {
        throw new Error('cpe patladı');
      }),
    };
    const svc = new UyapQueryService(prisma as any, cpe as any);

    const res: any = await svc.createQuery('t1', 'u1', dto);

    expect(res.id).toBe('q-1');
    expect(res.warnings).toEqual([]);
  });

  it('CPE allowed=false olsa BİLE BLOCK YOK (advisory): query oluşur + warnings taşınır', async () => {
    const prisma = makePrisma();
    const cpe = {
      canPerformAction: jest.fn(async () => ({
        allowed: false,
        reason: 'engel',
        warnings: [outageWarning],
      })),
    };
    const svc = new UyapQueryService(prisma as any, cpe as any);

    const res: any = await svc.createQuery('t1', 'u1', dto);

    expect(res.id).toBe('q-1'); // BLOK YOK — sorgu oluştu
    expect(res.warnings[0].code).toBe('UYAP_TEMPORARILY_UNAVAILABLE');
  });

  it('caseDebtor yok → NotFound (mevcut davranış korunur, CPE çağrılmaz)', async () => {
    const prisma = makePrisma();
    prisma.caseDebtor.findFirst = jest.fn(async () => null) as any;
    const cpe = { canPerformAction: jest.fn() };
    const svc = new UyapQueryService(prisma as any, cpe as any);

    await expect(svc.createQuery('t1', 'u1', dto)).rejects.toThrow(NotFoundException);
    expect(cpe.canPerformAction).not.toHaveBeenCalled();
  });

  it('aynı sorgu zaten var → BadRequest (mevcut davranış korunur)', async () => {
    const prisma = makePrisma();
    prisma.uyapQuery.findFirst = jest.fn(async () => ({ status: 'PENDING' })) as any;
    const svc = new UyapQueryService(prisma as any);

    await expect(svc.createQuery('t1', 'u1', dto)).rejects.toThrow(BadRequestException);
  });
});
