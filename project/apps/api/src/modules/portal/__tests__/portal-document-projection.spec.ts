/**
 * CLIENT-P2-U03-I02 — getDocuments()/uploadDocument() explicit projection (POL-D §21/BP-06 §23).
 *
 * Yapısal kanıt Prisma çağrısındaki EXACT `select` şeklinden gelir (mock'a "fazladan alan"
 * besleyip sonra "filtrelendiğini" test etmek YANLIŞTIR — gerçek Prisma zaten select'te
 * olmayanı hiç döndürmez). Testler: (a) select'in tam olarak onaylı şekilde olduğunu,
 * (b) service'in Prisma'dan gelen bounded satırı OLDUĞU GİBİ döndürdüğünü doğrular.
 *
 * getDocument()/deleteDocument()/getPendingDocuments() — internal download/delete helper ve
 * staff/admin yüzeyi — bu sabiti KULLANMAZ; bu spec onların select'siz/raw davranışının
 * DEĞİŞMEDİĞİNİ de ayrıca kanıtlar (regresyon).
 */
import { NotFoundException } from "@nestjs/common";
import { PortalService } from "../portal.service";

const CLIENT_ID = "client-1";
const TENANT_ID = "tenant-1";

const PORTAL_DOCUMENT_CLIENT_SELECT_SHAPE = {
  id: true,
  type: true,
  title: true,
  description: true,
  fileName: true,
  fileSize: true,
  mimeType: true,
  status: true,
  createdAt: true,
};

const BOUNDED_DOCUMENT_ROW = {
  id: "doc-1",
  type: "VEKALET",
  title: "Vekaletname",
  description: "Açıklama",
  fileName: "vekalet.pdf",
  fileSize: 1024,
  mimeType: "application/pdf",
  status: "PENDING",
  createdAt: new Date("2026-01-01"),
};

