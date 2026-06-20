import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AssetQueryService } from "../asset-query/asset-query.service";
import { UyapQueryService } from "../address-discovery/uyap-query.service";
import { InstitutionLetterService } from "../address-discovery/institution-letter.service";
import { ThirdPartyService } from "../debtor/third-party.service";

const tenantId = "tenant-1";
const caseDebtorId = "cd-1";

function activeGuard() {
  return {
    assertActiveByCaseDebtorId: jest.fn().mockResolvedValue({
      id: caseDebtorId,
      caseId: "case-1",
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

function assetQueryRow(overrides: Record<string, any> = {}) {
  return {
    id: "asset-query-1",
    queryType: "VEHICLE",
    status: "QUEUED",
    result: null,
    resultData: null,
    errorMessage: null,
    reason: null,
    requestedAt: new Date("2026-01-01T00:00:00.000Z"),
    requestedBy: "user-1",
    requestedByUser: { name: "Ulas", surname: "Test" },
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

function makeAssetQueryService(guard = activeGuard()) {
  const prisma = {
    caseDebtor: {
      findFirst: jest.fn().mockResolvedValue({ id: caseDebtorId, case: { tenantId } }),
      update: jest.fn().mockResolvedValue({}),
    },
    assetQuery: {
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve(assetQueryRow({ ...data }))
      ),
      findFirst: jest.fn().mockResolvedValue({
        id: "asset-query-1",
        tenantId,
        caseDebtorId,
        queryType: "VEHICLE",
      }),
      update: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve(
          assetQueryRow({
            ...data,
            status: data.status,
            completedAt: data.completedAt,
            result: data.result,
          })
        )
      ),
    },
  };
  return { service: new AssetQueryService(prisma as any, guard as any), prisma, guard };
}

function makeUyapQueryService(guard = activeGuard()) {
  const caseDebtor = {
    id: caseDebtorId,
    caseId: "case-1",
    case: { tenantId, fileNumber: "2026/1" },
    debtor: { id: "debtor-1", name: "Borçlu", identityNo: "111", type: "INDIVIDUAL" },
  };
  const prisma = {
    caseDebtor: { findFirst: jest.fn().mockResolvedValue(caseDebtor) },
    uyapQuery: {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        if (!where?.id) return Promise.resolve(null);
        return Promise.resolve({
          id: "uyap-query-1",
          tenantId,
          status: "PENDING",
          queryCode: "AA",
          queryType: "NUFUS_ADRES",
          caseDebtor: { debtor: { id: "debtor-1" } },
        });
      }),
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "uyap-query-1", ...data, caseDebtor })
      ),
      update: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "uyap-query-1", ...data })
      ),
    },
  };
  return { service: new UyapQueryService(prisma as any, guard as any), prisma, guard };
}

function makeInstitutionLetterService(guard = activeGuard()) {
  const prisma = {
    caseDebtor: {
      findFirst: jest.fn().mockResolvedValue({
        id: caseDebtorId,
        case: {
          tenantId,
          fileNumber: "2026/1",
          executionFileNumber: "2026/1",
          executionOffice: { name: "Istanbul Icra", city: "Istanbul" },
        },
        debtor: { id: "debtor-1", name: "Borçlu", identityNo: "111", type: "INDIVIDUAL" },
      }),
    },
    institutionLetter: {
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "letter-1", ...data })
      ),
      findFirst: jest.fn().mockResolvedValue({
        id: "letter-1",
        tenantId,
        status: "SENT",
        institution: "SGK",
        caseDebtor: { debtor: { id: "debtor-1" } },
      }),
      update: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "letter-1", ...data })
      ),
    },
  };
  return { service: new InstitutionLetterService(prisma as any, guard as any), prisma, guard };
}

