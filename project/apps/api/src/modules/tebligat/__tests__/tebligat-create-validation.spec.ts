import { BadRequestException } from "@nestjs/common";
import { CaseDebtorLifecycleStatus } from "@prisma/client";
import { TebligatService } from "../tebligat.service";
import { CaseDebtorLifecycleGuardService } from "../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service";
import {
  TebligatAddressType,
  TebligatChannel,
  TebligatNextAction,
  TebligatPttResult,
  TebligatType,
} from "../dto/tebligat.dto";

describe("PR-2b TebligatService.create() create validation", () => {
  const validCaseDebtor = {
    id: "case-debtor-1",
    caseId: "case-1",
    debtorId: "debtor-1",
    case: { tenantId: "tenant-1" },
    lifecycleStatus: CaseDebtorLifecycleStatus.ACTIVE,
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

  const build = (opts: { caseDebtor?: any; debtorAddress?: any; tebligat?: any } = {}) => {
    const prisma: any = {
      case: {
        findFirst: jest.fn().mockResolvedValue({ id: "case-1", tenantId: "tenant-1" }),
      },
      caseDebtor: {
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          const caseDebtor = opts.caseDebtor ?? null;
          if (!caseDebtor) return null;
          if (where.id && caseDebtor.id !== where.id) return null;
          if (where.case?.tenantId && caseDebtor.case?.tenantId !== where.case.tenantId) {
            return null;
          }
          if (where.case?.id && caseDebtor.caseId !== where.case.id) return null;
          return {
            id: caseDebtor.id,
            caseId: caseDebtor.caseId,
            debtorId: caseDebtor.debtorId,
            lifecycleStatus:
              caseDebtor.lifecycleStatus ?? CaseDebtorLifecycleStatus.ACTIVE,
          };
        }),
      },
      debtorAddress: {
        findUnique: jest.fn().mockResolvedValue(opts.debtorAddress ?? null),
      },
      tebligat: {
        findFirst: jest.fn().mockResolvedValue(opts.tebligat ?? null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: "tebligat-1",
          ...data,
        })),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: "failed-tebligat-1",
          ...data,
        })),
      },
    };

    const svc = new TebligatService(
      prisma,
      {} as any,
      {} as any,
      new CaseDebtorLifecycleGuardService(prisma)
    );
    return { svc, prisma };
  };

  it("valid caseDebtorId accepted", async () => {
    const { svc, prisma } = build({ caseDebtor: validCaseDebtor });

    const result = await svc.create(
      "tenant-1",
      buildDto({ caseDebtorId: "case-debtor-1" })
    );

    expect(prisma.caseDebtor.findFirst).toHaveBeenCalledWith({
      where: {
        id: "case-debtor-1",
        case: {
          tenantId: "tenant-1",
          id: "case-1",
        },
      },
      select: {
        id: true,
        caseId: true,
        debtorId: true,
        lifecycleStatus: true,
      },
    });
    expect(prisma.tebligat.create).toHaveBeenCalled();
    expect(result.caseDebtorId).toBe("case-debtor-1");
  });

  it("passive caseDebtorId rejected", async () => {
    const { svc, prisma } = build({
      caseDebtor: {
        ...validCaseDebtor,
        lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE,
      },
    });

    await expect(
      svc.create("tenant-1", buildDto({ caseDebtorId: "case-debtor-1" }))
    ).rejects.toThrow(BadRequestException);

    expect(prisma.tebligat.create).not.toHaveBeenCalled();
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

    expect(prisma.caseDebtor.findFirst).not.toHaveBeenCalled();
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

  it("addressId with passive caseDebtorId rejected before address lookup", async () => {
    const { svc, prisma } = build({
      caseDebtor: {
        ...validCaseDebtor,
        lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE,
      },
      debtorAddress: validAddress,
    });

    await expect(
      svc.create(
        "tenant-1",
        buildDto({ caseDebtorId: "case-debtor-1", addressId: "address-1" })
      )
    ).rejects.toThrow(BadRequestException);

    expect(prisma.debtorAddress.findUnique).not.toHaveBeenCalled();
    expect(prisma.tebligat.create).not.toHaveBeenCalled();
  });

  it("undefined caseDebtorId/addressId still accepted", async () => {
    const { svc, prisma } = build();

    await svc.create("tenant-1", buildDto());

    expect(prisma.caseDebtor.findFirst).not.toHaveBeenCalled();
    expect(prisma.debtorAddress.findUnique).not.toHaveBeenCalled();
    expect(prisma.tebligat.create).toHaveBeenCalled();
  });

  it("null caseDebtorId/addressId still accepted", async () => {
    const { svc, prisma } = build();

    await svc.create("tenant-1", buildDto({ caseDebtorId: null, addressId: null }));

    expect(prisma.caseDebtor.findFirst).not.toHaveBeenCalled();
    expect(prisma.debtorAddress.findUnique).not.toHaveBeenCalled();
    expect(prisma.tebligat.create).toHaveBeenCalled();
  });

  it("createMernisTebligat active linked failed tebligat passes", async () => {
    const failedTebligat = {
      id: "failed-tebligat-1",
      tenantId: "tenant-1",
      caseId: "case-1",
      caseDebtorId: "case-debtor-1",
      tebligatType: TebligatType.ODEME_EMRI,
      addressType: TebligatAddressType.BILINEN,
      recipientName: "Borçlu Adı",
      recipientTcVkn: "11111111111",
      channel: TebligatChannel.PTT,
      pttResult: TebligatPttResult.ADRESTE_BULUNAMADI,
      nextAction: TebligatNextAction.MERNIS_TEBLIGAT,
    };
    const { svc, prisma } = build({
      caseDebtor: validCaseDebtor,
      tebligat: failedTebligat,
    });

    const result = await svc.createMernisTebligat(
      "tenant-1",
      "failed-tebligat-1",
      "MERNIS adresi"
    );

    expect(prisma.caseDebtor.findFirst).toHaveBeenCalled();
    expect(prisma.tebligat.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseDebtorId: "case-debtor-1",
        addressType: TebligatAddressType.MERNIS,
        addressText: "MERNIS adresi",
      }),
    });
    expect(prisma.tebligat.update).toHaveBeenCalledWith({
      where: { id: "failed-tebligat-1" },
      data: { nextAction: TebligatNextAction.TEBLIG_TAMAMLANDI },
    });
    expect(result.caseDebtorId).toBe("case-debtor-1");
  });

  it("createMernisTebligat passive linked failed tebligat blocks without creating or updating", async () => {
    const failedTebligat = {
      id: "failed-tebligat-1",
      tenantId: "tenant-1",
      caseId: "case-1",
      caseDebtorId: "case-debtor-1",
      tebligatType: TebligatType.ODEME_EMRI,
      addressType: TebligatAddressType.BILINEN,
      recipientName: "Borçlu Adı",
      recipientTcVkn: "11111111111",
      channel: TebligatChannel.PTT,
      pttResult: TebligatPttResult.ADRESTE_BULUNAMADI,
      nextAction: TebligatNextAction.MERNIS_TEBLIGAT,
    };
    const { svc, prisma } = build({
      caseDebtor: {
        ...validCaseDebtor,
        lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE,
      },
      tebligat: failedTebligat,
    });

    await expect(
      svc.createMernisTebligat("tenant-1", "failed-tebligat-1", "MERNIS adresi")
    ).rejects.toThrow(BadRequestException);

    expect(prisma.tebligat.create).not.toHaveBeenCalled();
    expect(prisma.tebligat.update).not.toHaveBeenCalled();
  });
});
