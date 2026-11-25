// TaskModule grafiği pdf-poppler'a uzanabilir; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import * as request from "supertest";
import { buildScopeApp, scopeFlag } from "../../../../test/p3-scope-world";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { CASE_VIEW_SCOPE_FLAG } from "../../case/case-view-scope";
import { TaskModule } from "../task.module";
import { TASK_VIEW_ALL_KEY, TASK_VIEW_SCOPE_FLAG } from "../task-view-scope";

/**
 * F03-C (OFP-04 / WR01 B05, D-WR-2; owner kararları K3-a, K4-b, K5-b, K5b-a, K8, K9 — 25.11.2026) — görev içi bağımsız ilk kontrol.
 *  1. Zincir: oluştur (kontrol gerekli) → ata → yap → FARKLI KİŞİ kontrol → revizyon / ret → yeniden tamamla → onay.
 *     Kontrolde görev `IN_PROGRESS` kalır (tamamlanmış sayılmaz); onayda tamamlama atfı İŞİ YAPANA yazılır.
 *  2. Aynı kişinin ikinci hesabı (aynı TCKN'li kart) kontrol edemez; işi yapanın kendisi de edemez (kişi düzeyi).
 *  3. Kontrol edebilen: aynı büro ADMIN + oluşturan. Atanmış olmak / başka büro / VIEWER yetki vermez.
 *  4. K5: işi yapacak kişiden başka kontrol edebilecek kişi yoksa işaret KONAMAZ. K8: tamamlanırken yoksa tamamlama REDDEDİLİR;
 *     oluşturan / ADMIN işareti GEREKÇEYLE kaldırabilir, kaldırma geçmişe yazılır.
 *  5. Karar ve gerekçe görevde ve geçmişte kalır; ret ve revizyonda gerekçe zorunludur.
 *  6. Kontrole yalnız kullanıcının açtığı görev girer; sistem görevi işaretlenemez.
 *  7. Görev görünüm kapsamı açıkken görevi göremeyen yönetici "kontrol edebilecek kişi" sayılmaz ve karar veremez.
 * Gerçek HTTP (TaskModule + ValidationPipe) + tek kullanımlık PostgreSQL; JWT yerine DB kimliği.
 * Kimlik değerleri yalnız denetim hanesi kuralını sağlayan ÜRETİLMİŞ sayılardır (gerçek kişi verisi değildir).
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Task review spec requires TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

/** Denetim hanesi kuralını sağlayan üretilmiş kimlik numarası (ilk dokuz hane verilir). */
function syntheticTckn(first9: string): string {
  const d = first9.split("").map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  const d11 = (d.reduce((a, b) => a + b, 0) + d10) % 10;
  return first9 + String(d10) + String(d11);
}

