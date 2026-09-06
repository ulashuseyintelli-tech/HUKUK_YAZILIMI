import { NotFoundException } from '@nestjs/common';
import { ClientInfoRequestService } from './client-info-request.service';

describe('ClientInfoRequestService debtor ownership guard', () => {
  let prisma: any;
  let emailProvider: any;
  let service: ClientInfoRequestService;

  beforeEach(() => {
    prisma = {
      case: { findFirst: jest.fn() },
      client: { findFirst: jest.fn() },
      office: { findFirst: jest.fn() },
      clientInfoRequest: { create: jest.fn() },
      clientNotification: { create: jest.fn() },
    };
    emailProvider = { send: jest.fn() };
    // D-3a: ctor'a AuditService + OfficeApprovalService eklendi; bu vaka ADMIN aktorle kosar
    // (eligibility sorgusuz) — olculen sey debtor ownership guard'idir.
    service = new ClientInfoRequestService(prisma, emailProvider, { log: jest.fn() } as any, { isApproverEligible: jest.fn() } as any);
  });

  it('dto.debtorId verilen case içindeki CaseDebtor listesinde değilse reddeder', async () => {
    prisma.case.findFirst.mockResolvedValue({
      id: 'case-1',
      fileNumber: '2026/1',
      client: { id: 'client-1', displayName: 'Müvekkil' },
      lawyers: [],
      debtors: [
        { debtor: { id: 'debtor-in-case', name: 'Dosya Borçlusu', identityNo: '11111111111' } },
      ],
    });
    prisma.client.findFirst.mockResolvedValue({
      id: 'client-1',
      displayName: 'Müvekkil',
      email: 'client@example.com',
    });
    prisma.office.findFirst.mockResolvedValue(null);

    await expect(
      service.createRequest('tenant-1', {
        caseId: 'case-1',
        clientId: 'client-1',
        debtorId: 'same-tenant-but-not-in-case',
        emailTo: 'client@example.com',
      }, { userId: 'u1', tenantId: 'tenant-1', role: 'ADMIN' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'case-1', tenantId: 'tenant-1' },
    }));
    expect(prisma.clientInfoRequest.create).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
  });
});
