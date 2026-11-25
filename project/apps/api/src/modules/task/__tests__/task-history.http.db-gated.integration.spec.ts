// TaskModule grafiği pdf-poppler'a uzanabilir; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import * as request from "supertest";
import { ScopeWorld, buildScopeApp, createScopeWorld, scopeFlag, scopeHttp } from "../../../../test/p3-scope-world";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { AuditService } from "../../audit/audit.service";
import { CASE_VIEW_SCOPE_FLAG } from "../../case/case-view-scope";
import { TaskModule } from "../task.module";
import { TASK_VIEW_SCOPE_FLAG } from "../task-view-scope";

/**
 * F03-A2 (OFP-03a / OFF-INV-08; owner kararı K10 "paketteki sınır", 25.11.2026) — genel görev geçmişi.
 *  1. Oluşturma ve izlenen her alan değişikliği (atama, durum, öncelik, son tarih, dosya bağı, yeniden açma) aktör, rol anlık
 *     görüntüsü, yetki kaynağı, önceki → yeni değer ve korelasyon kimliğiyle `TaskHistoryEvent`'e yazılır; değişmeyen alan ve
 *     izlenmeyen alan (başlık, açıklama) satır ÜRETMEZ.
 *  2. Geçmiş + denetim kaydı domain yazımıyla AYNI işlemdedir: denetim yazımı düşerse görev değişikliği ve geçmiş satırı da kalmaz.
 *  3. İptal olguları `TaskCancellationEvent`'te kalır; `GET /tasks/:id/history` ikisini tek sıralı listede verir (yeni → eski).
 *  4. Okuma yetkisi iptal geçmişiyle aynıdır (görev görünüm kapsamı; kapsam dışı = yok ile aynı 404); dosya numarası yalnız dosya
 *     aktöre görünüyorsa yazılır. Başka büronun görevi okunamaz.
 *  5. Eski kayıt için geriye dönük geçmiş UYDURULMAZ: geçmişi olmayan görevde liste boştur ve yanıt bunu bildirir.
 * Gerçek HTTP (TaskModule + ValidationPipe) + tek kullanımlık PostgreSQL; JWT yerine DB kimliği.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Task history spec requires TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

type HistoryItem = {
  id: string;
  kind: "HISTORY" | "CANCELLATION";
  eventType: string;
  actorType: string;
  actorUserId: string | null;
  actorName: string | null;
  actorRole: string | null;
  authoritySource: string;
  fromValue: string | null;
  toValue: string | null;
  fromLabel: string | null;
  toLabel: string | null;
  reason: string | null;
  correlationId: string | null;
  createdAt: string;
};

describeDb("F03-A2 — genel görev geçmişi (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(300_000);
  const taskFlag = scopeFlag(TASK_VIEW_SCOPE_FLAG);
  const caseFlag = scopeFlag(CASE_VIEW_SCOPE_FLAG);
  let db: PrismaClient;
  let app: INestApplication;
  let w: ScopeWorld;
  const http = scopeHttp(() => app);
  const put = (actor: string, id: string, body: object) => request(app.getHttpServer()).put(`/tasks/${id}`).set("x-test-user-id", actor).send(body);
  const title = (k: string) => `F03A2-${k}-${w.suffix}`;
  const rows = (taskId: string) => db.taskHistoryEvent.findMany({ where: { taskId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const history = async (actor: string, taskId: string, query = "") => {
    const res = await http.get(actor, `/tasks/${taskId}/history${query}`);
    return { status: res.status, body: res.body as { data: HistoryItem[]; meta: { page: number; limit: number; total: number; totalPages: number; coverage: { creationRecorded: boolean; systemWritersRecorded: boolean } } } };
  };
  const TASK_NOT_FOUND = { statusCode: 404, message: "Görev bulunamadı.", error: "Not Found" } as const;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    app = await buildScopeApp(() => db, [TaskModule]);
    w = await createScopeWorld(db, "f03a2");
    taskFlag.off();
    caseFlag.off();
  });

  afterAll(async () => {
    taskFlag.restore();
    caseFlag.restore();
    await app?.close();
    await w?.cleanup(async (tenants) => {
      // Geçmiş ve iptal olguları göreve Restrict FK ile bağlıdır: görevden ÖNCE silinir (yalnız test temizliği).
      await db.taskHistoryEvent.deleteMany({ where: { tenantId: { in: tenants } } }).catch(() => undefined);
      await db.taskCancellationEvent.deleteMany({ where: { tenantId: { in: tenants } } }).catch(() => undefined);
      await db.task.deleteMany({ where: { tenantId: { in: tenants } } }).catch(() => undefined);
    });
    await db.$disconnect();
  });

  const createTask = async (actor: string, body: Record<string, unknown>) => {
    const res = await http.post(actor, "/tasks", body);
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  describe("yazım: oluşturma ve değişiklikler", () => {
    it("oluşturma tek CREATED satırı yazar: aktör, rol, yetki kaynağı CREATOR, başlangıç değerleri, korelasyon; denetim kaydı aynı korelasyonla", async () => {
      const id = await createTask(w.u.link, { title: title("olustur"), priority: "HIGH", dueDate: "2026-12-01", caseId: w.c.c4, assigneeId: w.u.nobody });
      const [created, ...rest] = await rows(id);
      expect(rest).toHaveLength(0);
      expect(created).toMatchObject({
        tenantId: w.tA, taskId: id, eventType: "CREATED", actorType: "USER", actorUserId: w.u.link, actorRole: "USER",
        authoritySource: "CREATOR", fromValue: null, toValue: "PENDING", reason: null,
      });
      expect(created.details).toEqual({ status: "PENDING", priority: "HIGH", assigneeId: w.u.nobody, dueDate: "2026-12-01T00:00:00.000Z", caseId: w.c.c4 });
      expect(created.correlationId).toMatch(/^[0-9a-f-]{36}$/);
      const audit = await db.auditLog.findMany({ where: { tenantId: w.tA, entityType: "TASK", entityId: id } });
      expect(audit.map((a) => [a.action, a.userId, a.correlationId])).toEqual([["TASK_CREATED", w.u.link, created.correlationId]]);
    });

    it("tek istekte değişen her izlenen alan ayrı satırdır ve aynı korelasyonu taşır; yetki kaynağı aktörün görevle ilişkisidir", async () => {
      const id = await createTask(w.u.link, { title: title("coklu") });
      const res = await put(w.u.admin, id, { assigneeId: w.u.nobody, priority: "URGENT", dueDate: "2026-12-15", caseId: w.c.c4, status: "IN_PROGRESS", title: title("coklu-yeni") });
      expect(res.status).toBe(200);
      const [, ...changes] = await rows(id);
      expect(changes.map((c) => [c.eventType, c.fromValue, c.toValue]).sort()).toEqual(
        [
          ["ASSIGNEE_CHANGED", null, w.u.nobody],
          ["CASE_LINK_CHANGED", null, w.c.c4],
          ["DUE_DATE_CHANGED", null, "2026-12-15T00:00:00.000Z"],
          ["PRIORITY_CHANGED", "MEDIUM", "URGENT"],
          ["STATUS_CHANGED", "PENDING", "IN_PROGRESS"],
        ].sort(),
      );
      expect(new Set(changes.map((c) => c.correlationId)).size).toBe(1);
      for (const c of changes) expect([c.actorUserId, c.actorRole, c.authoritySource, c.actorType]).toEqual([w.u.admin, "ADMIN", "ADMIN", "USER"]);

      // atanan kendi görevinde durum değiştirir → ASSIGNEE
      expect((await put(w.u.nobody, id, { status: "COMPLETED" })).status).toBe(200);
      const last = (await rows(id)).at(-1)!;
      expect([last.eventType, last.fromValue, last.toValue, last.authoritySource, last.actorUserId]).toEqual(["STATUS_CHANGED", "IN_PROGRESS", "COMPLETED", "ASSIGNEE", w.u.nobody]);
    });

    it("değişmeyen değer ve izlenmeyen alan (başlık, açıklama) geçmiş satırı ve denetim kaydı ÜRETMEZ", async () => {
      const id = await createTask(w.u.link, { title: title("degismez"), priority: "LOW" });
      const before = (await rows(id)).length;
      const auditBefore = await db.auditLog.count({ where: { tenantId: w.tA, entityType: "TASK", entityId: id } });
      expect((await put(w.u.link, id, { title: title("degismez-2"), description: "sentetik", priority: "LOW", status: "PENDING" })).status).toBe(200);
      expect((await rows(id)).length).toBe(before);
      expect(await db.auditLog.count({ where: { tenantId: w.tA, entityType: "TASK", entityId: id } })).toBe(auditBefore);
      expect((await db.task.findUniqueOrThrow({ where: { id } })).title).toBe(title("degismez-2"));
    });

    it("yeniden açma REOPENED satırıdır ve önceki tamamlama atfını saklar", async () => {
      const id = await createTask(w.u.link, { title: title("yeniden") });
      await put(w.u.nobody, id, { status: "COMPLETED" });
      const done = await db.task.findUniqueOrThrow({ where: { id } });
      expect((await put(w.u.link, id, { status: "PENDING" })).status).toBe(200);
      const last = (await rows(id)).at(-1)!;
      expect([last.eventType, last.fromValue, last.toValue, last.authoritySource]).toEqual(["REOPENED", "COMPLETED", "PENDING", "CREATOR"]);
      expect(last.details).toEqual({ previousCompletedAt: done.completedAt!.toISOString(), previousCompletedByUserId: w.u.nobody, previousResolutionType: "MANUAL" });
    });

    it("ATOMİKLİK: denetim yazımı düşerse görev değişikliği de geçmiş satırı da geri alınır (oluşturma ve güncelleme)", async () => {
      const audit = app.get(AuditService);
      const id = await createTask(w.u.link, { title: title("atomik") });
      const before = await db.task.findUniqueOrThrow({ where: { id } });
      const historyBefore = (await rows(id)).length;

      const spy = jest.spyOn(audit, "logInTransaction").mockRejectedValue(new Error("denetim yazılamadı (sentetik)"));
      try {
        const upd = await put(w.u.link, id, { status: "IN_PROGRESS", priority: "HIGH" });
        expect(upd.status).toBe(500);
        const after = await db.task.findUniqueOrThrow({ where: { id } });
        expect([after.status, after.priority, after.updatedAt.toISOString()]).toEqual([before.status, before.priority, before.updatedAt.toISOString()]);
        expect((await rows(id)).length).toBe(historyBefore);

        const crt = await http.post(w.u.link, "/tasks", { title: title("atomik-olusmaz") });
        expect(crt.status).toBe(500);
        expect(await db.task.count({ where: { title: title("atomik-olusmaz") } })).toBe(0);
      } finally {
        spy.mockRestore();
      }
      // denetim geri gelince aynı istek yazılır
      expect((await put(w.u.link, id, { status: "IN_PROGRESS" })).status).toBe(200);
      expect((await rows(id)).length).toBe(historyBefore + 1);
    });

    it("aktif olmayan / başka büronun aktörü geçmişe yazamaz: istek reddedilir, satır değişmez", async () => {
      const id = await createTask(w.u.link, { title: title("aktor") });
      const before = (await rows(id)).length;
      const res = await put(w.v.nobody, id, { status: "IN_PROGRESS" });
      expect(res.status).toBe(404);
      expect((await rows(id)).length).toBe(before);
      expect((await db.task.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
    });
  });

  describe("okuma: GET /tasks/:id/history", () => {
    it("genel geçmiş ile gerekçeli iptal tek listede, yeni → eski sıralı; aktör adı ve atanan adı çözülür", async () => {
      const id = await createTask(w.u.admin, { title: title("oku") });
      await put(w.u.admin, id, { assigneeId: w.u.link });
      await put(w.u.link, id, { status: "IN_PROGRESS" });
      const cancel = await http.post(w.u.admin, `/tasks/${id}/cancel`, { reason: "Sentetik iptal gerekçesi" });
      expect(cancel.status).toBe(201);
      await put(w.u.admin, id, { status: "PENDING" });

      const { status, body } = await history(w.u.admin, id);
      expect(status).toBe(200);
      expect(body.data.map((e) => [e.kind, e.eventType])).toEqual([
        ["HISTORY", "REOPENED"],
        ["CANCELLATION", "CANCELLED"],
        ["HISTORY", "STATUS_CHANGED"],
        ["HISTORY", "ASSIGNEE_CHANGED"],
        ["HISTORY", "CREATED"],
      ]);
      expect(body.meta).toMatchObject({ page: 1, total: 5, totalPages: 1, coverage: { creationRecorded: true, systemWritersRecorded: false } });
      const times = body.data.map((e) => new Date(e.createdAt).getTime());
      expect([...times].sort((a, b) => b - a)).toEqual(times);

      const cancelled = body.data[1];
      expect([cancelled.fromValue, cancelled.toValue, cancelled.reason, cancelled.actorUserId, cancelled.authoritySource]).toEqual(["IN_PROGRESS", "CANCELLED", "Sentetik iptal gerekçesi", w.u.admin, "ADMIN"]);
      const assigned = body.data[3];
      expect([assigned.fromLabel, assigned.toLabel, assigned.toValue]).toEqual([null, "link P3", w.u.link]);
      expect(body.data[4].actorName).toBe("admin P3");
      // ham denetim alanları yanıtta yok
      for (const e of body.data) expect(Object.keys(e)).not.toEqual(expect.arrayContaining(["tenantId", "taskId", "details"]));
    });

    it("sayfalama iki tabloyu birlikte keser; sınır dışı pencere 400", async () => {
      const id = await createTask(w.u.admin, { title: title("sayfa") });
      for (const priority of ["LOW", "HIGH", "URGENT", "MEDIUM"]) await put(w.u.admin, id, { priority });
      const p1 = await history(w.u.admin, id, "?page=1&limit=2");
      const p2 = await history(w.u.admin, id, "?page=2&limit=2");
      const p3 = await history(w.u.admin, id, "?page=3&limit=2");
      expect([p1.body.meta.total, p1.body.meta.totalPages]).toEqual([5, 3]);
      expect([p1.body.data.length, p2.body.data.length, p3.body.data.length]).toEqual([2, 2, 1]);
      const ids = [...p1.body.data, ...p2.body.data, ...p3.body.data].map((e) => e.id);
      expect(new Set(ids).size).toBe(5);
      expect(p3.body.data[0].eventType).toBe("CREATED");
      expect((await history(w.u.admin, id, "?page=0")).status).toBe(400);
      expect((await history(w.u.admin, id, "?limit=101")).status).toBe(400);
      expect((await history(w.u.admin, id, "?page=21&limit=100")).status).toBe(400);
    });

    it("geçmişi olmayan (önceden var olan) görev: liste boş, yanıt oluşturma kaydının olmadığını bildirir; satır UYDURULMAZ", async () => {
      const legacy = (await db.task.create({ data: { tenantId: w.tA, title: title("eski"), createdById: w.u.admin } })).id;
      const { status, body } = await history(w.u.admin, legacy);
      expect(status).toBe(200);
      expect(body.data).toEqual([]);
      expect(body.meta).toMatchObject({ total: 0, coverage: { creationRecorded: false } });
      expect(await db.taskHistoryEvent.count({ where: { taskId: legacy } })).toBe(0);
    });

    it("başka büronun görevi ve var olmayan görev aynı 404 gövdesini alır", async () => {
      const id = await createTask(w.u.admin, { title: title("buro") });
      expect((await history(w.v.nobody, id)).body).toEqual(TASK_NOT_FOUND);
      expect((await history(w.u.admin, w.missing)).body).toEqual(TASK_NOT_FOUND);
    });
  });

  describe("okuma kapsamı: görev görünüm kapsamı ve dosya görünürlüğü", () => {
    let id = "";
    beforeAll(async () => {
      taskFlag.off();
      caseFlag.off();
      id = await createTask(w.u.link, { title: title("kapsam"), assigneeId: w.u.nobody });
      await put(w.u.link, id, { caseId: w.c.c4 });
    });
    afterAll(() => {
      taskFlag.off();
      caseFlag.off();
    });

    it("görev kapsamı AÇIK: ilişkisi olmayan kullanıcı geçmişi okuyamaz (yok ile aynı 404); atanan ve oluşturan okur", async () => {
      taskFlag.on();
      expect((await history(w.u.resp, id)).body).toEqual(TASK_NOT_FOUND);
      expect((await history(w.u.nobody, id)).status).toBe(200);
      expect((await history(w.u.link, id)).status).toBe(200);
    });

    it("dosya kapsamı AÇIK: dosya NUMARASI yalnız dosyayı gören aktöre yazılır (kimlik görevin kendi sütunudur ve değişmez)", async () => {
      taskFlag.on();
      caseFlag.on();
      const seen = (await history(w.u.link, id)).body.data.find((e) => e.eventType === "CASE_LINK_CHANGED")!;
      expect([seen.toValue, seen.toLabel]).toEqual([w.c.c4, w.fileNo("c4")]);
      const hiddenBody = (await history(w.u.nobody, id)).body;
      const hidden = hiddenBody.data.find((e) => e.eventType === "CASE_LINK_CHANGED")!;
      expect([hidden.toValue, hidden.toLabel]).toEqual([w.c.c4, null]);
      expect(JSON.stringify(hiddenBody)).not.toContain(w.fileNo("c4"));
    });

    it("dosya kapsamı KAPALI: dosya numarası büro içinde yazılır (bugünkü görev yanıtıyla aynı kural)", async () => {
      taskFlag.off();
      caseFlag.off();
      const row = (await history(w.u.nobody, id)).body.data.find((e) => e.eventType === "CASE_LINK_CHANGED")!;
      expect(row.toLabel).toBe(w.fileNo("c4"));
    });
  });
});