function makeThirdPartyService(guard = activeGuard()) {
  const collectionService = { create: jest.fn().mockResolvedValue({ id: "collection-1" }) };
  const prisma = {
    caseDebtor: { findFirst: jest.fn().mockResolvedValue({ id: caseDebtorId, case: { tenantId } }) },
    thirdParty: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({
        id: "third-party-1",
        tenantId,
        ihbarname89_1_date: new Date("2026-01-01T00:00:00.000Z"),
        ihbarname89_2_date: null,
        ihbarname89_3_date: null,
      }),
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "third-party-1", ...data })
      ),
      update: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "third-party-1", ...data })
      ),
    },
    externalCase: {
      findFirst: jest.fn().mockResolvedValue({
        id: "external-case-1",
        tenantId,
        receivedAmount: 0,
        claimAmount: 1000,
        claimCurrency: "TRY",
        attachmentStatus: "HACIZ_KONDU",
        externalCaseNo: "2026/9",
        externalOffice: "Istanbul Icra",
        counterpartyName: "Karsi Taraf",
        notes: null,
        caseDebtor: { case: { id: "case-1" } },
      }),
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "external-case-1", ...data })
      ),
      update: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "external-case-1", ...data })
      ),
    },
  };
  return {
    service: new ThirdPartyService(prisma as any, collectionService as any, guard as any),
    prisma,
    guard,
    collectionService,
  };
}

