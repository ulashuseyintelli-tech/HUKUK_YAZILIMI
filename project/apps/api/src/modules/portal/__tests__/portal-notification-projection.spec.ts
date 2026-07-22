/**
 * CLIENT-P2-U03-I05 — getNotifications() explicit projection (POL-D §21/BP-06 §23).
 *
 * Yapısal kanıt Prisma çağrısındaki EXACT `select` şeklinden gelir (mock'a "fazladan alan"
 * besleyip sonra "filtrelendiğini" test etmek YANLIŞTIR — gerçek Prisma zaten select'te
 * olmayanı hiç döndürmez). Testler: (a) select'in tam olarak onaylı şekilde olduğunu,
 * (b) service'in Prisma'dan gelen bounded satırı OLDUĞU GİBİ döndürdüğünü doğrular.
 *
 * getUnreadCount()/markAsRead()/markAllAsRead()/createNotification() bu sabiti KULLANMAZ;
 * bu spec onların select'siz/raw davranışının DEĞİŞMEDİĞİNİ de ayrıca kanıtlar (regresyon).
 */
import { NotFoundException } from "@nestjs/common";
import { PortalService } from "../portal.service";

const CLIENT_ID = "client-1";

const PORTAL_NOTIFICATION_CLIENT_SELECT_SHAPE = {
  id: true,
  type: true,
  title: true,
  message: true,
  linkUrl: true,
  isRead: true,
  createdAt: true,
};

const BOUNDED_NOTIFICATION_ROW = {
  id: "notif-1",
  type: "MESAJ",
  title: "Yeni Mesaj",
  message: "Av. Test size bir mesaj gönderdi.",
  linkUrl: "/portal/messages",
  isRead: false,
  createdAt: new Date("2026-01-01"),
};

const RAW_NOTIFICATION_ROW = {
  id: "notif-1",
  clientId: CLIENT_ID,
  caseId: "case-1",
  type: "MESAJ",
  title: "Yeni Mesaj",
  message: "Av. Test size bir mesaj gönderdi.",
  isRead: false,
  readAt: null,
  linkUrl: "/portal/messages",
  createdAt: new Date("2026-01-01"),
};

function buildService(over: any = {}) {
  const prisma = {
    portalNotification: {
      findMany: jest.fn().mockResolvedValue(over.findManyResult === undefined ? [BOUNDED_NOTIFICATION_ROW] : over.findManyResult),
      count: jest.fn().mockResolvedValue(over.countResult === undefined ? 0 : over.countResult),
      findFirst: jest.fn().mockResolvedValue(over.findFirstResult === undefined ? RAW_NOTIFICATION_ROW : over.findFirstResult),
      update: jest.fn().mockResolvedValue(over.updateResult === undefined ? RAW_NOTIFICATION_ROW : over.updateResult),
      updateMany: jest.fn().mockResolvedValue(over.updateManyResult === undefined ? { count: 0 } : over.updateManyResult),
      create: jest.fn().mockResolvedValue(over.createResult === undefined ? RAW_NOTIFICATION_ROW : over.createResult),
    },
  };
  const svc = new PortalService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  return { svc, prisma };
}

