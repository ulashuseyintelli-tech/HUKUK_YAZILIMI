/**
 * CLIENT-K1 (İ16 K-1, owner kararı 2026-09-19 (a)) — portal `caseId` referans doğrulaması.
 *
 * Üç uç: müvekkil belge yükleme · müvekkil mesajı · büro → müvekkil mesajı. Dört senaryo her uçta:
 * yabancı tenant dosyası · aynı tenant başka müvekkilin dosyası · bulunmayan dosya → AYNI 400 (varlık sızmaz) ve
 * HİÇBİR satır yazılmaz; geçerli ilişki → satır dosya id'siyle yazılır. Aktör kapsamı ayrı: müvekkil yalnız
 * kendisine GÖRÜNÜR (`showToClient`) ve bağlı dosyayı işaretleyebilir; personel hedef müvekkile bağlı tenant
 * dosyasını işaretleyebilir (görünürlük şartı eklenmez — mevcut personel kapsamı korunur).
 *
 * Mock Prisma `case.findFirst`, verilen `where` yüklemini küçük bir bellek içi veri kümesine UYGULAR; böylece test
 * yüklemin yalnız şeklini değil ANLAMINI da ölçer (tenant, müvekkil ilişkisi, görünürlük).
 */
import { BadRequestException } from "@nestjs/common";
import { mkdtempSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PortalService, PORTAL_CASE_REFERENCE_INVALID } from "../portal.service";
import { PortalController } from "../portal.controller";

const T = "tenant-A"; const T2 = "tenant-B";
const C = "client-1"; const C_OTHER = "client-2"; const C_FRN = "client-frn";
const CASES = [
  { id: "case-own-visible", tenantId: T, showToClient: true, clientId: null, links: [C] },
  { id: "case-own-direct", tenantId: T, showToClient: true, clientId: C, links: [] },
  { id: "case-own-hidden", tenantId: T, showToClient: false, clientId: null, links: [C] },
  { id: "case-other-client", tenantId: T, showToClient: true, clientId: null, links: [C_OTHER] },
  { id: "case-foreign-tenant", tenantId: T2, showToClient: true, clientId: null, links: [C_FRN, C] },
];

function applyWhere(where: any) {
  return CASES.find((k) => {
    if (where.id !== k.id || where.tenantId !== k.tenantId) return false;
    if (where.showToClient !== undefined && where.showToClient !== k.showToClient) return false;
    return (where.OR as any[]).some((o) => (o.clientId !== undefined ? o.clientId === k.clientId : k.links.includes(o.caseClients.some.clientId)));
  });
}

function build() {
  const prisma: any = {
    case: { findFirst: jest.fn(async ({ where }: any) => { const k = applyWhere(where); return k ? { id: k.id } : null; }) },
    portalDocument: { create: jest.fn(async ({ data }: any) => ({ id: "doc-1", ...data })) },
    portalMessage: { create: jest.fn(async ({ data }: any) => ({ id: "msg-1", ...data })) },
    portalNotification: { create: jest.fn(async ({ data }: any) => ({ id: "n-1", ...data })) },
    client: { findFirst: jest.fn(async ({ where }: any) => (where.id === C && where.tenantId === T ? { id: C, tenantId: T } : null)) },
  };
  const service = new PortalService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any);
  return { service, prisma };
}

const upload = (s: PortalService, caseId?: any) => s.uploadDocument({ clientId: C, tenantId: T, caseId, type: "DIGER", title: "t",
  fileName: "f.pdf", filePath: "/x/f.pdf", fileSize: 1, mimeType: "application/pdf" });
const clientMsg = (s: PortalService, caseId?: any) => s.sendMessageFromClient(C, T, "m", "Müvekkil", caseId);
const officeMsg = (s: PortalService, caseId?: any) => s.sendMessageFromOffice(C, T, "m", "user-1", "Büro", caseId);

const ENDPOINTS: Array<[string, (s: PortalService, c?: any) => Promise<any>, string]> = [
  ["müvekkil belge yükleme", upload, "portalDocument"],
  ["müvekkil mesajı", clientMsg, "portalMessage"],
  ["büro mesajı", officeMsg, "portalMessage"],
];

