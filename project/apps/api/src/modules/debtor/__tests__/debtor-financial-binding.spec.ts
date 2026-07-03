import { NotFoundException } from "@nestjs/common";
import { DebtorService } from "../debtor.service";

function makeCaseDebtor(overrides: Record<string, unknown> = {}) {
  return {
    id: "cd-1",
    role: "ASIL_BORCLU",
    lifecycleStatus: "ACTIVE",
    selectedAddressId: null,
    selectedAddress: null,
    serviceStatus: "NOT_STARTED",
    serviceChannel: null,
    trackingNo: null,
    sentAt: null,
    deliveredAt: null,
    returnedAt: null,
    returnReason: null,
    assetVehicle: "UNKNOWN",
    assetRealEstate: "UNKNOWN",
    assetBank: "UNKNOWN",
    assetSgkWage: "UNKNOWN",
    assetLastQueryAt: null,
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    quickNote: null,
    debtor: {
      id: "debtor-1",
      name: "Ali Borclu",
      type: "INDIVIDUAL",
      identityNo: "12345678901",
      tckn: "12345678901",
      phone: null,
      email: null,
      riskLevel: null,
      status: "ACTIVE",
      debtorAddresses: [],
    },
    ...overrides,
  };
}

function makeService(caseDebtor: any, collections: any[] = []) {
  const prisma = {
    caseDebtor: {
      findFirst: jest.fn().mockResolvedValue(caseDebtor),
    },
    collection: {
      findMany: jest.fn().mockResolvedValue(collections),
    },
  };

  return {
    prisma,
    service: new DebtorService(prisma as any, {} as any, {} as any, {} as any),
  };
}

describe("DBIND-P2 DebtorService financial binding", () => {
  it("builds debtor financial summary from tenant/case/caseDebtor scoped collections", async () => {
    const collections = [
      { amount: 100, currency: "TRY", status: "CONFIRMED", date: new Date("2026-07-01T10:00:00Z") },
      { amount: 25.5, currency: "TRY", status: "CONFIRMED", date: new Date("2026-07-02T10:00:00Z") },
      { amount: 10, currency: "TRY", status: "PENDING", date: new Date("2026-07-03T10:00:00Z") },
      { amount: 7, currency: "USD", status: "CANCELLED", date: new Date("2026-07-04T10:00:00Z") },
      { amount: 2, currency: "USD", status: "REFUNDED", date: new Date("2026-07-05T10:00:00Z") },
    ];
    const { prisma, service } = makeService(makeCaseDebtor(), collections);

    const result = await service.getCaseDebtorDetail("tenant-1", "case-1", "cd-1");

    expect(prisma.collection.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        caseId: "case-1",
        caseDebtorId: "cd-1",
      },
      select: {
        amount: true,
        currency: true,
        status: true,
        date: true,
      },
    });
    expect(result.financialSummary).toMatchObject({
      totalConfirmedCollected: 125.5,
      totalPendingAmount: 10,
      totalCancelledAmount: 7,
      totalRefundedAmount: 2,
      collectionCount: 5,
      lastCollectionDate: "2026-07-05T10:00:00.000Z",
    });
    expect(result.financialSummary?.currencyBreakdown).toEqual([
      {
        currency: "TRY",
        confirmedCollected: 125.5,
        pendingAmount: 10,
        cancelledAmount: 0,
        refundedAmount: 0,
        collectionCount: 3,
        lastCollectionDate: "2026-07-03T10:00:00.000Z",
      },
      {
        currency: "USD",
        confirmedCollected: 0,
        pendingAmount: 0,
        cancelledAmount: 7,
        refundedAmount: 2,
        collectionCount: 2,
        lastCollectionDate: "2026-07-05T10:00:00.000Z",
      },
    ]);
  });

  it("does not read collections when case debtor ownership guard fails", async () => {
    const { prisma, service } = makeService(null);

    await expect(service.getCaseDebtorDetail("tenant-1", "case-1", "foreign-cd")).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.caseDebtor.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "foreign-cd",
        caseId: "case-1",
        case: { tenantId: "tenant-1" },
      },
    }));
    expect(prisma.collection.findMany).not.toHaveBeenCalled();
  });
});