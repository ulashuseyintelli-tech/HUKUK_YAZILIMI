/**
 * CLIENT-P2-U03-I04 — getClientPoas() explicit projection (POL-D §21/BP-06 §23).
 *
 * Yapısal kanıt Prisma çağrısındaki EXACT `select` şeklinden gelir (mock'a "fazladan alan"
 * besleyip sonra "filtrelendiğini" test etmek YANLIŞTIR — gerçek Prisma zaten select'te
 * olmayanı hiç döndürmez). Testler: (a) select'in tam olarak onaylı şekilde olduğunu,
 * (b) service'in Prisma'dan gelen bounded satırı OLDUĞU GİBİ döndürdüğünü doğrular.
 *
 * Approved contract, gerçek consumer'a (apps/web/.../portal/poas/page.tsx) göre doğrulanmıştır;
 * `isActive` (unused + WHERE'de zaten sabit true) ve `scope` (deprecated) KASITLI DIŞARIDA.
 */
import { PortalService } from "../portal.service";

const CLIENT_ID = "client-1";

const PORTAL_POA_CLIENT_SELECT_SHAPE = {
  id: true,
  notaryName: true,
  notaryCity: true,
  journalNo: true,
  poaNumber: true,
  dateIssued: true,
  isLimited: true,
  validUntil: true,
  status: true,
  canCollect: true,
  canWaive: true,
  canSettle: true,
  canRelease: true,
  lawyers: {
    select: {
      lawyer: { select: { name: true, surname: true, barNumber: true } },
    },
  },
};

const BOUNDED_POA_ROW = {
  id: "poa-1",
  notaryName: "İstanbul 5. Noterliği",
  notaryCity: "İstanbul",
  journalNo: "2026/123",
  poaNumber: "VEK-001",
  dateIssued: new Date("2026-01-01"),
  isLimited: true,
  validUntil: new Date("2027-01-01"),
  status: "ACTIVE",
  canCollect: true,
  canWaive: false,
  canSettle: false,
  canRelease: false,
  lawyers: [{ lawyer: { name: "Ahmet", surname: "Yılmaz", barNumber: "12345" } }],
};

function buildService(over: any = {}) {
  const prisma = {
    clientPowerOfAttorney: {
      findMany: jest.fn().mockResolvedValue(over.findManyResult === undefined ? [BOUNDED_POA_ROW] : over.findManyResult),
    },
  };
  const svc = new PortalService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  return { svc, prisma };
}

describe("PortalService.getClientPoas — CLIENT-P2-U03-I04 explicit projection", () => {
  it("[1] PORTAL_POA_CLIENT_SELECT tam olarak onaylı allowlist'tir", async () => {
    const { svc, prisma } = buildService();
    await svc.getClientPoas(CLIENT_ID);
    const call = prisma.clientPowerOfAttorney.findMany.mock.calls[0][0];
    expect(call.select).toEqual(PORTAL_POA_CLIENT_SELECT_SHAPE);
  });

  it("[2] getClientPoas() where/orderBy/select tam olarak onaylı şekildedir", async () => {
    const { svc, prisma } = buildService();
    await svc.getClientPoas(CLIENT_ID);
    const call = prisma.clientPowerOfAttorney.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ clientId: CLIENT_ID, isActive: true });
    expect(call.orderBy).toEqual({ dateIssued: "desc" });
    expect(call.select).toEqual(PORTAL_POA_CLIENT_SELECT_SHAPE);
  });

  it("[3] top-level include kullanılmıyor (yalnız select)", async () => {
    const { svc, prisma } = buildService();
    await svc.getClientPoas(CLIENT_ID);
    const call = prisma.clientPowerOfAttorney.findMany.mock.calls[0][0];
    expect(call.include).toBeUndefined();
  });

  it("[4] response yalnız onaylı top-level anahtarları taşır", async () => {
    const { svc } = buildService();
    const result: any = await svc.getClientPoas(CLIENT_ID);
    expect(Object.keys(result[0]).sort()).toEqual(
      [
        "id", "notaryName", "notaryCity", "journalNo", "poaNumber", "dateIssued",
        "isLimited", "validUntil", "status", "canCollect", "canWaive", "canSettle",
        "canRelease", "lawyers",
      ].sort()
    );
  });

  it("[5] nested lawyers yalnız onaylı şekli taşır (lawyer.name/surname/barNumber)", async () => {
    const { svc } = buildService();
    const result: any = await svc.getClientPoas(CLIENT_ID);
    expect(Object.keys(result[0].lawyers[0]).sort()).toEqual(["lawyer"]);
    expect(Object.keys(result[0].lawyers[0].lawyer).sort()).toEqual(["barNumber", "name", "surname"]);
  });

  it("[6] filePath response'ta YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getClientPoas(CLIENT_ID);
    expect(result[0]).not.toHaveProperty("filePath");
  });

  it("[7] fileSize response'ta YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getClientPoas(CLIENT_ID);
    expect(result[0]).not.toHaveProperty("fileSize");
  });

  it("[8] mimeType response'ta YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getClientPoas(CLIENT_ID);
    expect(result[0]).not.toHaveProperty("mimeType");
  });

  it("[9] clientId response'ta YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getClientPoas(CLIENT_ID);
    expect(result[0]).not.toHaveProperty("clientId");
  });

  it("[10] isActive response'ta YOK (WHERE'de zaten sabit true, presentation'a gerek yok)", async () => {
    const { svc } = buildService();
    const result: any = await svc.getClientPoas(CLIENT_ID);
    expect(result[0]).not.toHaveProperty("isActive");
  });

  it("[11] deprecated scope + kullanılmayan scopeType/scopeDescription/createdAt/updatedAt/poaDate response'ta YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getClientPoas(CLIENT_ID);
    for (const f of ["scope", "scopeType", "scopeDescription", "createdAt", "updatedAt", "poaDate"]) {
      expect(result[0]).not.toHaveProperty(f);
    }
  });

  it("[12] join entity ID/metadata (PoaLawyer.id/poaId/lawyerId/isPrimary/createdAt) response'ta YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getClientPoas(CLIENT_ID);
    for (const f of ["id", "poaId", "lawyerId", "isPrimary", "createdAt"]) {
      expect(result[0].lawyers[0]).not.toHaveProperty(f);
    }
  });

  it("[13] select şekli, mock'a sızdırılan beklenmedik bir alan (filePath) olsa bile SABİT kalır", async () => {
    const { svc, prisma } = buildService({
      findManyResult: [{ ...BOUNDED_POA_ROW, filePath: "/data/poa/leaked.pdf" }],
    });
    await svc.getClientPoas(CLIENT_ID);
    const call = prisma.clientPowerOfAttorney.findMany.mock.calls[0][0];
    expect(call.select).toEqual(PORTAL_POA_CLIENT_SELECT_SHAPE);
    expect(call.select).not.toHaveProperty("filePath");
  });

  it("[14] isActive:true filtresi WHERE'de DEĞİŞMEDİ", async () => {
    const { svc, prisma } = buildService();
    await svc.getClientPoas(CLIENT_ID);
    const call = prisma.clientPowerOfAttorney.findMany.mock.calls[0][0];
    expect(call.where.isActive).toBe(true);
  });

  it("[15] dateIssued desc sıralaması DEĞİŞMEDİ", async () => {
    const { svc, prisma } = buildService();
    await svc.getClientPoas(CLIENT_ID);
    const call = prisma.clientPowerOfAttorney.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ dateIssued: "desc" });
  });
});
