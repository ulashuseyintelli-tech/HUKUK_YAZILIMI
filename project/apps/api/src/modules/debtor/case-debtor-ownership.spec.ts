import { NotFoundException } from "@nestjs/common";
import { CaseDebtorService } from "./case-debtor.service";

describe("CaseDebtorService selectedAddress ownership guard", () => {
  let prisma: any;
  let service: CaseDebtorService;

  beforeEach(() => {
    prisma = {
      case: { findFirst: jest.fn() },
      debtor: { findFirst: jest.fn() },
      debtorAddress: { findFirst: jest.fn() },
      caseDebtor: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new CaseDebtorService(prisma);
  });

  it("addDebtorToCase foreign selectedAddressId değerini reddeder", async () => {
    prisma.case.findFirst.mockResolvedValue({ id: "case-1", tenantId: "tenant-1" });
    prisma.debtor.findFirst.mockResolvedValue({
      id: "debtor-1",
      kepAddress: null,
      debtorAddresses: [],
    });
    prisma.caseDebtor.findFirst.mockResolvedValue(null);
    prisma.debtorAddress.findFirst.mockResolvedValue(null);

    await expect(
      service.addDebtorToCase("tenant-1", "case-1", {
        debtorId: "debtor-1",
        selectedAddressId: "addr-foreign",
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.debtorAddress.findFirst).toHaveBeenCalledWith({
      where: { id: "addr-foreign", debtorId: "debtor-1" },
      select: { id: true },
    });
    expect(prisma.caseDebtor.create).not.toHaveBeenCalled();
  });

  it("updateCaseDebtor foreign selectedAddressId değerini reddeder", async () => {
    prisma.caseDebtor.findFirst.mockResolvedValue({
      id: "case-debtor-1",
      caseId: "case-1",
      debtorId: "debtor-1",
      role: "ASIL_BORCLU",
      ilanenJustification: null,
      case: { tenantId: "tenant-1" },
      debtor: { kepAddress: null },
    });
    prisma.debtorAddress.findFirst.mockResolvedValue(null);

    await expect(
      service.updateCaseDebtor("tenant-1", "case-debtor-1", {
        selectedAddressId: "addr-foreign",
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.caseDebtor.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "case-debtor-1", case: { tenantId: "tenant-1" } },
    }));
    expect(prisma.debtorAddress.findFirst).toHaveBeenCalledWith({
      where: { id: "addr-foreign", debtorId: "debtor-1" },
      select: { id: true },
    });
    expect(prisma.caseDebtor.update).not.toHaveBeenCalled();
  });
});