describe("PR-L6d operational create passive guards", () => {
  it("aktif CaseDebtor yeni operasyon create/run akışlarından geçer", async () => {
    const asset = makeAssetQueryService();
    await asset.service.runQueries(tenantId, caseDebtorId, "user-1", {
      types: ["VEHICLE"],
    } as any);
    expect(asset.guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(tenantId, caseDebtorId);
    expect(asset.prisma.assetQuery.create).toHaveBeenCalledTimes(1);

    const uyap = makeUyapQueryService();
    await uyap.service.createQuery(tenantId, "user-1", {
      caseDebtorId,
      queryType: "NUFUS_ADRES",
    } as any);
    expect(uyap.guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(tenantId, caseDebtorId);
    expect(uyap.prisma.uyapQuery.create).toHaveBeenCalledTimes(1);

    const institution = makeInstitutionLetterService();
    await institution.service.createLetter(tenantId, {
      caseDebtorId,
      institution: "SGK",
      letterType: "ADRES_SORGU",
    } as any);
    expect(institution.guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(tenantId, caseDebtorId);
    expect(institution.prisma.institutionLetter.create).toHaveBeenCalledTimes(1);

    const thirdParty = makeThirdPartyService();
    await thirdParty.service.create(tenantId, caseDebtorId, {
      type: "BANKA",
      name: "X Bank",
      address: "Adres",
    } as any);
    expect(thirdParty.guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(tenantId, caseDebtorId);
    expect(thirdParty.prisma.thirdParty.create).toHaveBeenCalledTimes(1);

    await thirdParty.service.createExternalCase(tenantId, caseDebtorId, {
      externalOffice: "Istanbul Icra",
      externalCaseNo: "2026/9",
      counterpartyName: "Karsi Taraf",
      claimAmount: 1000,
    });
    expect(thirdParty.prisma.externalCase.create).toHaveBeenCalledTimes(1);
  });

  it("pasif CaseDebtor create/run yazılarını DB create öncesi bloklar", async () => {
    const guard = blockingGuard(
      new BadRequestException("Pasif dosya borçlusu yeni operasyon hedefi olamaz.")
    );

    const asset = makeAssetQueryService(guard);
    await expect(
      asset.service.runQueries(tenantId, caseDebtorId, "user-1", { types: ["VEHICLE"] } as any)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(asset.prisma.assetQuery.create).not.toHaveBeenCalled();

    const uyap = makeUyapQueryService(guard);
    await expect(
      uyap.service.createQuery(tenantId, "user-1", {
        caseDebtorId,
        queryType: "NUFUS_ADRES",
      } as any)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(uyap.prisma.uyapQuery.create).not.toHaveBeenCalled();

    const institution = makeInstitutionLetterService(guard);
    await expect(
      institution.service.createLetter(tenantId, {
        caseDebtorId,
        institution: "SGK",
        letterType: "ADRES_SORGU",
      } as any)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(institution.prisma.institutionLetter.create).not.toHaveBeenCalled();

    const thirdParty = makeThirdPartyService(guard);
    await expect(
      thirdParty.service.create(tenantId, caseDebtorId, {
        type: "BANKA",
        name: "X Bank",
        address: "Adres",
      } as any)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(thirdParty.prisma.thirdParty.create).not.toHaveBeenCalled();

    await expect(
      thirdParty.service.createExternalCase(tenantId, caseDebtorId, {
        externalOffice: "Istanbul Icra",
        externalCaseNo: "2026/9",
        counterpartyName: "Karsi Taraf",
        claimAmount: 1000,
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(thirdParty.prisma.externalCase.create).not.toHaveBeenCalled();
  });

  it("cross-tenant caseDebtorId güvenli NotFound ile DB create öncesi bloklanır", async () => {
    const guard = blockingGuard(new NotFoundException("Dosya borçlusu bulunamadı."));

    const asset = makeAssetQueryService(guard);
    await expect(
      asset.service.runQueries(tenantId, "foreign-cd", "user-1", { types: ["VEHICLE"] } as any)
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(asset.prisma.assetQuery.create).not.toHaveBeenCalled();

    const uyap = makeUyapQueryService(guard);
    await expect(
      uyap.service.createQuery(tenantId, "user-1", {
        caseDebtorId: "foreign-cd",
        queryType: "NUFUS_ADRES",
      } as any)
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(uyap.prisma.uyapQuery.create).not.toHaveBeenCalled();

    const institution = makeInstitutionLetterService(guard);
    await expect(
      institution.service.createLetter(tenantId, {
        caseDebtorId: "foreign-cd",
        institution: "SGK",
        letterType: "ADRES_SORGU",
      } as any)
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(institution.prisma.institutionLetter.create).not.toHaveBeenCalled();

    const thirdParty = makeThirdPartyService(guard);
    await expect(
      thirdParty.service.create(tenantId, "foreign-cd", {
        type: "BANKA",
        name: "X Bank",
        address: "Adres",
      } as any)
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(thirdParty.prisma.thirdParty.create).not.toHaveBeenCalled();

    await expect(
      thirdParty.service.createExternalCase(tenantId, "foreign-cd", {
        externalOffice: "Istanbul Icra",
        externalCaseNo: "2026/9",
        counterpartyName: "Karsi Taraf",
        claimAmount: 1000,
      })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(thirdParty.prisma.externalCase.create).not.toHaveBeenCalled();
  });

  it("late-result ve tarihsel akışlar passive guard çağırmadan devam eder", async () => {
    const asset = makeAssetQueryService();
    await asset.service.updateQueryResult(tenantId, "asset-query-1", { result: "YES" } as any);
    expect(asset.guard.assertActiveByCaseDebtorId).not.toHaveBeenCalled();
    expect(asset.prisma.assetQuery.update).toHaveBeenCalledTimes(1);
    expect(asset.prisma.caseDebtor.update).toHaveBeenCalledTimes(1);

    const uyap = makeUyapQueryService();
    await uyap.service.recordQueryResponse(tenantId, "uyap-query-1", {
      status: "COMPLETED",
      addresses: [],
    } as any);
    await uyap.service.processQueryAddresses(tenantId, "uyap-query-1", []);
    expect(uyap.guard.assertActiveByCaseDebtorId).not.toHaveBeenCalled();
    expect(uyap.prisma.uyapQuery.update).toHaveBeenCalledTimes(2);

    const institution = makeInstitutionLetterService();
    await institution.service.markAsResponded(tenantId, "letter-1", {
      addresses: [],
      responseNotes: "Cevap geldi",
    } as any);
    await institution.service.markAsNoResponse(tenantId, "letter-1");
    expect(institution.guard.assertActiveByCaseDebtorId).not.toHaveBeenCalled();
    expect(institution.prisma.institutionLetter.update).toHaveBeenCalledTimes(2);

    const thirdParty = makeThirdPartyService();
    await thirdParty.service.recordResponse(tenantId, "third-party-1", {
      responseDate: "2026-01-02",
      responseContent: "Cevap",
    });
    await thirdParty.service.addExternalCaseCollection(tenantId, "external-case-1", {
      amount: 100,
      syncToMainCase: false,
    });
    expect(thirdParty.guard.assertActiveByCaseDebtorId).not.toHaveBeenCalled();
    expect(thirdParty.prisma.thirdParty.update).toHaveBeenCalledTimes(1);
    expect(thirdParty.prisma.externalCase.update).toHaveBeenCalledTimes(1);
  });
});
