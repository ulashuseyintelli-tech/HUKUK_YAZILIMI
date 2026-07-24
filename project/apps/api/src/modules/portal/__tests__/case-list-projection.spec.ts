/**
 * CLIENT-P2-U03-TRACK-B-U00B — getClientCases() explicit projection (POL-D §21/BP-06 §23;
 * I06 ratified transparency policy §33.5; U00'ın case-detail kapsamındaki aynı kaldırmasının
 * case-list ikizi).
 *
 * Yapısal kanıt Prisma çağrısındaki EXACT `select` şeklinden gelir (mock'a "fazladan alan"
 * besleyip sonra "filtrelendiğini" test etmek YANLIŞTIR — gerçek Prisma zaten select'te
 * olmayanı hiç döndürmez). `collections` (Collection.amount/date) select'ten ve response'tan
 * TAMAMEN KALDIRILDI — §33.4 Financial Disclosure Gate ile çelişen, onaysız/bildirimsiz ham
 * tahsilat ifşasıydı (owner ruling, 2026-07-24). `principalAmount` (Dosya Alacağı — statik,
 * orijinal hukuki alacak) BİLEREK KORUNDU; gerçek consumer (`apps/web/src/app/portal/cases/
 * page.tsx`) bu alanı "Alacak" kolonunda doğrudan render eder.
 */
import { PortalService } from "../portal.service";

const CLIENT_ID = "client-1";
const TENANT_ID = "tenant-1";

const CASE_LIST_SELECT_SHAPE = {
  id: true,
  fileNumber: true,
  executionFileNumber: true,
  type: true,
  caseStatus: true,
  caseDate: true,
  principalAmount: true,
  workflowStage: true,
  createdAt: true,
  debtors: {
    select: {
      debtor: { select: { name: true } },
    },
  },
};

const BOUNDED_CASE_LIST_ROW = {
  id: "case-1",
  fileNumber: "2026/1",
  executionFileNumber: "2026/9",
  type: "ILAMSIZ",
  caseStatus: "DERDEST",
  caseDate: new Date("2026-01-01"),
  principalAmount: "1000",
  workflowStage: "SEIZURE",
  createdAt: new Date("2026-01-02"),
  debtors: [{ debtor: { name: "Test Borçlu" } }],
};

function buildService(over: any = {}) {
  const prisma = {
    case: {
      findMany: jest
        .fn()
        .mockResolvedValue(over.findManyResult === undefined ? [BOUNDED_CASE_LIST_ROW] : over.findManyResult),
    },
  };
  const svc = new PortalService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  return { svc, prisma };
}

describe("PortalService.getClientCases — CLIENT-P2-U03-TRACK-B-U00B explicit projection", () => {
  it("[1] Prisma sorgusu tam olarak onaylı select'i kullanır (collections YOK)", async () => {
    const { svc, prisma } = buildService();
    await svc.getClientCases(CLIENT_ID, TENANT_ID);
    const call = prisma.case.findMany.mock.calls[0][0];
    expect(call.select).toEqual(CASE_LIST_SELECT_SHAPE);
  });

  it("[2] top-level response yalnız onaylı anahtarları taşır, collections hiç YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getClientCases(CLIENT_ID, TENANT_ID);
    expect(Object.keys(result[0]).sort()).toEqual(
      [
        "id",
        "fileNumber",
        "executionFileNumber",
        "type",
        "caseStatus",
        "caseDate",
        "principalAmount",
        "workflowStage",
        "createdAt",
        "debtors",
      ].sort()
    );
    expect(result[0]).not.toHaveProperty("collections");
  });

  it("[3] select'te collections hiç YOK", async () => {
    const { svc, prisma } = buildService();
    await svc.getClientCases(CLIENT_ID, TENANT_ID);
    const call = prisma.case.findMany.mock.calls[0][0];
    expect(call.select).not.toHaveProperty("collections");
  });

  it("[4] hiçbir finansal ikame ilişki select edilmiyor (ledgerEntries/collectionOverpayments/financialDisclosures)", async () => {
    const { svc, prisma } = buildService();
    await svc.getClientCases(CLIENT_ID, TENANT_ID);
    const call = prisma.case.findMany.mock.calls[0][0];
    for (const f of ["ledgerEntries", "collectionOverpayments", "financialDisclosures"]) {
      expect(call.select).not.toHaveProperty(f);
    }
  });

  it("[5] principalAmount (Dosya Alacağı) select'te VE response'ta korunur", async () => {
    const { svc, prisma } = buildService();
    const result: any = await svc.getClientCases(CLIENT_ID, TENANT_ID);
    const call = prisma.case.findMany.mock.calls[0][0];
    expect(call.select).toHaveProperty("principalAmount", true);
    expect(result[0]).toHaveProperty("principalAmount", "1000");
  });

  it("[6] debtor nested anahtarları yalnız name'dir (case-detail'in aksine type/id yok — mevcut davranış korunur)", async () => {
    const { svc } = buildService();
    const result: any = await svc.getClientCases(CLIENT_ID, TENANT_ID);
    expect(Object.keys(result[0].debtors[0].debtor).sort()).toEqual(["name"]);
  });

  it("[7] mevcut tenant+client WHERE koşulu (tenantId/showToClient/clientId veya caseClients) korunur", async () => {
    const { svc, prisma } = buildService();
    await svc.getClientCases(CLIENT_ID, TENANT_ID);
    const call = prisma.case.findMany.mock.calls[0][0];
    expect(call.where).toEqual({
      tenantId: TENANT_ID,
      showToClient: true,
      OR: [{ clientId: CLIENT_ID }, { caseClients: { some: { clientId: CLIENT_ID } } }],
    });
  });

  it("[8] mevcut sıralama (createdAt desc) korunur", async () => {
    const { svc, prisma } = buildService();
    await svc.getClientCases(CLIENT_ID, TENANT_ID);
    const call = prisma.case.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ createdAt: "desc" });
  });
});
