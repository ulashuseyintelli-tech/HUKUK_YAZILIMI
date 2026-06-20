import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AddressDiscoveryService } from './address-discovery.service';

const activeCaseDebtor = {
  id: 'cd-active',
  debtor: {
    id: 'debtor-1',
    name: 'Active Debtor',
    type: 'INDIVIDUAL',
    debtorAddresses: [],
  },
  case: { id: 'case-1', fileNumber: 'CASE-1' },
  uyapQueries: [],
  institutionLetters: [],
  serviceHistory: [],
};

describe('AddressDiscoveryService passive CaseDebtor guard', () => {
  let service: AddressDiscoveryService;
  let prisma: any;
  let crossFileService: any;
  let caseDebtorLifecycleGuard: any;

  beforeEach(() => {
    prisma = {
      addressResearch: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      caseDebtor: {
        findFirst: jest.fn(),
      },
      clientInfoRequest: {
        findMany: jest.fn(),
      },
    };
    crossFileService = {
      getCrossFileAddressCount: jest.fn().mockResolvedValue(0),
    };
    caseDebtorLifecycleGuard = {
      assertActiveByCaseDebtorId: jest.fn().mockResolvedValue({
        id: 'cd-active',
        caseId: 'case-1',
        debtorId: 'debtor-1',
        lifecycleStatus: 'ACTIVE',
      }),
    };

    service = new AddressDiscoveryService(
      prisma,
      {} as any,
      crossFileService,
      caseDebtorLifecycleGuard,
    );
  });

  it('passive getResearchStatus with no existing research creates nothing', async () => {
    prisma.addressResearch.findFirst.mockResolvedValue(null);
    caseDebtorLifecycleGuard.assertActiveByCaseDebtorId.mockRejectedValue(
      new BadRequestException('Pasif dosya borçlusu yeni operasyon hedefi olamaz.'),
    );

    await expect(service.getResearchStatus('tenant-1', 'cd-passive')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.addressResearch.create).not.toHaveBeenCalled();
    expect(prisma.addressResearch.update).not.toHaveBeenCalled();
  });

  it('active getResearchStatus keeps hidden create behavior', async () => {
    prisma.addressResearch.findFirst.mockResolvedValue(null);
    prisma.addressResearch.create.mockResolvedValue({
      id: 'research-1',
      tenantId: 'tenant-1',
      caseDebtorId: 'cd-active',
      status: 'NOT_STARTED',
    });
    prisma.caseDebtor.findFirst.mockResolvedValue(activeCaseDebtor);
    prisma.clientInfoRequest.findMany.mockResolvedValue([]);

    const result = await service.getResearchStatus('tenant-1', 'cd-active');

    expect(result.status).toBe('NOT_STARTED');
    expect(prisma.addressResearch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'tenant-1', caseDebtorId: 'cd-active' }),
      }),
    );
  });

  it('passive existing research read, complete, and exhausted closures stay allowed', async () => {
    const existingResearch = {
      id: 'research-existing',
      tenantId: 'tenant-1',
      caseDebtorId: 'cd-passive',
      status: 'IN_PROGRESS',
    };
    prisma.addressResearch.findFirst.mockResolvedValue(existingResearch);
    prisma.caseDebtor.findFirst.mockResolvedValue(activeCaseDebtor);
    prisma.clientInfoRequest.findMany.mockResolvedValue([]);
    prisma.addressResearch.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...existingResearch, ...data }),
    );

    await expect(service.getResearchStatus('tenant-1', 'cd-passive')).resolves.toMatchObject({
      id: 'research-existing',
    });
    await expect(service.completeResearch('tenant-1', 'cd-passive')).resolves.toMatchObject({
      status: 'COMPLETED',
    });
    await expect(service.markAsExhausted('tenant-1', 'cd-passive')).resolves.toMatchObject({
      status: 'EXHAUSTED',
    });

    expect(caseDebtorLifecycleGuard.assertActiveByCaseDebtorId).not.toHaveBeenCalled();
    expect(prisma.addressResearch.create).not.toHaveBeenCalled();
  });

  it('passive missing complete and exhausted block without creating research', async () => {
    prisma.addressResearch.findFirst.mockResolvedValue(null);
    caseDebtorLifecycleGuard.assertActiveByCaseDebtorId.mockRejectedValue(
      new BadRequestException('Pasif dosya borçlusu yeni operasyon hedefi olamaz.'),
    );

    await expect(service.completeResearch('tenant-1', 'cd-passive')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.markAsExhausted('tenant-1', 'cd-passive')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.addressResearch.create).not.toHaveBeenCalled();
    expect(prisma.addressResearch.update).not.toHaveBeenCalled();
  });

  it('suggestNextAction blocks passive CaseDebtor before status hidden create', async () => {
    caseDebtorLifecycleGuard.assertActiveByCaseDebtorId.mockRejectedValue(
      new BadRequestException('Pasif dosya borçlusu yeni operasyon hedefi olamaz.'),
    );

    await expect(service.suggestNextAction('tenant-1', 'cd-passive')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.addressResearch.findFirst).not.toHaveBeenCalled();
    expect(prisma.addressResearch.create).not.toHaveBeenCalled();
  });

  it('cross-tenant caseDebtorId blocks safely without leaking or creating research', async () => {
    prisma.addressResearch.findFirst.mockResolvedValue(null);
    caseDebtorLifecycleGuard.assertActiveByCaseDebtorId.mockRejectedValue(
      new NotFoundException('Dosya borçlusu bulunamadı.'),
    );

    await expect(service.getResearchStatus('tenant-1', 'foreign-cd')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.addressResearch.create).not.toHaveBeenCalled();
    expect(prisma.caseDebtor.findFirst).not.toHaveBeenCalled();
  });
});
