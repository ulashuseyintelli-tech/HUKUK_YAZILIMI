import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AddressService } from "../debtor/address.service";
import { DebtorService } from "../debtor/debtor.service";

const tenantId = "tenant-1";
const caseId = "case-1";
const caseDebtorId = "cd-1";
const userId = "user-1";
const addressId = "addr-1";

function activeGuard() {
  return {
    assertActiveByCaseDebtorId: jest.fn().mockResolvedValue({
      id: caseDebtorId,
      caseId,
      debtorId: "debtor-1",
      lifecycleStatus: "ACTIVE",
    }),
  };
}

function blockingGuard(error: Error) {
  return {
    assertActiveByCaseDebtorId: jest.fn().mockRejectedValue(error),
  };
}

function caseDebtorRow(overrides: Record<string, any> = {}) {
  return {
    id: caseDebtorId,
    caseId,
    debtorId: "debtor-1",
    selectedAddressId: addressId,
    serviceStatus: "NOT_STARTED",
    serviceChannel: null,
    trackingNo: null,
    sentAt: null,
    deliveredAt: null,
    returnedAt: null,
    returnReason: null,
    debtor: {
      id: "debtor-1",
      debtorAddresses: [
        {
          id: addressId,
          type: "DECLARED",
          street: "Test Sokak",
          district: "Kadikoy",
          city: "Istanbul",
        },
      ],
    },
    ...overrides,
  };
}

function makeDebtorService(
  guard = activeGuard(),
  caseDebtor = caseDebtorRow()
) {
  const tx = {
    serviceHistory: { create: jest.fn().mockResolvedValue({}) },
    caseDebtor: { update: jest.fn().mockResolvedValue({}) },
  };

  const prisma = {
    caseDebtor: {
      findFirst: jest.fn().mockResolvedValue(caseDebtor),
      update: jest.fn().mockResolvedValue({}),
    },
    serviceHistory: {
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (callback: any) => callback(tx)),
  };

  const service = new DebtorService(prisma as any, guard as any);
  jest.spyOn(service, "getCaseDebtorDetail").mockResolvedValue({ id: caseDebtorId } as any);

  return { service, prisma, tx, guard };
}

