/**
 * CLIENT-P2-U03-I01 + CLIENT-P2-U03-TRACK-A-I01 + CLIENT-P2-U03-TRACK-A-I02 — getCaseDetail()
 * explicit projection (POL-D §21/BP-06 §23; I06 ratified transparency policy §33.5).
 *
 * Yapısal kanıt Prisma çağrısındaki EXACT `select` şeklinden gelir (mock'a "fazladan alan"
 * besleyip sonra "filtrelendiğini" test etmek YANLIŞTIR — gerçek Prisma zaten select'te
 * olmayanı hiç döndürmez). Bu yüzden testler: (a) select'in tam olarak onaylı şekilde
 * olduğunu, (b) service'in Prisma'dan gelen bounded satırı OLDUĞU GİBİ döndürdüğünü (üstüne
 * bir şey eklemediğini) doğrular. TRACK-A-I02 istisnası: asset-query alanları için service
 * artık post-processing yapıyor (ham alanlar → curated `assetQuery`), bu yüzden o alanlar
 * için hem select hem response ayrı ayrı doğrulanır.
 */
import { NotFoundException } from "@nestjs/common";
import { PortalService } from "../portal.service";

const CLIENT_ID = "client-1";
const TENANT_ID = "tenant-1";
const CASE_ID = "case-1";

const CASE_DETAIL_SELECT_SHAPE = {
  id: true,
  fileNumber: true,
  executionFileNumber: true,
  type: true,
  caseStatus: true,
  workflowStage: true,
  caseDate: true,
  principalAmount: true,
  muvekkilNotu: true,
  debtors: {
    select: {
      role: true,
      debtorLawyerName: true,
      debtorLawyerBarNo: true,
      assetVehicle: true,
      assetRealEstate: true,
      assetBank: true,
      assetSgkWage: true,
      assetLastQueryAt: true,
      debtor: { select: { name: true, type: true } },
    },
  },
  collections: {
    select: { id: true, date: true, type: true, amount: true },
    orderBy: { date: "desc" },
  },
  dues: {
    select: { id: true, type: true, amount: true, dueDate: true, currency: true },
  },
};

const ASSET_LAST_QUERY_AT = new Date("2026-06-15T10:00:00.000Z");

const BOUNDED_CASE_ROW = {
  id: CASE_ID,
  fileNumber: "2026/1",
  executionFileNumber: "2026/9",
  type: "ILAMSIZ",
  caseStatus: "DERDEST",
  workflowStage: "SEIZURE",
  caseDate: new Date("2026-01-01"),
  principalAmount: "1000",
  muvekkilNotu: "Dosyanız aktif olarak takip edilmektedir.",
  debtors: [
    {
      role: "ASIL_BORCLU",
      debtorLawyerName: "Ayşe Vekil",
      debtorLawyerBarNo: "34567",
      assetVehicle: "YES",
      assetRealEstate: "NO",
      assetBank: "PENDING",
      assetSgkWage: "ERROR",
      assetLastQueryAt: ASSET_LAST_QUERY_AT,
      debtor: { name: "Test Borçlu", type: "PERSON" },
    },
  ],
  collections: [{ id: "col-1", date: new Date("2026-02-01"), type: "BANKA", amount: "500" }],
  dues: [{ id: "due-1", type: "ASIL_ALACAK", amount: "1000", dueDate: new Date("2026-01-01"), currency: "TRY" }],
};

function buildService(over: any = {}) {
  const prisma = {
    case: {
      findFirst: jest
        .fn()
        .mockResolvedValue(over.findFirstResult === undefined ? BOUNDED_CASE_ROW : over.findFirstResult),
    },
  };
  const svc = new PortalService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  return { svc, prisma };
}