const RAW_DOCUMENT_ROW = {
  id: "doc-1",
  clientId: CLIENT_ID,
  tenantId: TENANT_ID,
  caseId: null,
  type: "VEKALET",
  title: "Vekaletname",
  description: "Açıklama",
  fileName: "vekalet.pdf",
  filePath: "/data/portal-documents/doc-1.pdf",
  fileSize: 1024,
  mimeType: "application/pdf",
  status: "PENDING",
  reviewedAt: null,
  reviewedBy: null,
  reviewNote: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const UPLOAD_INPUT = {
  clientId: CLIENT_ID,
  tenantId: TENANT_ID,
  caseId: "case-1",
  type: "VEKALET",
  title: "Vekaletname",
  description: "Açıklama",
  fileName: "vekalet.pdf",
  filePath: "/data/portal-documents/doc-1.pdf",
  fileSize: 1024,
  mimeType: "application/pdf",
};

function buildService(over: any = {}) {
  const prisma = {
    portalDocument: {
      findMany: jest.fn().mockResolvedValue(over.findManyResult === undefined ? [BOUNDED_DOCUMENT_ROW] : over.findManyResult),
      create: jest.fn().mockResolvedValue(over.createResult === undefined ? BOUNDED_DOCUMENT_ROW : over.createResult),
      findFirst: jest.fn().mockResolvedValue(over.findFirstResult === undefined ? RAW_DOCUMENT_ROW : over.findFirstResult),
      delete: jest.fn().mockResolvedValue(over.deleteResult === undefined ? RAW_DOCUMENT_ROW : over.deleteResult),
    },
  };
  const svc = new PortalService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  return { svc, prisma };
}

describe("PortalService.getDocuments/uploadDocument — CLIENT-P2-U03-I02 explicit projection", () => {
  it("[1] PORTAL_DOCUMENT_CLIENT_SELECT tam olarak onaylı allowlist'tir (getDocuments select üzerinden)", async () => {
    const { svc, prisma } = buildService();
    await svc.getDocuments(CLIENT_ID, TENANT_ID);
    const call = prisma.portalDocument.findMany.mock.calls[0][0];
    expect(call.select).toEqual(PORTAL_DOCUMENT_CLIENT_SELECT_SHAPE);
  });

  it("[2] getDocuments() where/orderBy/select tam olarak onaylı şekildedir", async () => {
    const { svc, prisma } = buildService();
    await svc.getDocuments(CLIENT_ID, TENANT_ID);
    const call = prisma.portalDocument.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ clientId: CLIENT_ID, tenantId: TENANT_ID });
    expect(call.orderBy).toEqual({ createdAt: "desc" });
    expect(call.select).toEqual(PORTAL_DOCUMENT_CLIENT_SELECT_SHAPE);
  });

  it("[3] getDocuments() client response'u yalnız onaylı anahtarları taşır", async () => {
    const { svc } = buildService();
    const result: any = await svc.getDocuments(CLIENT_ID, TENANT_ID);
    expect(Object.keys(result[0]).sort()).toEqual(
      ["id", "type", "title", "description", "fileName", "fileSize", "mimeType", "status", "createdAt"].sort()
    );
  });

  it("[4] uploadDocument() create data'sı mevcut write-contract'ı korur (DEĞİŞMEDİ)", async () => {
    const { svc, prisma } = buildService();
    await svc.uploadDocument(UPLOAD_INPUT);
    const call = prisma.portalDocument.create.mock.calls[0][0];
    expect(call.data).toEqual({
      clientId: UPLOAD_INPUT.clientId,
      tenantId: UPLOAD_INPUT.tenantId,
      caseId: UPLOAD_INPUT.caseId,
      type: UPLOAD_INPUT.type,
      title: UPLOAD_INPUT.title,
      description: UPLOAD_INPUT.description,
      fileName: UPLOAD_INPUT.fileName,
      filePath: UPLOAD_INPUT.filePath,
      fileSize: UPLOAD_INPUT.fileSize,
      mimeType: UPLOAD_INPUT.mimeType,
    });
  });

  it("[5] uploadDocument() create çağrısı select: PORTAL_DOCUMENT_CLIENT_SELECT kullanır", async () => {
    const { svc, prisma } = buildService();
    await svc.uploadDocument(UPLOAD_INPUT);
    const call = prisma.portalDocument.create.mock.calls[0][0];
    expect(call.select).toEqual(PORTAL_DOCUMENT_CLIENT_SELECT_SHAPE);
  });

  it("[6] upload response'u yalnız onaylı anahtarları taşır", async () => {
    const { svc } = buildService();
    const result: any = await svc.uploadDocument(UPLOAD_INPUT);
    expect(Object.keys(result).sort()).toEqual(
      ["id", "type", "title", "description", "fileName", "fileSize", "mimeType", "status", "createdAt"].sort()
    );
  });

  it("[7] filePath list response'ta YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getDocuments(CLIENT_ID, TENANT_ID);
    expect(result[0]).not.toHaveProperty("filePath");
  });

  it("[8] filePath upload response'ta YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.uploadDocument(UPLOAD_INPUT);
    expect(result).not.toHaveProperty("filePath");
  });

  it("[9] reviewedBy ne list ne upload response'ta VAR", async () => {
    const { svc } = buildService();
    const list: any = await svc.getDocuments(CLIENT_ID, TENANT_ID);
    const upload: any = await svc.uploadDocument(UPLOAD_INPUT);
    expect(list[0]).not.toHaveProperty("reviewedBy");
    expect(upload).not.toHaveProperty("reviewedBy");
  });

  it("[10] reviewedAt ne list ne upload response'ta VAR", async () => {
    const { svc } = buildService();
    const list: any = await svc.getDocuments(CLIENT_ID, TENANT_ID);
    const upload: any = await svc.uploadDocument(UPLOAD_INPUT);
    expect(list[0]).not.toHaveProperty("reviewedAt");
    expect(upload).not.toHaveProperty("reviewedAt");
  });

  it("[11] reviewNote ne list ne upload response'ta VAR", async () => {
    const { svc } = buildService();
    const list: any = await svc.getDocuments(CLIENT_ID, TENANT_ID);
    const upload: any = await svc.uploadDocument(UPLOAD_INPUT);
    expect(list[0]).not.toHaveProperty("reviewNote");
    expect(upload).not.toHaveProperty("reviewNote");
  });

  it("[12] clientId/tenantId ne list ne upload response'ta VAR", async () => {
    const { svc } = buildService();
    const list: any = await svc.getDocuments(CLIENT_ID, TENANT_ID);
    const upload: any = await svc.uploadDocument(UPLOAD_INPUT);
    for (const f of ["clientId", "tenantId"]) {
      expect(list[0]).not.toHaveProperty(f);
      expect(upload).not.toHaveProperty(f);
    }
  });

  it("[13] updatedAt ne list ne upload response'ta VAR", async () => {
    const { svc } = buildService();
    const list: any = await svc.getDocuments(CLIENT_ID, TENANT_ID);
    const upload: any = await svc.uploadDocument(UPLOAD_INPUT);
    expect(list[0]).not.toHaveProperty("updatedAt");
    expect(upload).not.toHaveProperty("updatedAt");
  });

  it("[14] select şekli, mock'a sızdırılan beklenmedik bir alan (caseId) olsa bile SABİT kalır", async () => {
    const { svc, prisma } = buildService({
      findManyResult: [{ ...BOUNDED_DOCUMENT_ROW, caseId: "leaked-case-id" }],
    });
    const result: any = await svc.getDocuments(CLIENT_ID, TENANT_ID);
    const call = prisma.portalDocument.findMany.mock.calls[0][0];
    expect(call.select).toEqual(PORTAL_DOCUMENT_CLIENT_SELECT_SHAPE);
    expect(call.select).not.toHaveProperty("caseId");
    // Not: gerçek Prisma select'te olmayanı hiç döndürmez; bu satır yalnız select'in
    // mock'un döndürdüğü veriye göre GENİŞLEMEDİĞİNİ (sabit kaldığını) kanıtlar.
    void result;
  });

  it("[15] getDocument() (download helper) select'siz/raw davranışı DEĞİŞMEDİ", async () => {
    const { svc, prisma } = buildService();
    const result: any = await svc.getDocument("doc-1", CLIENT_ID);
    const call = prisma.portalDocument.findFirst.mock.calls[0][0];
    expect(call).toEqual({ where: { id: "doc-1", clientId: CLIENT_ID } });
    expect(call.select).toBeUndefined();
    expect(result.filePath).toBe(RAW_DOCUMENT_ROW.filePath);
    expect(result.fileName).toBe(RAW_DOCUMENT_ROW.fileName);
  });

  it("[16] deleteDocument() internal filePath dönüşü (controller'a) DEĞİŞMEDİ", async () => {
    const { svc, prisma } = buildService();
    const result = await svc.deleteDocument("doc-1", CLIENT_ID);
    const findCall = prisma.portalDocument.findFirst.mock.calls[0][0];
    expect(findCall).toEqual({ where: { id: "doc-1", clientId: CLIENT_ID } });
    expect(findCall.select).toBeUndefined();
    expect(result).toEqual({ success: true, filePath: RAW_DOCUMENT_ROW.filePath });
  });

  it("[17] getPendingDocuments() (staff/admin) select'siz/raw davranışı DEĞİŞMEDİ", async () => {
    const { svc, prisma } = buildService();
    const result = await svc.getPendingDocuments(TENANT_ID);
    const call = prisma.portalDocument.findMany.mock.calls[0][0];
    expect(call).toEqual({
      where: { tenantId: TENANT_ID, status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
    expect(call.select).toBeUndefined();
    expect(result).toEqual([BOUNDED_DOCUMENT_ROW]);
  });

  it("getDocument() belge bulunamazsa NotFoundException fırlatır (regresyon)", async () => {
    const { svc } = buildService({ findFirstResult: null });
    await expect(svc.getDocument("missing", CLIENT_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});