describeDb("F03-C — görev içi bağımsız ilk kontrol (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(300_000);
  const taskFlag = scopeFlag(TASK_VIEW_SCOPE_FLAG);
  const caseFlag = scopeFlag(CASE_VIEW_SCOPE_FLAG);
  const suffix = randomUUID().slice(0, 8);
  const tA = `test-f03c-a-${suffix}`;
  const tSolo = `test-f03c-solo-${suffix}`;
  const tB = `test-f03c-b-${suffix}`;
  let db: PrismaClient;
  let app: INestApplication;
  const u = { admin: "", admin2: "", creator: "", doer: "", doerTwinAdmin: "", bystander: "", viewer: "", solo: "", other: "" };
  const http = () => request(app.getHttpServer());
  const post = (actor: string, path: string, body: object = {}) => http().post(path).set("x-test-user-id", actor).send(body);
  const put = (actor: string, id: string, body: object) => http().put(`/tasks/${id}`).set("x-test-user-id", actor).send(body);
  const get = (actor: string, path: string) => http().get(path).set("x-test-user-id", actor);
  const row = (id: string) => db.task.findUniqueOrThrow({ where: { id } });
  const events = async (id: string) => (await db.taskHistoryEvent.findMany({ where: { taskId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map((e) => e.eventType);
  const title = (k: string) => `F03C-${k}-${suffix}`;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    app = await buildScopeApp(() => db, [TaskModule]);
    taskFlag.off();
    caseFlag.off();
    for (const id of [tA, tSolo, tB]) await db.tenant.create({ data: { id, name: id, slug: id } });
    const mkUser = async (tenantId: string, key: string, role: "ADMIN" | "USER" | "VIEWER" = "USER") =>
      (await db.user.create({ data: { tenantId, email: `f03c-${key}-${suffix}@example.test`, name: key, surname: "F03C", role } })).id;
    const lawyerCard = (tenantId: string, userId: string, tckn: string) => db.lawyer.create({ data: { tenantId, userId, name: "Av", surname: "F03C", tckn, isActive: true } });
    const staffCard = (tenantId: string, userId: string, tckn: string) =>
      db.staffMember.create({ data: { tenantId, userId, firstName: "Per", lastName: "F03C", staffType: "DIGER", tckn } });
    const seed = String(100000000 + (parseInt(suffix, 16) % 800000000));
    const tc = (n: number) => syntheticTckn(String(Number(seed) + n).padStart(9, "1").slice(0, 9));

    u.admin = await mkUser(tA, "admin", "ADMIN");
    u.admin2 = await mkUser(tA, "admin2", "ADMIN");
    u.creator = await mkUser(tA, "creator");
    u.doer = await mkUser(tA, "doer");
    u.doerTwinAdmin = await mkUser(tA, "doer-twin", "ADMIN"); // işi yapanla AYNI KİŞİ'nin ADMIN rolündeki ikinci hesabı
    u.bystander = await mkUser(tA, "bystander");
    u.viewer = await mkUser(tA, "viewer", "VIEWER");
    await lawyerCard(tA, u.admin, tc(1));
    await lawyerCard(tA, u.creator, tc(2));
    await lawyerCard(tA, u.doer, tc(3));
    await staffCard(tA, u.doerTwinAdmin, tc(3));
    u.solo = await mkUser(tSolo, "solo", "ADMIN");
    u.other = await mkUser(tB, "other", "ADMIN");
  });

  afterAll(async () => {
    taskFlag.restore();
    caseFlag.restore();
    await app?.close();
    for (const tenantId of [tA, tSolo, tB]) {
      await db.taskHistoryEvent.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.taskCancellationEvent.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.permissionGrant.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.expenseRequest.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.task.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.case.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.client.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.staffMember.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.lawyer.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await db.$disconnect();
  });

  const createReviewed = async (key: string, extra: Record<string, unknown> = {}) => {
    const res = await post(u.creator, "/tasks", { title: title(key), reviewRequired: true, assigneeId: u.doer, ...extra });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  describe("zincir: oluştur → ata → yap → farklı kişi kontrol → revizyon / ret → yeniden tamamla → onay", () => {
    let id = "";

    it("oluşturan 'kontrol gerekli' işaretler; işi yapan tamamlayınca görev TAMAMLANMIŞ sayılmaz, kontrolde bekler", async () => {
      id = await createReviewed("zincir");
      expect((await row(id)).reviewRequired).toBe(true);

      const res = await put(u.doer, id, { status: "COMPLETED" });
      expect(res.status).toBe(200);
      const t = await row(id);
      expect([t.status, t.reviewStatus, t.reviewSubmittedByUserId, t.completedAt, t.completedByUserId, t.resolutionType]).toEqual(["IN_PROGRESS", "AWAITING", u.doer, null, null, null]);
      expect(t.reviewSubmittedAt).toBeInstanceOf(Date);
      expect(await events(id)).toEqual(["CREATED", "REVIEW_REQUIREMENT_SET", "REVIEW_SUBMITTED"]);
    });

    it("kontrolde görev listede 'tamamlandı' değildir; kontrol süzgeci onu verir; sayaç ayrı sayar", async () => {
      const completed = await get(u.admin, "/tasks?status=COMPLETED&limit=100");
      expect((completed.body.data as Array<{ id: string }>).map((r) => r.id)).not.toContain(id);
      const awaiting = await get(u.admin, "/tasks?review=AWAITING&limit=100");
      expect((awaiting.body.data as Array<{ id: string }>).map((r) => r.id)).toContain(id);
      expect(awaiting.body.meta.awaitingReview).toBeGreaterThanOrEqual(1);
    });

    it("kontrolde görevin durumu PUT ile değiştirilemez (karar ya da işaretin kaldırılması gerekir)", async () => {
      for (const status of ["COMPLETED", "PENDING"]) {
        const res = await put(u.doer, id, { status });
        expect([res.status, res.body.code]).toEqual([409, "TASK_REVIEW_AWAITING"]);
      }
      // durumu aynen geri gönderen düzenleme (ekran formu) çalışır
      expect((await put(u.creator, id, { status: "IN_PROGRESS", description: "sentetik not" })).status).toBe(200);
      expect((await row(id)).reviewStatus).toBe("AWAITING");
    });

    it("işi yapan kendi işini onaylayamaz; aynı kişinin ADMIN rolündeki ikinci hesabı da onaylayamaz (kişi düzeyi)", async () => {
      const self = await post(u.doer, `/tasks/${id}/review`, { decision: "APPROVE" });
      expect(self.status).toBe(403);
      const twin = await post(u.doerTwinAdmin, `/tasks/${id}/review`, { decision: "APPROVE" });
      expect([twin.status, twin.body.code]).toEqual([403, "TASK_REVIEW_SAME_PERSON"]);
      expect((await row(id)).reviewStatus).toBe("AWAITING");
    });

    it("atanmış olmak / büro kullanıcısı olmak / VIEWER / başka büro kontrol yetkisi vermez", async () => {
      expect((await post(u.bystander, `/tasks/${id}/review`, { decision: "APPROVE" })).status).toBe(403);
      expect((await post(u.viewer, `/tasks/${id}/review`, { decision: "APPROVE" })).status).toBe(403);
      expect((await post(u.other, `/tasks/${id}/review`, { decision: "APPROVE" })).status).toBe(404);
      expect((await row(id)).reviewStatus).toBe("AWAITING");
    });

    it("revizyon gerekçe ister; görev işi yapanda 'devam ediyor' olur; karar ve gerekçe görevde ve geçmişte kalır", async () => {
      const missing = await post(u.creator, `/tasks/${id}/review`, { decision: "REQUEST_REVISION" });
      expect(missing.status).toBe(400);
      const res = await post(u.creator, `/tasks/${id}/review`, { decision: "REQUEST_REVISION", note: "Sentetik revizyon gerekçesi" });
      expect(res.status).toBe(201);
      const t = await row(id);
      expect([t.status, t.reviewStatus, t.reviewedByUserId, t.reviewNote, t.assigneeId, t.completedAt]).toEqual(["IN_PROGRESS", "REVISION_REQUESTED", u.creator, "Sentetik revizyon gerekçesi", u.doer, null]);
      const last = (await db.taskHistoryEvent.findMany({ where: { taskId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 }))[0];
      expect([last.eventType, last.actorUserId, last.authoritySource, last.reason]).toEqual(["REVIEW_REVISION_REQUESTED", u.creator, "REVIEWER_CREATOR", "Sentetik revizyon gerekçesi"]);
    });

    it("yeniden tamamlama yeniden kontrole girer; ret gerekçe ister ve görevi 'bekliyor'a döndürür (iş yapılmamış sayılır)", async () => {
      expect((await put(u.doer, id, { status: "COMPLETED" })).status).toBe(200);
      expect((await row(id)).reviewStatus).toBe("AWAITING");
      expect((await post(u.admin, `/tasks/${id}/review`, { decision: "REJECT" })).status).toBe(400);
      const res = await post(u.admin, `/tasks/${id}/review`, { decision: "REJECT", note: "Sentetik ret gerekçesi" });
      expect(res.status).toBe(201);
      const t = await row(id);
      expect([t.status, t.reviewStatus, t.reviewedByUserId, t.reviewNote, t.completedAt, t.completedByUserId]).toEqual(["PENDING", "REJECTED", u.admin, "Sentetik ret gerekçesi", null, null]);
    });

    it("yeniden tamamlama → farklı kişi onaylar: görev tamamlanır ve tamamlama atfı İŞİ YAPANA yazılır", async () => {
      expect((await put(u.doer, id, { status: "COMPLETED" })).status).toBe(200);
      const res = await post(u.admin2, `/tasks/${id}/review`, { decision: "APPROVE", note: "Sentetik onay notu" });
      expect(res.status).toBe(201);
      const t = await row(id);
      expect([t.status, t.reviewStatus, t.completedByUserId, t.resolutionType, t.reviewedByUserId, t.reviewNote]).toEqual(["COMPLETED", "APPROVED", u.doer, "MANUAL", u.admin2, "Sentetik onay notu"]);
      expect(t.completedAt).toBeInstanceOf(Date);
      expect(await events(id)).toEqual([
        "CREATED",
        "REVIEW_REQUIREMENT_SET",
        "REVIEW_SUBMITTED",
        "REVIEW_REVISION_REQUESTED",
        "REVIEW_SUBMITTED",
        "REVIEW_REJECTED",
        "REVIEW_SUBMITTED",
        "REVIEW_APPROVED",
      ]);
      // karar verilmiş görevde ikinci karar yok
      const again = await post(u.admin, `/tasks/${id}/review`, { decision: "APPROVE" });
      expect([again.status, again.body.code]).toEqual([409, "TASK_REVIEW_NOT_AWAITING"]);
    });
  });

  describe("K5 — kontrol edebilecek kişi yokken işaret konamaz", () => {
    it("tek yöneticili büroda görevi kendine atayan oluşturan işaret koyamaz; ekran nedenini alır; görev oluşmaz", async () => {
      const res = await post(u.solo, "/tasks", { title: title("solo-kendine"), reviewRequired: true, assigneeId: u.solo });
      expect([res.status, res.body.code]).toEqual([409, "TASK_REVIEW_NO_ELIGIBLE_REVIEWER"]);
      expect(String(res.body.message)).toContain("kontrol edebilecek");
      expect(await db.task.count({ where: { title: title("solo-kendine") } })).toBe(0);
    });

    it("işaretli görev, kontrol edebilecek kişi bırakmayan birine atanamaz", async () => {
      const created = await post(u.solo, "/tasks", { title: title("solo-atama"), reviewRequired: true });
      expect(created.status).toBe(201);
      const res = await put(u.solo, created.body.id, { assigneeId: u.solo });
      expect([res.status, res.body.code]).toEqual([409, "TASK_REVIEW_NO_ELIGIBLE_REVIEWER"]);
      expect((await row(created.body.id)).assigneeId).toBeNull();
    });

    it("işaretsiz görev etkilenmez", async () => {
      const res = await post(u.solo, "/tasks", { title: title("solo-isaretsiz"), assigneeId: u.solo });
      expect(res.status).toBe(201);
      expect((await put(u.solo, res.body.id, { status: "COMPLETED" })).status).toBe(200);
      const t = await row(res.body.id);
      expect([t.status, t.reviewStatus, t.completedByUserId]).toEqual(["COMPLETED", null, u.solo]);
    });
  });

  describe("K8 — tamamlanırken kontrol edebilecek kişi kalmamışsa", () => {
    let id = "";
    it("tamamlama reddedilir; görev değişmez; neden yanıtta yazar", async () => {
      const created = await post(u.solo, "/tasks", { title: title("solo-k8"), reviewRequired: true });
      id = created.body.id;
      const res = await put(u.solo, id, { status: "COMPLETED" });
      expect([res.status, res.body.code]).toEqual([409, "TASK_REVIEW_NO_ELIGIBLE_REVIEWER"]);
      const t = await row(id);
      expect([t.status, t.reviewStatus, t.completedAt]).toEqual(["PENDING", null, null]);
    });

    it("işaret gerekçesiz kaldırılamaz; oluşturan / ADMIN gerekçeyle kaldırır; kaldırma geçmişe yazılır ve görev tamamlanabilir", async () => {
      expect((await post(u.solo, `/tasks/${id}/review-requirement`, { required: false })).status).toBe(400);
      const res = await post(u.solo, `/tasks/${id}/review-requirement`, { required: false, reason: "Sentetik: büroda başka yetkili yok" });
      expect(res.status).toBe(201);
      expect((await row(id)).reviewRequired).toBe(false);
      const last = (await db.taskHistoryEvent.findMany({ where: { taskId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 }))[0];
      expect([last.eventType, last.actorUserId, last.reason]).toEqual(["REVIEW_REQUIREMENT_REMOVED", u.solo, "Sentetik: büroda başka yetkili yok"]);
      expect((await put(u.solo, id, { status: "COMPLETED" })).status).toBe(200);
      const t = await row(id);
      expect([t.status, t.reviewStatus, t.completedByUserId]).toEqual(["COMPLETED", null, u.solo]);
    });
  });

  describe("işaretin sahibi ve kapsamı (K4-b)", () => {
    it("işareti yalnız oluşturan koyar; oluşturan ya da ADMIN kaldırır; başkası değiştiremez", async () => {
      const created = await post(u.creator, "/tasks", { title: title("isaret"), assigneeId: u.doer });
      const id = created.body.id as string;
      expect((await row(id)).reviewRequired).toBe(false);
      expect((await post(u.admin, `/tasks/${id}/review-requirement`, { required: true })).status).toBe(403);
      expect((await post(u.doer, `/tasks/${id}/review-requirement`, { required: true })).status).toBe(403);
      expect((await post(u.creator, `/tasks/${id}/review-requirement`, { required: true })).status).toBe(201);
      expect((await row(id)).reviewRequired).toBe(true);
      expect((await post(u.doer, `/tasks/${id}/review-requirement`, { required: false, reason: "Sentetik" })).status).toBe(403);
      expect((await post(u.admin, `/tasks/${id}/review-requirement`, { required: false, reason: "Sentetik yönetici gerekçesi" })).status).toBe(201);
      expect((await row(id)).reviewRequired).toBe(false);
      expect(await events(id)).toEqual(["CREATED", "REVIEW_REQUIREMENT_SET", "REVIEW_REQUIREMENT_REMOVED"]);
    });

    it("kontrol beklerken işaret kaldırılırsa bekleyen kontrol düşer; görev 'devam ediyor' kalır ve yeniden tamamlanabilir", async () => {
      const id = await createReviewed("kaldir-beklerken");
      await put(u.doer, id, { status: "COMPLETED" });
      expect((await row(id)).reviewStatus).toBe("AWAITING");
      expect((await post(u.creator, `/tasks/${id}/review-requirement`, { required: false, reason: "Sentetik: kontrol gereği kalmadı" })).status).toBe(201);
      const t = await row(id);
      expect([t.status, t.reviewRequired, t.reviewStatus, t.completedAt]).toEqual(["IN_PROGRESS", false, null, null]);
      expect((await put(u.doer, id, { status: "COMPLETED" })).status).toBe(200);
      expect([(await row(id)).status, (await row(id)).completedByUserId]).toEqual(["COMPLETED", u.doer]);
    });

    it("sistem görevi (oluşturanı olmayan / mükerrer anahtarlı) kontrole tabi tutulamaz", async () => {
      const sys = (await db.task.create({ data: { tenantId: tA, title: title("sistem"), dedupeKey: `F03C:${suffix}`, taskCategory: "OPERATIONAL_COMPLETENESS" } })).id;
      const res = await post(u.admin, `/tasks/${sys}/review-requirement`, { required: true });
      expect([403, 409]).toContain(res.status);
      expect((await row(sys)).reviewRequired).toBe(false);
    });

    it("masraf talebine bağlı görev kontrole tabi tutulamaz; masraf–görev bağı değişmez", async () => {
      const client = await db.client.create({ data: { tenantId: tA, displayName: `F03C Sentetik Müvekkil ${suffix}`, type: "COMPANY" } });
      const legalCase = await db.case.create({ data: { tenantId: tA, fileNumber: `F03C-${suffix}`, type: "GENERAL_EXECUTION" } as never });
      const created = await post(u.creator, "/tasks", { title: title("masraf-bagli") });
      const id = created.body.id as string;
      const expense = await db.expenseRequest.create({ data: { tenantId: tA, caseId: legalCase.id, clientId: client.id, createdById: u.creator, totalAmount: 100, taskId: id } });

      const res = await post(u.creator, `/tasks/${id}/review-requirement`, { required: true });
      expect([res.status, res.body.code]).toEqual([409, "TASK_REVIEW_NOT_APPLICABLE"]);
      expect((await row(id)).reviewRequired).toBe(false);
      expect((await db.expenseRequest.findUniqueOrThrow({ where: { id: expense.id } })).taskId).toBe(id);
    });

    it("iptal bekleyen kontrolü düşürür; iptal kaydı aynen yazılır", async () => {
      const id = await createReviewed("iptal");
      await put(u.doer, id, { status: "COMPLETED" });
      const res = await post(u.creator, `/tasks/${id}/cancel`, { reason: "Sentetik iptal" });
      expect(res.status).toBe(201);
      const t = await row(id);
      expect([t.status, t.reviewStatus]).toEqual(["CANCELLED", null]);
      expect(await db.taskCancellationEvent.count({ where: { taskId: id } })).toBe(1);
    });
  });

  describe("ek kurallar", () => {
    it("PUT 'kontrol gerekli' alanını kabul etmez (400); tamamlanmış olarak açılan görev işaretlenemez (409)", async () => {
      const id = await createReviewed("put-alan");
      expect((await put(u.creator, id, { reviewRequired: false })).status).toBe(400);
      expect((await row(id)).reviewRequired).toBe(true);
      const res = await post(u.creator, "/tasks", { title: title("tamam-acilis"), reviewRequired: true, status: "COMPLETED" });
      expect([res.status, res.body.code]).toEqual([409, "TASK_REVIEW_NOT_APPLICABLE"]);
      expect(await db.task.count({ where: { title: title("tamam-acilis") } })).toBe(0);
    });

    it("revizyon: işi atanandan başkası yaptıysa görev İŞİ YAPANA atanır ve atama değişikliği geçmişe yazılır", async () => {
      const id = await createReviewed("revizyon-atama", { assigneeId: u.bystander });
      expect((await put(u.doer, id, { status: "COMPLETED" })).status).toBe(200);
      expect((await post(u.admin, `/tasks/${id}/review`, { decision: "REQUEST_REVISION", note: "Sentetik" })).status).toBe(201);
      const t = await row(id);
      expect([t.status, t.assigneeId]).toEqual(["IN_PROGRESS", u.doer]);
      expect((await events(id)).slice(-2).sort()).toEqual(["ASSIGNEE_CHANGED", "REVIEW_REVISION_REQUESTED"]);
    });

    it("onaylanmış görev yeniden açılınca kontrol izi sıfırlanır; yeniden tamamlama yeniden kontrole girer", async () => {
      const id = await createReviewed("yeniden-acma");
      await put(u.doer, id, { status: "COMPLETED" });
      expect((await post(u.admin, `/tasks/${id}/review`, { decision: "APPROVE" })).status).toBe(201);
      expect((await row(id)).status).toBe("COMPLETED");
      expect((await put(u.creator, id, { status: "PENDING" })).status).toBe(200);
      let t = await row(id);
      expect([t.status, t.reviewRequired, t.reviewStatus, t.reviewedByUserId, t.completedByUserId]).toEqual(["PENDING", true, null, null, null]);
      expect((await put(u.doer, id, { status: "COMPLETED" })).status).toBe(200);
      t = await row(id);
      expect([t.status, t.reviewStatus, t.completedAt]).toEqual(["IN_PROGRESS", "AWAITING", null]);
    });

    it("eşzamanlı iki karardan yalnız biri yazılır; diğeri 409 alır", async () => {
      const id = await createReviewed("es-zamanli");
      await put(u.doer, id, { status: "COMPLETED" });
      const [a, b] = await Promise.all([
        post(u.admin, `/tasks/${id}/review`, { decision: "APPROVE" }),
        post(u.admin2, `/tasks/${id}/review`, { decision: "REJECT", note: "Sentetik eşzamanlı ret" }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      const decisions = (await events(id)).filter((e) => e === "REVIEW_APPROVED" || e === "REVIEW_REJECTED");
      expect(decisions).toHaveLength(1);
    });

    it("geçmiş ucu kontrol olaylarını karar veren, yetki kaynağı ve gerekçeyle döndürür", async () => {
      const id = await createReviewed("gecmis");
      await put(u.doer, id, { status: "COMPLETED" });
      await post(u.creator, `/tasks/${id}/review`, { decision: "REJECT", note: "Sentetik geçmiş gerekçesi" });
      const res = await get(u.doer, `/tasks/${id}/history`);
      expect(res.status).toBe(200);
      const top = res.body.data[0];
      expect([top.eventType, top.actorUserId, top.authoritySource, top.fromValue, top.toValue, top.reason]).toEqual([
        "REVIEW_REJECTED", u.creator, "REVIEWER_CREATOR", "IN_PROGRESS", "PENDING", "Sentetik geçmiş gerekçesi",
      ]);
      expect((res.body.data as Array<{ eventType: string }>).map((e) => e.eventType)).toEqual(["REVIEW_REJECTED", "REVIEW_SUBMITTED", "REVIEW_REQUIREMENT_SET", "CREATED"]);
    });

    it("gerekçe ve not ham denetim kaydına yazılmaz (yalnız görevde ve görev geçmişinde durur)", async () => {
      const id = await createReviewed("denetim");
      await put(u.doer, id, { status: "COMPLETED" });
      await post(u.admin, `/tasks/${id}/review`, { decision: "REQUEST_REVISION", note: "Sentetik-ham-denetim-işareti" });
      const logs = await db.auditLog.findMany({ where: { tenantId: tA, entityType: "TASK", entityId: id } });
      expect(logs.map((log) => log.action).sort()).toEqual(["TASK_CREATED", "TASK_REVIEW_DECIDED", "TASK_UPDATED"]);
      expect(JSON.stringify(logs)).not.toContain("Sentetik-ham-denetim-işareti");
    });
  });

  describe("görev görünüm kapsamı açıkken: görevi göremeyen yönetici 'kontrol edebilecek kişi' sayılmaz", () => {
    let id = "";
    beforeAll(() => taskFlag.on());
    afterAll(() => taskFlag.off());

    it("K5: görevi kendine atayan oluşturan, görevi görebilecek başka kontrolör yokken işaret koyamaz (büroda yönetici olsa da)", async () => {
      const res = await post(u.creator, "/tasks", { title: title("kapsam-k5"), reviewRequired: true, assigneeId: u.creator });
      expect([res.status, res.body.code]).toEqual([409, "TASK_REVIEW_NO_ELIGIBLE_REVIEWER"]);
      expect(await db.task.count({ where: { title: title("kapsam-k5") } })).toBe(0);
    });

    it("K8: oluşturan kendi dosyasız görevini tamamlarken görevi görebilen kontrolör yoksa tamamlama reddedilir", async () => {
      const created = await post(u.creator, "/tasks", { title: title("kapsam-k8"), reviewRequired: true });
      expect(created.status).toBe(201);
      id = created.body.id;
      const res = await put(u.creator, id, { status: "COMPLETED" });
      expect([res.status, res.body.code]).toEqual([409, "TASK_REVIEW_NO_ELIGIBLE_REVIEWER"]);
      expect((await row(id)).status).toBe("PENDING");
    });

    it("büro geneli görev izni olan yönetici görevi görür: tamamlama kontrole düşer, o yönetici karar verir; izni olmayan yönetici görevi bulamaz", async () => {
      await db.permissionGrant.create({ data: { tenantId: tA, subjectUserId: u.admin, permissionKey: TASK_VIEW_ALL_KEY, effect: "ALLOW", scope: "GLOBAL" } });
      expect((await put(u.creator, id, { status: "COMPLETED" })).status).toBe(200);
      expect((await row(id)).reviewStatus).toBe("AWAITING");
      expect((await post(u.admin2, `/tasks/${id}/review`, { decision: "APPROVE" })).status).toBe(404);
      expect((await post(u.admin, `/tasks/${id}/review`, { decision: "APPROVE" })).status).toBe(201);
      const t = await row(id);
      expect([t.status, t.completedByUserId, t.reviewedByUserId]).toEqual(["COMPLETED", u.creator, u.admin]);
    });

    it("görevi atanan olarak gören yönetici, işi başkası yaptıysa kontrol edebilir", async () => {
      const created = await post(u.creator, "/tasks", { title: title("kapsam-atanan"), reviewRequired: true, assigneeId: u.admin2 });
      expect(created.status).toBe(201);
      expect((await put(u.creator, created.body.id, { status: "COMPLETED" })).status).toBe(200);
      expect((await post(u.admin2, `/tasks/${created.body.id}/review`, { decision: "APPROVE" })).status).toBe(201);
      expect((await row(created.body.id)).completedByUserId).toBe(u.creator);
    });
  });
});