describe("PortalService.getCaseDetail — CLIENT-P2-U03-I01 explicit projection", () => {
  it("[1] Prisma sorgusu tam olarak onaylı nested select'i kullanır", async () => {
    const { svc, prisma } = buildService();
    await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    const call = prisma.case.findFirst.mock.calls[0][0];
    expect(call.select).toEqual(CASE_DETAIL_SELECT_SHAPE);
  });

  it("[2] top-level response yalnız onaylı anahtarları taşır", async () => {
    const { svc } = buildService();
    const result: any = await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    expect(Object.keys(result).sort()).toEqual(
      [
        "id",
        "fileNumber",
        "executionFileNumber",
        "type",
        "caseStatus",
        "workflowStage",
        "caseDate",
        "principalAmount",
        "muvekkilNotu",
        "debtors",
        "collections",
        "dues",
      ].sort()
    );
  });

  it("[3] debtor nested anahtarları yalnız name/type'tır (CaseDebtor.id YOK)", async () => {
    const { svc } = buildService();
    const result: any = await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    expect(Object.keys(result.debtors[0].debtor).sort()).toEqual(["name", "type"]);
    expect(result.debtors[0]).not.toHaveProperty("id");
  });

  it("[3a] CLIENT-P2-U03-TRACK-A-I01: Case.muvekkilNotu select'te VAR ve response'ta OLDUĞU GİBİ döner", async () => {
    const { svc, prisma } = buildService();
    const result: any = await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    const call = prisma.case.findFirst.mock.calls[0][0];
    expect(call.select).toHaveProperty("muvekkilNotu", true);
    expect(result.muvekkilNotu).toBe("Dosyanız aktif olarak takip edilmektedir.");
  });

  it("[3b] CLIENT-P2-U03-TRACK-A-I01: CaseDebtor.role select'te VAR ve response'ta OLDUĞU GİBİ döner", async () => {
    const { svc, prisma } = buildService();
    const result: any = await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    const call = prisma.case.findFirst.mock.calls[0][0];
    expect(call.select.debtors.select).toHaveProperty("role", true);
    expect(result.debtors[0].role).toBe("ASIL_BORCLU");
  });

  it("[3c] CLIENT-P2-U03-TRACK-A-I01: debtorLawyerName/debtorLawyerBarNo select'te VAR, debtorLawyerId KESİNLİKLE YOK", async () => {
    const { svc, prisma } = buildService();
    const result: any = await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    const call = prisma.case.findFirst.mock.calls[0][0];
    const debtorsSelect = call.select.debtors.select;
    expect(debtorsSelect).toHaveProperty("debtorLawyerName", true);
    expect(debtorsSelect).toHaveProperty("debtorLawyerBarNo", true);
    expect(debtorsSelect).not.toHaveProperty("debtorLawyerId");
    expect(result.debtors[0].debtorLawyerName).toBe("Ayşe Vekil");
    expect(result.debtors[0].debtorLawyerBarNo).toBe("34567");
    expect(result.debtors[0]).not.toHaveProperty("debtorLawyerId");
  });

  it("[3d] TRACK-A-I02: 5 ham asset-query alanı select'te VAR (debtors seviyesinde)", async () => {
    const { svc, prisma } = buildService();
    await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    const call = prisma.case.findFirst.mock.calls[0][0];
    const debtorsSelect = call.select.debtors.select;
    expect(debtorsSelect).toHaveProperty("assetVehicle", true);
    expect(debtorsSelect).toHaveProperty("assetRealEstate", true);
    expect(debtorsSelect).toHaveProperty("assetBank", true);
    expect(debtorsSelect).toHaveProperty("assetSgkWage", true);
    expect(debtorsSelect).toHaveProperty("assetLastQueryAt", true);
  });

  it("[3e] TRACK-A-I02: AssetQuery/EnforcementAction relation'ları select'te KESİNLİKLE YOK", async () => {
    const { svc, prisma } = buildService();
    await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    const call = prisma.case.findFirst.mock.calls[0][0];
    const debtorsSelect = call.select.debtors.select;
    expect(debtorsSelect).not.toHaveProperty("assetQueries");
    expect(debtorsSelect).not.toHaveProperty("enforcementActions");
  });

  it("[3f] TRACK-A-I02: response'ta yalnız curated `assetQuery` objesi var, 5 ham alan KESİNLİKLE YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    const d = result.debtors[0];
    expect(d).toHaveProperty("assetQuery");
    for (const f of ["assetVehicle", "assetRealEstate", "assetBank", "assetSgkWage", "assetLastQueryAt"]) {
      expect(d).not.toHaveProperty(f);
    }
  });

  it("[3g] TRACK-A-I02: curated assetQuery — 4 kategori doğru ve bağımsız map edilir, lastQueryAt korunur", async () => {
    const { svc } = buildService();
    const result: any = await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    expect(result.debtors[0].assetQuery).toEqual({
      vehicle: "FOUND",
      realEstate: "NOT_FOUND",
      bank: "RESULT_PENDING",
      sgkWage: "RESULT_UNAVAILABLE",
      lastQueryAt: ASSET_LAST_QUERY_AT,
    });
  });

  it("[3h] TRACK-A-I02: UNKNOWN → NOT_QUERIED, lastQueryAt null → null kalır", async () => {
    const { svc } = buildService({
      findFirstResult: {
        ...BOUNDED_CASE_ROW,
        debtors: [
          {
            ...BOUNDED_CASE_ROW.debtors[0],
            assetVehicle: "UNKNOWN",
            assetRealEstate: "UNKNOWN",
            assetBank: "UNKNOWN",
            assetSgkWage: "UNKNOWN",
            assetLastQueryAt: null,
          },
        ],
      },
    });
    const result: any = await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    expect(result.debtors[0].assetQuery).toEqual({
      vehicle: "NOT_QUERIED",
      realEstate: "NOT_QUERIED",
      bank: "NOT_QUERIED",
      sgkWage: "NOT_QUERIED",
      lastQueryAt: null,
    });
  });

  it("[3i] TRACK-A-I02: `resultData`/`errorMessage`/`requestedBy`/`reason`/`idempotencyKey` response'ta hiç YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    const d = result.debtors[0];
    for (const f of ["resultData", "errorMessage", "requestedBy", "reason", "idempotencyKey"]) {
      expect(d).not.toHaveProperty(f);
      expect(d.assetQuery).not.toHaveProperty(f);
    }
  });

  it("[4] collection nested anahtarları yalnız id/date/type/amount'tır", async () => {
    const { svc } = buildService();
    const result: any = await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    expect(Object.keys(result.collections[0]).sort()).toEqual(["amount", "date", "id", "type"]);
  });

  it("[5] due nested anahtarları yalnız id/type/amount/dueDate/currency'dir", async () => {
    const { svc } = buildService();
    const result: any = await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    expect(Object.keys(result.dues[0]).sort()).toEqual(["amount", "currency", "dueDate", "id", "type"]);
  });

  it("[6] lifecycleEvents response'ta hiç YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    expect(result).not.toHaveProperty("lifecycleEvents");
  });

  it("[7] dahiliNot select'te YOK (muvekkilNotu'ndan yapısal olarak bağımsız kalır — I06 invariant)", async () => {
    const { svc, prisma } = buildService();
    await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    const call = prisma.case.findFirst.mock.calls[0][0];
    expect(call.select).not.toHaveProperty("dahiliNot");
    expect(call.select).not.toHaveProperty("showToClient");
  });

  it("[8] staff/personel referansları select'te YOK", async () => {
    const { svc, prisma } = buildService();
    await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    const call = prisma.case.findFirst.mock.calls[0][0];
    for (const f of ["sorumluPersonelId", "responsibleLawyerId", "responsibleStaffId", "createdById"]) {
      expect(call.select).not.toHaveProperty(f);
    }
  });

  it("[9] otomasyon/risk/OCR alanları select'te YOK", async () => {
    const { svc, prisma } = buildService();
    await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    const call = prisma.case.findFirst.mock.calls[0][0];
    for (const f of [
      "automationConfig",
      "isAutoMode",
      "isAutomationEnabled",
      "riskScore",
      "ocrText",
      "detectionKeywords",
      "confidenceScore",
      "metadata",
    ]) {
      expect(call.select).not.toHaveProperty(f);
    }
  });

  it("[10] CaseDebtor.quickNote/quickNoteUpdatedBy/passivatedById nested select'te YOK", async () => {
    const { svc, prisma } = buildService();
    await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    const call = prisma.case.findFirst.mock.calls[0][0];
    const debtorsSelect = call.select.debtors.select;
    expect(debtorsSelect).not.toHaveProperty("quickNote");
    expect(debtorsSelect).not.toHaveProperty("quickNoteUpdatedBy");
    expect(debtorsSelect).not.toHaveProperty("passivatedById");
    expect(debtorsSelect).not.toHaveProperty("id");
  });

  it("[11] Collection.idempotencyKey nested select'te YOK", async () => {
    const { svc, prisma } = buildService();
    await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    const call = prisma.case.findFirst.mock.calls[0][0];
    expect(call.select.collections.select).not.toHaveProperty("idempotencyKey");
    expect(call.select.collections.select).not.toHaveProperty("description");
  });

  it("[12] Due.finalizationNote/vergi alanları/description nested select'te YOK", async () => {
    const { svc, prisma } = buildService();
    await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    const call = prisma.case.findFirst.mock.calls[0][0];
    const duesSelect = call.select.dues.select;
    for (const f of ["finalizationNote", "hasKdv", "kdvRate", "hasBsmv", "hasKkdf", "interestTypeCode", "description"]) {
      expect(duesSelect).not.toHaveProperty(f);
    }
  });

  it("[13] same-client istek başarılı döner, mevcut WHERE koşulu (tenant+showToClient) korunur", async () => {
    const { svc, prisma } = buildService();
    const result = await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    expect(result).toBeTruthy();
    const call = prisma.case.findFirst.mock.calls[0][0];
    expect(call.where).toEqual(
      expect.objectContaining({ id: CASE_ID, tenantId: TENANT_ID, showToClient: true })
    );
  });

  it("[14] yabancı client → mevcut WHERE koşulu nedeniyle NotFoundException (0 satır)", async () => {
    const { svc } = buildService({ findFirstResult: null });
    await expect(svc.getCaseDetail(CASE_ID, "other-client", TENANT_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("[15] yabancı tenant → mevcut WHERE koşulu nedeniyle NotFoundException (0 satır)", async () => {
    const { svc } = buildService({ findFirstResult: null });
    await expect(svc.getCaseDetail(CASE_ID, CLIENT_ID, "other-tenant")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("[16] mevcut NotFoundException mesajı DEĞİŞMEDİ", async () => {
    const { svc } = buildService({ findFirstResult: null });
    await expect(svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID)).rejects.toThrow("Dosya bulunamadı");
  });
});
