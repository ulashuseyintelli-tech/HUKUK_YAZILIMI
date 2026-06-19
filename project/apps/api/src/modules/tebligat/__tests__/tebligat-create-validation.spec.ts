import { BadRequestException } from "@nestjs/common";
import { TebligatService } from "../tebligat.service";
import {
  TebligatAddressType,
  TebligatChannel,
  TebligatType,
} from "../dto/tebligat.dto";

describe("PR-2b TebligatService.create() create validation", () => {
  const validCaseDebtor = {
    id: "case-debtor-1",
    caseId: "case-1",
    debtorId: "debtor-1",
    case: { tenantId: "tenant-1" },
  };

  const validAddress = {
    id: "address-1",
    debtorId: "debtor-1",
  };

  const buildDto = (overrides: Record<string, unknown> = {}) =>
    ({
      caseId: "case-1",
      tebligatType: TebligatType.ODEME_EMRI,
      addressType: TebligatAddressType.BILINEN,
      addressText: "Adres metni",
      recipientName: "Borçlu Adı",
      channel: TebligatChannel.PTT,
      ...overrides,
    }) as any;

  const build = (opts: { caseDebtor?: any; debtorAddress?: any } = {}) => {
    const prisma: any = {
      case: {
        findFirst: jest.fn().mockResolvedValue({ id: "case-1", tenantId: "tenant-1" }),
      },
      caseDebtor: {
        findUnique: jest.fn().mockResolvedValue(opts.caseDebtor ?? null),
      },
      debtorAddress: {
        findUnique: jest.fn().mockResolvedValue(opts.debtorAddress ?? null),
      },
      tebligat: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: "tebligat-1",
          ...data,
        })),
      },
    };

    const svc = new TebligatService(prisma, {} as any, {} as any);
    return { svc, prisma };
  };

  it("valid caseDebtorId accepted", async () => {
    const { svc, prisma } = build({ caseDebtor: validCaseDebtor });

    const result = await svc.create(
      "tenant-1",
      buildDto({ caseDebtorId: "case-debtor-1" })
    );

    expect(prisma.caseDebtor.findUnique).toHaveBeenCalledWith({
      where: { id: "case-debtor-1" },
      select: {
        id: true,
        caseId: true,
        debtorId: true,
        case: { select: { tenantId: true } },
      },
    });
    expect(prisma.tebligat.create).toHaveBeenCalled();
    expect(result.caseDebtorId).toBe("case-debtor-1");
  });

  it("orphan caseDebtorId rejected", async () => {
    const { svc, prisma } = build({ caseDebtor: null });

    await expect(
      svc.create("tenant-1", buildDto({ caseDebtorId: "orphan-case-debtor" }))
    ).rejects.toThrow(BadRequestException);

    expect(prisma.tebligat.create).not.toHaveBeenCalled();
  });

  it("wrong-case caseDebtorId rejected", async () => {
    const { svc, prisma } = build({
      caseDebtor: { ...validCaseDebtor, caseId: "case-2" },
    });

    await expect(
      svc.create("tenant-1", buildDto({ caseDebtorId: "case-debtor-1" }))
    ).rejects.toThrow(BadRequestException);

    expect(prisma.tebligat.create).not.toHaveBeenCalled();
  });

  it("cross-tenant caseDebtorId rejected", async () => {
    const { svc, prisma } = build({
      caseDebtor: { ...validCaseDebtor, case: { tenantId: "tenant-2" } },
    });

    await expect(
      svc.create("tenant-1", buildDto({ caseDebtorId: "case-debtor-1" }))
    ).rejects.toThrow(BadRequestException);

    expect(prisma.tebligat.create).not.toHaveBeenCalled();
  });

  it("addressId without caseDebtorId rejected", async () => {
    const { svc, prisma } = build({ debtorAddress: validAddress });

    await expect(
      svc.create("tenant-1", buildDto({ addressId: "address-1" }))
    ).rejects.toThrow(BadRequestException);

    expect(prisma.caseDebtor.findUnique).not.toHaveBeenCalled();
    expect(prisma.debtorAddress.findUnique).not.toHaveBeenCalled();
    expect(prisma.tebligat.create).not.toHaveBeenCalled();
  });

  it("addressId not owned by debtor rejected", async () => {
    const { svc, prisma } = build({
      caseDebtor: validCaseDebtor,
      debtorAddress: { id: "address-2", debtorId: "debtor-2" },
    });

    await expect(
      svc.create(
        "tenant-1",
        buildDto({ caseDebtorId: "case-debtor-1", addressId: "address-2" })
      )
    ).rejects.toThrow(BadRequestException);

    expect(prisma.tebligat.create).not.toHaveBeenCalled();
  });

  it("valid addressId owned by debtor accepted", async () => {
    const { svc, prisma } = build({
      caseDebtor: validCaseDebtor,
      debtorAddress: validAddress,
    });

    const result = await svc.create(
      "tenant-1",
      buildDto({ caseDebtorId: "case-debtor-1", addressId: "address-1" })
    );

    expect(prisma.debtorAddress.findUnique).toHaveBeenCalledWith({
      where: { id: "address-1" },
      select: {
        id: true,
        debtorId: true,
      },
    });
    expect(prisma.tebligat.create).toHaveBeenCalled();
    expect(result.addressId).toBe("address-1");
  });

  it("undefined caseDebtorId/addressId still accepted", async () => {
    const { svc, prisma } = build();

    await svc.create("tenant-1", buildDto());

    expect(prisma.caseDebtor.findUnique).not.toHaveBeenCalled();
    expect(prisma.debtorAddress.findUnique).not.toHaveBeenCalled();
    expect(prisma.tebligat.create).toHaveBeenCalled();
  });

  it("null caseDebtorId/addressId still accepted", async () => {
    const { svc, prisma } = build();

    await svc.create("tenant-1", buildDto({ caseDebtorId: null, addressId: null }));

    expect(prisma.caseDebtor.findUnique).not.toHaveBeenCalled();
    expect(prisma.debtorAddress.findUnique).not.toHaveBeenCalled();
    expect(prisma.tebligat.create).toHaveBeenCalled();
  });
});