function makeAddressService(guard = activeGuard()) {
  const prisma = {
    caseDebtor: {
      findFirst: jest.fn().mockResolvedValue({
        id: caseDebtorId,
        debtorId: "debtor-1",
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    debtorAddress: {
      findFirst: jest.fn().mockResolvedValue({ id: addressId }),
    },
  };

  return { service: new AddressService(prisma as any, guard as any), prisma, guard };
}

describe("PR-L6e manual CaseDebtor mutation passive guards", () => {
  it("active updateServiceStatus passes", async () => {
    const { service, prisma, guard } = makeDebtorService();

    await service.updateServiceStatus(tenantId, caseId, caseDebtorId, userId, {
      status: "READY",
    });

    expect(guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(
      tenantId,
      caseDebtorId,
      { expectedCaseId: caseId }
    );
    expect(prisma.caseDebtor.update).toHaveBeenCalledTimes(1);
    expect(prisma.serviceHistory.create).toHaveBeenCalledTimes(1);
  });

  it("passive updateServiceStatus blocks before writes", async () => {
    const { service, prisma } = makeDebtorService(
      blockingGuard(
        new BadRequestException("Pasif dosya borçlusu yeni operasyon hedefi olamaz.")
      )
    );

    await expect(
      service.updateServiceStatus(tenantId, caseId, caseDebtorId, userId, {
        status: "READY",
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.caseDebtor.update).not.toHaveBeenCalled();
    expect(prisma.serviceHistory.create).not.toHaveBeenCalled();
  });

  it("wrong tenant or wrong case updateServiceStatus blocks safely", async () => {
    const { service, prisma, guard } = makeDebtorService(
      blockingGuard(new NotFoundException("Dosya borçlusu bulunamadı."))
    );

    await expect(
      service.updateServiceStatus("foreign-tenant", caseId, caseDebtorId, userId, {
        status: "READY",
      })
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(
      "foreign-tenant",
      caseDebtorId,
      { expectedCaseId: caseId }
    );
    expect(prisma.caseDebtor.update).not.toHaveBeenCalled();
    expect(prisma.serviceHistory.create).not.toHaveBeenCalled();
  });

  it("syncServiceStatusInTx remains allowed as late-result history", async () => {
    const guard = activeGuard();
    const service = new DebtorService({} as any, guard as any);
    const tx = {
      caseDebtor: {
        findFirst: jest.fn().mockResolvedValue(
          caseDebtorRow({
            lifecycleStatus: "PASSIVE",
            serviceStatus: "SENT",
          })
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      debtorAddress: {
        findUnique: jest.fn().mockResolvedValue({
          type: "DECLARED",
          street: "Test Sokak",
          district: "Kadikoy",
          city: "Istanbul",
        }),
      },
      serviceHistory: { create: jest.fn().mockResolvedValue({}) },
    };

    const result = await service.syncServiceStatusInTx(tx as any, {
      tenantId,
      caseDebtorId,
      newStatus: "DELIVERED",
      channel: "NORMAL",
      addressId,
    });

    expect(guard.assertActiveByCaseDebtorId).not.toHaveBeenCalled();
    expect(tx.caseDebtor.update).toHaveBeenCalledTimes(1);
    expect(tx.serviceHistory.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      debtorId: "debtor-1",
      addressId,
      newStatus: "DELIVERED",
    });
  });

  it("active startNewServiceAttempt passes", async () => {
    const { service, tx, guard } = makeDebtorService(
      activeGuard(),
      caseDebtorRow({ serviceStatus: "RETURNED" })
    );

    await service.startNewServiceAttempt(tenantId, caseId, caseDebtorId, userId, addressId);

    expect(guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(
      tenantId,
      caseDebtorId,
      { expectedCaseId: caseId }
    );
    expect(tx.serviceHistory.create).toHaveBeenCalledTimes(1);
    expect(tx.caseDebtor.update).toHaveBeenCalledTimes(1);
  });

  it("passive startNewServiceAttempt blocks before writes", async () => {
    const { service, prisma, tx } = makeDebtorService(
      blockingGuard(
        new BadRequestException("Pasif dosya borçlusu yeni operasyon hedefi olamaz.")
      ),
      caseDebtorRow({ serviceStatus: "RETURNED" })
    );

    await expect(
      service.startNewServiceAttempt(tenantId, caseId, caseDebtorId, userId, addressId)
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.serviceHistory.create).not.toHaveBeenCalled();
    expect(tx.caseDebtor.update).not.toHaveBeenCalled();
  });

  it("active setActiveAddress passes", async () => {
    const { service, prisma, guard } = makeAddressService();

    await service.setActiveAddress(tenantId, caseDebtorId, addressId);

    expect(guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(
      tenantId,
      caseDebtorId
    );
    expect(prisma.caseDebtor.update).toHaveBeenCalledWith({
      where: { id: caseDebtorId },
      data: { selectedAddressId: addressId },
    });
  });

  it("passive setActiveAddress blocks before update", async () => {
    const { service, prisma } = makeAddressService(
      blockingGuard(
        new BadRequestException("Pasif dosya borçlusu yeni operasyon hedefi olamaz.")
      )
    );

    await expect(
      service.setActiveAddress(tenantId, caseDebtorId, addressId)
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.caseDebtor.update).not.toHaveBeenCalled();
  });

  it("cross-tenant setActiveAddress blocks safely", async () => {
    const { service, prisma, guard } = makeAddressService(
      blockingGuard(new NotFoundException("Dosya borçlusu bulunamadı."))
    );

    await expect(
      service.setActiveAddress("foreign-tenant", caseDebtorId, addressId)
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(
      "foreign-tenant",
      caseDebtorId
    );
    expect(prisma.caseDebtor.update).not.toHaveBeenCalled();
  });
});
