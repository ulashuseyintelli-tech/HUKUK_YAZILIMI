/**
 * CLIENT-P2-U03-I01 — getCaseDetail() explicit projection (POL-D §21/BP-06 §23).
 *
 * Yapısal kanıt Prisma çağrısındaki EXACT `select` şeklinden gelir (mock'a "fazladan alan"
 * besleyip sonra "filtrelendiğini" test etmek YANLIŞTIR — gerçek Prisma zaten select'te
 * olmayanı hiç döndürmez). Bu yüzden testler: (a) select'in tam olarak onaylı şekilde
 * olduğunu, (b) service'in Prisma'dan gelen bounded satırı OLDUĞU GİBİ döndürdüğünü (üstüne
 * bir şey eklemediğini) doğrular.
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
  debtors: {
    select: {
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

const BOUNDED_CASE_ROW = {
  id: CASE_ID,
  fileNumber: "2026/1",
  executionFileNumber: "2026/9",
  type: "ILAMSIZ",
  caseStatus: "DERDEST",
  workflowStage: "SEIZURE",
  caseDate: new Date("2026-01-01"),
  principalAmount: "1000",
  debtors: [{ debtor: { name: "Test Borçlu", type: "PERSON" } }],
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

  it("[7] dahiliNot select'te YOK", async () => {
    const { svc, prisma } = buildService();
    await svc.getCaseDetail(CASE_ID, CLIENT_ID, TENANT_ID);
    const call = prisma.case.findFirst.mock.calls[0][0];
    expect(call.select).not.toHaveProperty("dahiliNot");
    expect(call.select).not.toHaveProperty("muvekkilNotu");
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
