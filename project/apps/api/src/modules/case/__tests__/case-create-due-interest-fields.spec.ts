import { CaseService } from '../case.service';
import { DueType, InterestType } from '../dto/case.dto';

const stub = {} as any;

function setup() {
  const auditService = { log: jest.fn(async () => undefined) } as any;
  const clientInfoRequestService = {
    sendAutoRequestOnCaseCreate: jest.fn(async () => undefined),
  } as any;
  const domainEventIngestService = {
    appendInTransaction: jest.fn(async () => undefined),
  } as any;

  const dueCreate = jest.fn(async ({ data }: any) => ({
    id: 'due-1',
    ...data,
    currency: 'TRY',
    sortOrder: 0,
  }));
  const claimItemCreate = jest.fn(async ({ data }: any) => ({ id: 'claim-1', ...data }));

  const tx = {
    executionOffice: { findUnique: jest.fn(async () => null) },
    case: {
      create: jest.fn(async ({ data }: any) => ({
        id: 'case-1',
        fileNumber: data.fileNumber,
        type: data.type,
        subType: data.subType,
        executionPath: data.executionPath,
        caseStatus: data.caseStatus,
        currency: data.currency,
        caseDate: data.caseDate,
        clientId: null,
      })),
      update: jest.fn(async () => undefined),
      findUnique: jest.fn(async () => ({
        id: 'case-1',
        fileNumber: null,
        type: 'GENERAL_EXECUTION',
        clientId: null,
      })),
    },
    due: { create: dueCreate },
    claimItem: { create: claimItemCreate },
    lawyer: { findMany: jest.fn(async () => []) },
    caseLawyer: {
      create: jest.fn(async ({ data }: any) => ({ id: 'case-lawyer-1', ...data })),
      update: jest.fn(async () => undefined),
    },
  } as any;

  const prisma = {
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  } as any;
  const service = new CaseService(
    prisma,
    auditService,
    clientInfoRequestService,
    stub,
    stub,
    domainEventIngestService,
    stub,
    stub,
    stub,
    stub,
  );

  (service as any).validateSubCategoryRules = jest.fn();
  (service as any).validateCaseFkOwnership = jest.fn();
  (service as any).resolveInlinePartiesBeforeTx = jest.fn(async () => undefined);
  (service as any).validateDebtorOwnershipBeforeCreate = jest.fn(async () => undefined);
  (service as any).createInstrumentsAndClaims = jest.fn(async () => 0);
  (service as any).assignCaseStaff = jest.fn(async () => ({
    selectionProvided: false,
    assigned: [],
  }));

  return { service, dueCreate, claimItemCreate };
}

describe('CaseService.create Due faiz alanlari', () => {
  it('create-case Due kaydina faiz kolonlarini yazar ve markerli ClaimItema tasir', async () => {
    const { service, dueCreate, claimItemCreate } = setup();

    await service.create(
      'tenant-1',
      {
        type: 'GENERAL_EXECUTION',
        dues: [
          {
            type: DueType.PRINCIPAL,
            description: 'Ana alacak',
            amount: 1000,
            dueDate: '2026-01-01',
            interestType: InterestType.YASAL,
            interestRate: 24,
            interestStartDate: '2026-01-02',
            interestEndDate: '2026-02-02',
            interestAmount: 123.45,
          },
        ],
      } as any,
      'user-1',
    );

    expect(dueCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId: 'case-1',
        type: DueType.PRINCIPAL,
        amount: 1000,
        interestType: InterestType.YASAL,
        interestRate: 24,
        interestStartDate: new Date('2026-01-02'),
        interestEndDate: new Date('2026-02-02'),
      }),
    });
    expect(claimItemCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        caseId: 'case-1',
        interestType: InterestType.YASAL,
        interestRate: 24,
        interestStartDate: new Date('2026-01-02T00:00:00.000Z'),
        interestEndDate: new Date('2026-02-02T00:00:00.000Z'),
        metadata: {
          dueInterest: {
            interestAmount: 123.45,
          },
          dueSync: {
            sourceDueId: 'due-1',
            mappedFrom: 'Due',
          },
        },
      }),
    });
  });
});