describe("PortalService.getNotifications — CLIENT-P2-U03-I05 explicit projection", () => {
  it("[1] PORTAL_NOTIFICATION_CLIENT_SELECT tam olarak onaylı allowlist'tir", async () => {
    const { svc, prisma } = buildService();
    await svc.getNotifications(CLIENT_ID);
    const call = prisma.portalNotification.findMany.mock.calls[0][0];
    expect(call.select).toEqual(PORTAL_NOTIFICATION_CLIENT_SELECT_SHAPE);
  });

  it("[2] getNotifications() where/orderBy/take/select tam olarak onaylı şekildedir", async () => {
    const { svc, prisma } = buildService();
    await svc.getNotifications(CLIENT_ID, 10);
    const call = prisma.portalNotification.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ clientId: CLIENT_ID });
    expect(call.orderBy).toEqual({ createdAt: "desc" });
    expect(call.take).toBe(10);
    expect(call.select).toEqual(PORTAL_NOTIFICATION_CLIENT_SELECT_SHAPE);
  });

  it("[3] response yalnız onaylı anahtarları taşır", async () => {
    const { svc } = buildService();
    const result: any = await svc.getNotifications(CLIENT_ID);
    expect(Object.keys(result[0]).sort()).toEqual(
      ["id", "type", "title", "message", "linkUrl", "isRead", "createdAt"].sort()
    );
  });

  it("[4] clientId response'ta YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getNotifications(CLIENT_ID);
    expect(result[0]).not.toHaveProperty("clientId");
  });

  it("[5] caseId response'ta YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getNotifications(CLIENT_ID);
    expect(result[0]).not.toHaveProperty("caseId");
  });

  it("[6] readAt response'ta YOK", async () => {
    const { svc } = buildService();
    const result: any = await svc.getNotifications(CLIENT_ID);
    expect(result[0]).not.toHaveProperty("readAt");
  });

  it("[7] select şekli, mock'a sızdırılan beklenmedik bir alan (clientId) olsa bile SABİT kalır", async () => {
    const { svc, prisma } = buildService({
      findManyResult: [{ ...BOUNDED_NOTIFICATION_ROW, clientId: "leaked-client-id" }],
    });
    await svc.getNotifications(CLIENT_ID);
    const call = prisma.portalNotification.findMany.mock.calls[0][0];
    expect(call.select).toEqual(PORTAL_NOTIFICATION_CLIENT_SELECT_SHAPE);
    expect(call.select).not.toHaveProperty("clientId");
  });

  it("[8] default limit 20 olarak DEĞİŞMEDİ", async () => {
    const { svc, prisma } = buildService();
    await svc.getNotifications(CLIENT_ID);
    const call = prisma.portalNotification.findMany.mock.calls[0][0];
    expect(call.take).toBe(20);
  });

  it("[9] getUnreadCount() select'siz/raw davranışı DEĞİŞMEDİ", async () => {
    const { svc, prisma } = buildService({ countResult: 5 });
    const result = await svc.getUnreadCount(CLIENT_ID);
    const call = prisma.portalNotification.count.mock.calls[0][0];
    expect(call).toEqual({ where: { clientId: CLIENT_ID, isRead: false } });
    expect(result).toEqual({ count: 5 });
  });

  it("[10] markAsRead() select'siz/raw davranışı DEĞİŞMEDİ", async () => {
    const { svc, prisma } = buildService();
    const result = await svc.markAsRead("notif-1", CLIENT_ID);
    const findCall = prisma.portalNotification.findFirst.mock.calls[0][0];
    expect(findCall).toEqual({ where: { id: "notif-1", clientId: CLIENT_ID } });
    expect(findCall.select).toBeUndefined();
    const updateCall = prisma.portalNotification.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: "notif-1" });
    expect(updateCall.data).toEqual(expect.objectContaining({ isRead: true }));
    expect(updateCall.select).toBeUndefined();
    expect(result).toEqual({ success: true });
  });

  it("[11] markAsRead() bildirim bulunamazsa NotFoundException fırlatır (regresyon)", async () => {
    const { svc } = buildService({ findFirstResult: null });
    await expect(svc.markAsRead("missing", CLIENT_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("[12] markAllAsRead() select'siz/raw davranışı DEĞİŞMEDİ", async () => {
    const { svc, prisma } = buildService();
    const result = await svc.markAllAsRead(CLIENT_ID);
    const call = prisma.portalNotification.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ clientId: CLIENT_ID, isRead: false });
    expect(call.data).toEqual(expect.objectContaining({ isRead: true }));
    expect(call.select).toBeUndefined();
    expect(result).toEqual({ success: true });
  });

  it("[13] createNotification() write-contract'ı ve select'siz raw davranışı DEĞİŞMEDİ", async () => {
    const { svc, prisma } = buildService();
    await svc.createNotification({
      clientId: CLIENT_ID,
      caseId: "case-1",
      type: "MESAJ",
      title: "Yeni Mesaj",
      message: "test",
      linkUrl: "/portal/messages",
    });
    const call = prisma.portalNotification.create.mock.calls[0][0];
    expect(call.data).toEqual({
      clientId: CLIENT_ID,
      caseId: "case-1",
      type: "MESAJ",
      title: "Yeni Mesaj",
      message: "test",
      linkUrl: "/portal/messages",
    });
    expect(call.select).toBeUndefined();
  });
});
