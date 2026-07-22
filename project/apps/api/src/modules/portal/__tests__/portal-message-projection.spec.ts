/**
 * CLIENT-P2-U03-I03 — getMessages()/sendMessageFromClient() explicit projection (POL-D §21/BP-06 §23).
 *
 * Yapısal kanıt Prisma çağrısındaki EXACT `select` şeklinden gelir (mock'a "fazladan alan"
 * besleyip sonra "filtrelendiğini" test etmek YANLIŞTIR — gerçek Prisma zaten select'te
 * olmayanı hiç döndürmez). Testler: (a) select'in tam olarak onaylı şekilde olduğunu,
 * (b) service'in Prisma'dan gelen bounded satırı OLDUĞU GİBİ döndürdüğünü doğrular.
 *
 * sendMessageFromOffice()/getClientMessages()/getUnreadMessageCount()/markMessagesAsRead()/
 * getClientsWithMessages() — staff-facing yüzey — bu sabiti KULLANMAZ; bu spec onların
 * select'siz/raw davranışının DEĞİŞMEDİĞİNİ de ayrıca kanıtlar (regresyon).
 */
import { PortalService } from "../portal.service";

const CLIENT_ID = "client-1";
const TENANT_ID = "tenant-1";

const PORTAL_MESSAGE_CLIENT_SELECT_SHAPE = {
  id: true,
  content: true,
  senderType: true,
  senderName: true,
  isRead: true,
  createdAt: true,
};

const BOUNDED_MESSAGE_ROW = {
  id: "msg-1",
  content: "Merhaba, dosyam hakkında bilgi alabilir miyim?",
  senderType: "CLIENT",
  senderName: "Müvekkil",
  isRead: false,
  createdAt: new Date("2026-01-01"),
};

const RAW_MESSAGE_ROW = {
  id: "msg-1",
  clientId: CLIENT_ID,
  tenantId: TENANT_ID,
  caseId: null,
  content: "Merhaba, dosyam hakkında bilgi alabilir miyim?",
  senderType: "CLIENT",
  senderId: CLIENT_ID,
  senderName: "Müvekkil",
  isRead: false,
  readAt: null,
  createdAt: new Date("2026-01-01"),
};

