// ClientService içe aktarma grafiği pdf-poppler'a uzanabilir; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { ClientService, contactTaskDedupeKey } from "../client.service";

/**
 * F03-A2 (OFP-03a; R01 §8 "otomatik görev yeniden doğuşu") — müvekkil eksik-bilgi görevinin YENİDEN DOĞUŞU, gerçek PostgreSQL.
 *
 * Birim testi (`contact-followup.spec.ts`) çağrıların biçimini sahte veritabanıyla sınar; bu takım aynı ürün kodunu
 * (`ClientService.syncContactFollowUpTask`) gerçek veritabanına karşı çalıştırır:
 *  1. Sistem satırı tablo kısıtlarından geçer (aktör kullanıcı yok, yetki kaynağı SYSTEM_PRODUCER) ve önceki kapanış atfını saklar.
 *  2. Görev güncellemesi ile geçmiş satırları TEK işlemdedir: geçmiş yazılamazsa görev de yeniden açılmaz.
 *  3. Açık görevde eksik listesi güncellemesi geçmiş satırı üretmez (yeniden doğuş değildir).
 * Ürün kodu taklit edilmez; servis yöntemi yalnız veritabanı istemcisiyle çağrılır (yöntem başka bağımlılık kullanmaz).
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Contact follow-up history spec requires TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

type FollowUpClient = { id: string; phone?: string | null; email?: string | null; contactFollowUpStatus?: string | null };
type SyncHost = { prisma: unknown };
const syncContactFollowUpTask = (ClientService.prototype as unknown as {
  syncContactFollowUpTask(this: SyncHost, tenantId: string, client: FollowUpClient): Promise<void>;
}).syncContactFollowUpTask;

describeDb("F03-A2 — müvekkil eksik-bilgi görevinin yeniden doğuşu görev geçmişine yazılır (gerçek PostgreSQL)", () => {
  jest.setTimeout(180_000);
  const suffix = randomUUID().slice(0, 8);
  const tenantId = `test-f03a2-dogus-${suffix}`;
  let db: PrismaClient;
  let closerId = "";
  let clientSeq = 0;

  const sync = (client: FollowUpClient, host: SyncHost = { prisma: db }) => syncContactFollowUpTask.call(host, tenantId, client);
  const taskOf = (clientId: string) => db.task.findUniqueOrThrow({ where: { dedupeKey: contactTaskDedupeKey(clientId) } });
  const historyOf = (taskId: string) => db.taskHistoryEvent.findMany({ where: { taskId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  /** Eksik iletişim bilgili sentetik müvekkil + açık eksik-bilgi görevi. */
  const clientWithOpenTask = async () => {
    const client = await db.client.create({ data: { tenantId, displayName: `F03A2 Sentetik Müvekkil ${suffix}-${++clientSeq}`, type: "COMPANY" } });
    await sync({ id: client.id, phone: null, email: null, contactFollowUpStatus: null });
    const task = await taskOf(client.id);
    expect([task.status, task.taskCategory, task.clientId]).toEqual(["PENDING", "OPERATIONAL_COMPLETENESS", client.id]);
    return { clientId: client.id, taskId: task.id };
  };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    await db.tenant.create({ data: { id: tenantId, name: tenantId, slug: tenantId } });
    closerId = (await db.user.create({ data: { tenantId, email: `f03a2-dogus-${suffix}@example.test`, name: "kapatan", surname: "F03A2", role: "USER" } })).id;
  });

  afterAll(async () => {
    await db.taskHistoryEvent.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await db.task.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await db.client.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await db.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await db.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await db.$disconnect();
  });

  it("tamamlanmış görev yeniden doğar: sistem satırları kısıtlardan geçer, önceki tamamlama atfı geçmişte saklanır", async () => {
    const { clientId, taskId } = await clientWithOpenTask();
    const completedAt = new Date("2026-01-05T10:00:00.000Z");
    await db.task.update({ where: { id: taskId }, data: { status: "COMPLETED", completedAt, completedByUserId: closerId, resolutionType: "MANUAL" } });

    await sync({ id: clientId, phone: null, email: null, contactFollowUpStatus: "COMPLETED" });

    const task = await taskOf(clientId);
    expect([task.status, task.completedAt, task.completedByUserId, task.resolutionType, task.escalationLevel]).toEqual(["PENDING", null, null, null, "STAFF"]);
    const rows = await historyOf(taskId);
    expect(rows.map((row) => row.eventType).sort()).toEqual(["DUE_DATE_CHANGED", "REOPENED"]);
    for (const row of rows) {
      expect([row.actorType, row.actorUserId, row.actorRole, row.authoritySource, row.tenantId]).toEqual(["SYSTEM", null, null, "SYSTEM_PRODUCER", tenantId]);
      expect(row.details).toMatchObject({ producer: "CLIENT_CONTACT_FOLLOWUP" });
    }
    expect(new Set(rows.map((row) => row.correlationId)).size).toBe(1);
    const reopened = rows.find((row) => row.eventType === "REOPENED")!;
    expect([reopened.fromValue, reopened.toValue]).toEqual(["COMPLETED", "PENDING"]);
    // yeniden açma atfı siler; önceki atıf geçmiş satırında durur
    expect(reopened.details).toMatchObject({ previousCompletedAt: completedAt.toISOString(), previousCompletedByUserId: closerId, previousResolutionType: "MANUAL" });
  });

  it("iptal edilmiş görev de yeniden doğar ve kaydı yazılır", async () => {
    const { clientId, taskId } = await clientWithOpenTask();
    await db.task.update({ where: { id: taskId }, data: { status: "CANCELLED" } });

    await sync({ id: clientId, phone: null, email: null, contactFollowUpStatus: "ACTIVE" });

    expect((await taskOf(clientId)).status).toBe("PENDING");
    const rows = await historyOf(taskId);
    expect(rows.filter((row) => row.eventType === "REOPENED").map((row) => [row.fromValue, row.toValue, row.actorType])).toEqual([["CANCELLED", "PENDING", "SYSTEM"]]);
  });

  it("ATOMİKLİK: geçmiş satırı yazılamazsa görev de yeniden açılmaz", async () => {
    const { clientId, taskId } = await clientWithOpenTask();
    await db.task.update({ where: { id: taskId }, data: { status: "COMPLETED", completedAt: new Date(), completedByUserId: closerId, resolutionType: "MANUAL" } });
    // Aynı gerçek istemci; yalnız geçmiş yazımı tablo kısıtını (boş korelasyon) ihlal edecek biçimde bozulur.
    const failingHistory = {
      task: db.task,
      client: db.client,
      $transaction: db.$transaction.bind(db),
      taskHistoryEvent: {
        createMany: (args: { data: Array<Record<string, unknown>> }) =>
          db.taskHistoryEvent.createMany({ data: args.data.map((row) => ({ ...row, correlationId: " " })) as never }),
      },
    };

    await expect(sync({ id: clientId, phone: null, email: null, contactFollowUpStatus: "ACTIVE" }, { prisma: failingHistory })).rejects.toThrow();

    const task = await taskOf(clientId);
    expect([task.status, task.completedByUserId, task.resolutionType]).toEqual(["COMPLETED", closerId, "MANUAL"]);
    expect(await historyOf(taskId)).toEqual([]);
  });

  it("açık görevde eksik listesi güncellemesi yeniden doğuş değildir: geçmiş satırı üretmez", async () => {
    const { clientId, taskId } = await clientWithOpenTask();

    await sync({ id: clientId, phone: "5550000000", email: null, contactFollowUpStatus: "ACTIVE" });

    const task = await taskOf(clientId);
    expect(task.status).toBe("PENDING");
    expect(await historyOf(taskId)).toEqual([]);
  });
});