describe("CLIENT-K1 — portal caseId referansı aktör kapsamında doğrulanır", () => {
  describe.each(ENDPOINTS)("%s", (_name, call, model) => {
    it.each([
      ["yabancı tenant dosyası", "case-foreign-tenant"],
      ["aynı tenant başka müvekkilin dosyası", "case-other-client"],
      ["bulunmayan dosya", "case-does-not-exist"],
      ["biçimsiz id (string değil)", 12345],
    ])("%s → AYNI 400 mesajı + HİÇBİR satır yazılmaz", async (_label, caseId) => {
      const { service, prisma } = build();
      const err = await call(service, caseId).catch((e: any) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toBe(PORTAL_CASE_REFERENCE_INVALID);
      expect(prisma[model].create).not.toHaveBeenCalled();
      expect(prisma.portalNotification.create).not.toHaveBeenCalled();
    });

    it.each([["CaseClient ilişkisiyle", "case-own-visible"], ["Case.clientId ilişkisiyle", "case-own-direct"]])(
      "geçerli ilişki (%s) → satır dosya id'siyle yazılır", async (_l, caseId) => {
        const { service, prisma } = build();
        await call(service, caseId);
        expect(prisma[model].create).toHaveBeenCalledTimes(1);
        expect(prisma[model].create.mock.calls[0][0].data.caseId).toBe(caseId);
      });

    it.each([[undefined], [null], [""]])("caseId verilmemiş (%p) → davranış değişmez, dosya sorgusu YOK", async (caseId) => {
      const { service, prisma } = build();
      await call(service, caseId);
      expect(prisma.case.findFirst).not.toHaveBeenCalled();
      expect(prisma[model].create.mock.calls[0][0].data.caseId).toBeUndefined();
    });

    it("yüklem tenant'ı ve müvekkil ilişkisini AÇIKÇA içerir", async () => {
      const { service, prisma } = build();
      await call(service, "case-own-visible");
      const where = prisma.case.findFirst.mock.calls[0][0].where;
      expect(where.tenantId).toBe(T);
      expect(where.OR).toEqual([{ clientId: C }, { caseClients: { some: { clientId: C } } }]);
    });
  });

  it("aktör ayrımı: müvekkil GİZLİ dosyayı işaretleyemez (showToClient şartı) — 400", async () => {
    for (const call of [upload, clientMsg]) {
      const { service } = build();
      await expect(call(service, "case-own-hidden")).rejects.toThrow(PORTAL_CASE_REFERENCE_INVALID);
    }
  });

  it("aktör ayrımı: personel, müvekkile bağlı GİZLİ dosyayı işaretleyebilir (personel kapsamı korunur) + bildirim aynı id", async () => {
    const { service, prisma } = build();
    await officeMsg(service, "case-own-hidden");
    expect(prisma.case.findFirst.mock.calls[0][0].where.showToClient).toBeUndefined();
    expect(prisma.portalMessage.create.mock.calls[0][0].data.caseId).toBe("case-own-hidden");
    expect(prisma.portalNotification.create.mock.calls[0][0].data.caseId).toBe("case-own-hidden");
  });

  it("büro mesajı: müvekkil başka tenant'taysa mevcut 404 korunur ve dosya sorgusu yapılmaz", async () => {
    const { service, prisma } = build();
    await expect(service.sendMessageFromOffice(C_FRN, T, "m", "u", "B", "case-own-visible")).rejects.toThrow("Müvekkil bulunamadı");
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
  });

  it("controller: reddedilen yüklemede multer'ın yazdığı dosya diskten SİLİNİR ve hata aynen döner", async () => {
    const dir = mkdtempSync(join(tmpdir(), "k1-"));
    const p = join(dir, "portal-1.pdf"); writeFileSync(p, "x");
    const portalService: any = { uploadDocument: jest.fn().mockRejectedValue(new BadRequestException(PORTAL_CASE_REFERENCE_INVALID)) };
    const controller = new PortalController(portalService, {} as any);
    const req: any = { portalUser: { clientId: C, tenantId: T } };
    const file: any = { path: p, originalname: "a.pdf", size: 1, mimetype: "application/pdf" };
    await expect(controller.uploadDocument(req, file, { type: "DIGER", title: "t", caseId: "case-foreign-tenant" })).rejects.toThrow(PORTAL_CASE_REFERENCE_INVALID);
    expect(existsSync(p)).toBe(false);
  });

  it("controller: başarılı yüklemede dosya KORUNUR", async () => {
    const dir = mkdtempSync(join(tmpdir(), "k1-"));
    const p = join(dir, "portal-2.pdf"); writeFileSync(p, "x");
    const portalService: any = { uploadDocument: jest.fn().mockResolvedValue({ id: "doc-1" }) };
    const controller = new PortalController(portalService, {} as any);
    await controller.uploadDocument({ portalUser: { clientId: C, tenantId: T } } as any, { path: p, originalname: "a.pdf", size: 1, mimetype: "application/pdf" } as any, { type: "DIGER", title: "t" });
    expect(existsSync(p)).toBe(true);
  });
});