function buildService(over: any = {}) {
  const prisma = {
    portalMessage: {
      findMany: jest.fn().mockResolvedValue(over.findManyResult === undefined ? [BOUNDED_MESSAGE_ROW] : over.findManyResult),
      create: jest.fn().mockResolvedValue(over.createResult === undefined ? BOUNDED_MESSAGE_ROW : over.createResult),
      count: jest.fn().mockResolvedValue(over.countResult === undefined ? 0 : over.countResult),
      updateMany: jest.fn().mockResolvedValue(over.updateManyResult === undefined ? { count: 0 } : over.updateManyResult),
    },
    client: {
      findFirst: jest.fn().mockResolvedValue(over.clientFindFirstResult === undefined ? { id: CLIENT_ID, tenantId: TENANT_ID } : over.clientFindFirstResult),
    },
    portalNotification: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const svc = new PortalService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  return { svc, prisma };
}

describe("PortalService.getMessages/sendMessageFromClient — CLIENT-P2-U03-I03 explicit projection", () => {
  it("[1] PORTAL_MESSAGE_CLIENT_SELECT tam olarak onaylı allowlist'tir (getMessages select üzerinden)", async () => {
    const { svc, prisma } = buildService();
    await svc.getMessages(CLIENT_ID, TENANT_ID);
    const call = prisma.portalMessage.findMany.mock.calls[0][0];
    expect(call.select).toEqual(PORTAL_MESSAGE_CLIENT_SELECT_SHAPE);
  });

  it("[2] getMessages() where/orderBy/take/select tam olarak onaylı şekildedir", async () => {
    const { svc, prisma } = buildService();
    await svc.getMessages(CLIENT_ID, TENANT_ID, 25);
    const call = prisma.portalMessage.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ clientId: CLIENT_ID, tenantId: TENANT_ID });
    expect(call.orderBy).toEqual({ createdAt: "asc" });
    expect(call.take).toBe(25);
    expect(call.select).toEqual(PORTAL_MESSAGE_CLIENT_SELECT_SHAPE);
  });

  it("[3] getMessages() client response'u yalnız onaylı anahtarları taşır", async () => {
    const { svc } = buildService();
    const result: any = await svc.getMessages(CLIENT_ID, TENANT_ID);
    expect(Object.keys(result[0]).sort()).toEqual(
      ["id", "content", "senderType", "senderName", "isRead", "createdAt"].sort()
    );
  });

  it("[4] senderId list response'ta YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getMessages(CLIENT_ID, TENANT_ID);
    expect(result[0]).not.toHaveProperty("senderId");
  });

  it("[5] clientId list response'ta YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getMessages(CLIENT_ID, TENANT_ID);
    expect(result[0]).not.toHaveProperty("clientId");
  });

  it("[6] tenantId list response'ta YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getMessages(CLIENT_ID, TENANT_ID);
    expect(result[0]).not.toHaveProperty("tenantId");
  });

  it("[7] caseId list response'ta YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getMessages(CLIENT_ID, TENANT_ID);
    expect(result[0]).not.toHaveProperty("caseId");
  });

  it("[8] readAt list response'ta YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getMessages(CLIENT_ID, TENANT_ID);
    expect(result[0]).not.toHaveProperty("readAt");
  });

  it("[9] select şekli, mock'a sızdırılan beklenmedik bir alan (senderId) olsa bile SABİT kalır", async () => {
    const { svc, prisma } = buildService({
      findManyResult: [{ ...BOUNDED_MESSAGE_ROW, senderId: "leaked-sender-id" }],
    });
    await svc.getMessages(CLIENT_ID, TENANT_ID);
    const call = prisma.portalMessage.findMany.mock.calls[0][0];
    expect(call.select).toEqual(PORTAL_MESSAGE_CLIENT_SELECT_SHAPE);
    expect(call.select).not.toHaveProperty("senderId");
  });

  it("[10] sendMessageFromClient() create data'sı mevcut write-contract'ı korur (DEĞİŞMEDİ)", async () => {
    const { svc, prisma } = buildService();
    await svc.sendMessageFromClient(CLIENT_ID, TENANT_ID, "Merhaba", "Müvekkil", "case-1");
    const call = prisma.portalMessage.create.mock.calls[0][0];
    expect(call.data).toEqual({
      clientId: CLIENT_ID,
      tenantId: TENANT_ID,
      caseId: "case-1",
      content: "Merhaba",
      senderType: "CLIENT",
      senderId: CLIENT_ID,
      senderName: "Müvekkil",
    });
  });

  it("[11] sendMessageFromClient() create çağrısı select: PORTAL_MESSAGE_CLIENT_SELECT kullanır", async () => {
    const { svc, prisma } = buildService();
    await svc.sendMessageFromClient(CLIENT_ID, TENANT_ID, "Merhaba", "Müvekkil");
    const call = prisma.portalMessage.create.mock.calls[0][0];
    expect(call.select).toEqual(PORTAL_MESSAGE_CLIENT_SELECT_SHAPE);
  });

  it("[12] send response'u yalnız onaylı anahtarları taşır", async () => {
    const { svc } = buildService();
    const result: any = await svc.sendMessageFromClient(CLIENT_ID, TENANT_ID, "Merhaba", "Müvekkil");
    expect(Object.keys(result).sort()).toEqual(
      ["id", "content", "senderType", "senderName", "isRead", "createdAt"].sort()
    );
  });

  it("[13] senderId send response'ta YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.sendMessageFromClient(CLIENT_ID, TENANT_ID, "Merhaba", "Müvekkil");
    expect(result).not.toHaveProperty("senderId");
  });

  it("[14] getMessages() tenant/client filtreleri DEĞİŞMEDİ", async () => {
    const { svc, prisma } = buildService();
    await svc.getMessages("other-client", "other-tenant");
    const call = prisma.portalMessage.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ clientId: "other-client", tenantId: "other-tenant" });
  });

  it("[15] default limit 50 olarak DEĞİŞMEDİ", async () => {
    const { svc, prisma } = buildService();
    await svc.getMessages(CLIENT_ID, TENANT_ID);
    const call = prisma.portalMessage.findMany.mock.calls[0][0];
    expect(call.take).toBe(50);
  });

  it("[16] sendMessageFromOffice() select'siz/raw davranışı DEĞİŞMEDİ", async () => {
    const { svc, prisma } = buildService({ createResult: { ...RAW_MESSAGE_ROW, senderType: "OFFICE", senderId: "user-1" } });
    const result: any = await svc.sendMessageFromOffice(CLIENT_ID, TENANT_ID, "Merhaba", "user-1", "Av. Test");
    const clientCall = prisma.client.findFirst.mock.calls[0][0];
    expect(clientCall).toEqual({ where: { id: CLIENT_ID, tenantId: TENANT_ID } });
    const createCall = prisma.portalMessage.create.mock.calls[0][0];
    expect(createCall.select).toBeUndefined();
    expect(createCall.data).toEqual({
      clientId: CLIENT_ID,
      tenantId: TENANT_ID,
      caseId: undefined,
      content: "Merhaba",
      senderType: "OFFICE",
      senderId: "user-1",
      senderName: "Av. Test",
    });
    expect(result.senderId).toBe("user-1");
    expect(prisma.portalNotification.create).toHaveBeenCalled();
  });

  it("[17] getClientMessages() (staff) select'siz/raw davranışı DEĞİŞMEDİ", async () => {
    const { svc, prisma } = buildService({ findManyResult: [RAW_MESSAGE_ROW] });
    const result: any = await svc.getClientMessages(CLIENT_ID, TENANT_ID);
    const call = prisma.portalMessage.findMany.mock.calls[0][0];
    expect(call.select).toBeUndefined();
    expect(result.messages[0]).toHaveProperty("senderId");
    expect(result.messages[0]).toHaveProperty("clientId");
  });

  it("[18] getUnreadMessageCount() davranışı DEĞİŞMEDİ", async () => {
    const { svc, prisma } = buildService({ countResult: 3 });
    const result = await svc.getUnreadMessageCount(CLIENT_ID, TENANT_ID);
    const call = prisma.portalMessage.count.mock.calls[0][0];
    expect(call).toEqual({ where: { clientId: CLIENT_ID, tenantId: TENANT_ID, senderType: "OFFICE", isRead: false } });
    expect(result).toEqual({ count: 3 });
  });

  it("[19] markMessagesAsRead() davranışı DEĞİŞMEDİ", async () => {
    const { svc, prisma } = buildService();
    const result = await svc.markMessagesAsRead(CLIENT_ID, TENANT_ID);
    const call = prisma.portalMessage.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ clientId: CLIENT_ID, tenantId: TENANT_ID, senderType: "OFFICE", isRead: false });
    expect(call.data).toEqual(expect.objectContaining({ isRead: true }));
    expect(result).toEqual({ success: true });
  });
});
