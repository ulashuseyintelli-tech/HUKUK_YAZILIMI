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
import { CASE_VIEW_SCOPE_FLAG } from "../../case/case-view-scope";
import { TaskModule } from "../task.module";
import { TASK_VIEW_SCOPE_FLAG } from "../task-view-scope";

/**
 * F03-B2 (OFP-02; owner kararı K2-a, 25.11.2026) — dosyadan görev: dosyaya bağlı görevin oluşturulması ve dosya süzgeci.
 *  1. `GET /tasks?caseId=` yalnız o dosyanın görevlerini döner; data + total + summary AYNI kapsamdadır; görev görünüm kapsamıyla
 *     KESİŞİR (kapsam genişletmez); başka büronun dosyası boş sonuçtur.
 *  2. Görev bir dosyaya BAĞLANIRKEN (oluşturma ya da dosya bağının DEĞİŞMESİ) aktör dosyayı görebilmelidir
 *     (`OFFICE_CASE_VIEW_SCOPE_ENABLED`). Kapsam dışı dosya, var olmayan dosyayla AYNI 400 gövdesini alır (varlık sızmaz).
 *     Bayrak kapalı → bugünkü davranış (yalnız kiracı sınırı) korunur ve karakterize edilir.
 *  3. Dosya bağı DEĞİŞMEYEN güncelleme dosya kapsamına takılmaz (atanan, görmediği dosyaya bağlı görevini düzenlemeyi sürdürür);
 *     bağın kaldırılması (`caseId: null`) kapsam istemez.
 *  4. VIEWER görev oluşturamaz (mevcut `ViewerWriteDenyGuard`); ADMIN rolü tek başına dosya kapsamı üretmez (D1 kuralı).
 * Gerçek HTTP (TaskModule + ValidationPipe) + tek kullanımlık PostgreSQL; JWT yerine DB kimliği. Dünya: test/p3-scope-world.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Task case-bound spec requires TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

describeDb("F03-B2 — dosyaya bağlı görev: oluşturma kapsamı + dosya süzgeci (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(300_000);
  const taskFlag = scopeFlag(TASK_VIEW_SCOPE_FLAG);
  const caseFlag = scopeFlag(CASE_VIEW_SCOPE_FLAG);
  let db: PrismaClient;
  let app: INestApplication;
  let w: ScopeWorld;
  const http = scopeHttp(() => app);
  const put = (actor: string, path: string, body: object) => request(app.getHttpServer()).put(path).set("x-test-user-id", actor).send(body);
  const INVALID_CASE = { statusCode: 400, message: "Geçersiz dosya: aynı ofise ait bir dosya değil.", error: "Bad Request" } as const;
  const seeded = { c4a: "", c4b: "", c6: "", none: "", b1: "", nobodyOwn: "", c4AssignedNobody: "" };
  const title = (k: string) => `F03B2-${k}-${w.suffix}`;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    app = await buildScopeApp(() => db, [TaskModule]);
    w = await createScopeWorld(db, "f03b2");
    const mk = async (key: string, tenantId: string, data: Record<string, unknown>) =>
      (await db.task.create({ data: { tenantId, title: title(key), ...data } as never })).id;
    seeded.c4a = await mk("c4a", w.tA, { caseId: w.c.c4, status: "PENDING", createdById: w.u.link });
    seeded.c4b = await mk("c4b", w.tA, { caseId: w.c.c4, status: "COMPLETED", createdById: w.u.link });
    seeded.c6 = await mk("c6", w.tA, { caseId: w.c.c6, status: "IN_PROGRESS", createdById: w.u.admin });
    seeded.none = await mk("none", w.tA, { status: "PENDING", createdById: w.u.admin });
    seeded.b1 = await mk("b1", w.tB, { caseId: w.c.b1, status: "PENDING", createdById: w.v.allow });
    seeded.nobodyOwn = await mk("nobodyOwn", w.tA, { status: "PENDING", createdById: w.u.nobody });
    seeded.c4AssignedNobody = await mk("c4AssignedNobody", w.tA, { caseId: w.c.c4, status: "PENDING", createdById: w.u.link, assigneeId: w.u.nobody });
  });

  afterAll(async () => {
    taskFlag.restore();
    caseFlag.restore();
    await app?.close();
    await w?.cleanup(async (tenants) => {
      await db.taskHistoryEvent.deleteMany({ where: { tenantId: { in: tenants } } }).catch(() => undefined); // F03-A2: geçmiş satırları göreve Restrict FK ile bağlı → görevden önce silinir
      await db.task.deleteMany({ where: { tenantId: { in: tenants } } }).catch(() => undefined);
    });
    await db.$disconnect();
  });

  const flags = (task: boolean, kase: boolean) => {
    if (task) taskFlag.on();
    else taskFlag.off();
    if (kase) caseFlag.on();
    else caseFlag.off();
  };
  const listByCase = async (actor: string, caseId: string, extra = "") => {
    const res = await http.get(actor, `/tasks?caseId=${caseId}&limit=100${extra}`);
    expect(res.status).toBe(200);
    return { ids: (res.body.data as Array<{ id: string }>).map((r) => r.id).sort(), total: res.body.meta.total as number, summary: res.body.meta.summary };
  };
  const countByTitle = (key: string) => db.task.count({ where: { title: title(key) } });

  describe("iki bayrak KAPALI — dosya süzgeci + bugünkü oluşturma davranışı", () => {
    beforeAll(() => flags(false, false));

    it("GET /tasks?caseId= yalnız o dosyanın görevlerini döner; total ve summary aynı kapsamda", async () => {
      const r = await listByCase(w.u.nobody, w.c.c4);
      expect(r.ids).toEqual([seeded.c4a, seeded.c4b, seeded.c4AssignedNobody].sort());
      expect(r.total).toBe(3);
      expect(r.summary).toEqual({ pending: 2, inProgress: 0, operationalOpen: 0 });
    });

    it("dosya süzgeci durum süzgeciyle kesişir; summary durum süzgecinden bağımsız kalır (F01-A sözleşmesi)", async () => {
      const r = await listByCase(w.u.nobody, w.c.c4, "&status=COMPLETED");
      expect(r.ids).toEqual([seeded.c4b]);
      expect(r.total).toBe(1);
      expect(r.summary).toEqual({ pending: 2, inProgress: 0, operationalOpen: 0 });
    });

    it("başka büronun ya da var olmayan dosyanın kimliği boş sonuçtur (200; varlık sızmaz)", async () => {
      for (const caseId of [w.c.b1, w.missing]) {
        expect(await listByCase(w.u.nobody, caseId)).toEqual({ ids: [], total: 0, summary: { pending: 0, inProgress: 0, operationalOpen: 0 } });
      }
    });

    it("dosyadan oluşturma: caseId dolu görev oluşur, oluşturan kaydedilir ve dosya süzgecinde görünür", async () => {
      const res = await http.post(w.u.link, "/tasks", { title: title("yeni-link"), caseId: w.c.c4, priority: "HIGH" });
      expect(res.status).toBe(201);
      expect([res.body.caseId, res.body.createdById, res.body.status, res.body.assigneeId]).toEqual([w.c.c4, w.u.link, "PENDING", null]);
      expect((await listByCase(w.u.link, w.c.c4)).ids).toContain(res.body.id);
    });

    it("karakterizasyon: bayrak kapalıyken dosyada ilişkisi olmayan kullanıcı da dosyaya görev açabilir (yalnız kiracı sınırı)", async () => {
      const res = await http.post(w.u.nobody, "/tasks", { title: title("kapali-nobody"), caseId: w.c.c6 });
      expect(res.status).toBe(201);
    });

    it("başka büronun dosyasına görev açılamaz (400) ve satır oluşmaz", async () => {
      const res = await http.post(w.u.link, "/tasks", { title: title("baska-buro"), caseId: w.c.b1 });
      expect([res.status, res.body]).toEqual([400, INVALID_CASE]);
      expect(await countByTitle("baska-buro")).toBe(0);
    });

    it("VIEWER görev oluşturamaz (dosyada avukat ilişkisi olsa bile) ve satır oluşmaz", async () => {
      const res = await http.post(w.u.viewer, "/tasks", { title: title("viewer"), caseId: w.c.c4 });
      expect(res.status).toBe(403);
      expect(await countByTitle("viewer")).toBe(0);
    });
  });

  describe("dosya görünüm kapsamı AÇIK — görev yalnız aktörün gördüğü dosyaya bağlanır", () => {
    beforeAll(() => flags(false, true));

    it("ilişkili avukat ve büro geneli dosya izni olan kullanıcı dosyaya görev açar", async () => {
      expect((await http.post(w.u.link, "/tasks", { title: title("acik-link"), caseId: w.c.c4 })).status).toBe(201);
      expect((await http.post(w.u.allow, "/tasks", { title: title("acik-allow"), caseId: w.c.c6 })).status).toBe(201);
    });

    it("kapsam dışı dosya, var olmayan dosyayla AYNI 400 gövdesini alır; satır oluşmaz", async () => {
      const hidden = await http.post(w.u.nobody, "/tasks", { title: title("acik-nobody"), caseId: w.c.c4 });
      const missing = await http.post(w.u.nobody, "/tasks", { title: title("acik-yok"), caseId: w.missing });
      expect([hidden.status, hidden.body]).toEqual([400, INVALID_CASE]);
      expect(missing.body).toEqual(hidden.body);
      expect(await countByTitle("acik-nobody")).toBe(0);
      expect(await countByTitle("acik-yok")).toBe(0);
    });

    it("ADMIN rolü tek başına dosya kapsamı üretmez: ilişkisiz ADMIN dosyaya görev açamaz", async () => {
      const res = await http.post(w.u.admin, "/tasks", { title: title("acik-admin"), caseId: w.c.c4 });
      expect([res.status, res.body]).toEqual([400, INVALID_CASE]);
      expect(await countByTitle("acik-admin")).toBe(0);
    });

    it("dosyasız görev oluşturma kapsamdan etkilenmez", async () => {
      expect((await http.post(w.u.nobody, "/tasks", { title: title("acik-dosyasiz") })).status).toBe(201);
    });

    it("dosya bağının DEĞİŞMESİ de kapsam ister: kendi dosyasız görevini görmediği dosyaya bağlayamaz", async () => {
      const res = await put(w.u.nobody, `/tasks/${seeded.nobodyOwn}`, { caseId: w.c.c4 });
      expect([res.status, res.body]).toEqual([400, INVALID_CASE]);
      expect((await db.task.findUnique({ where: { id: seeded.nobodyOwn } }))?.caseId).toBeNull();
    });

    it("dosya bağı DEĞİŞMEYEN güncelleme kapsamda takılmaz; bağın kaldırılması kapsam istemez", async () => {
      const same = await put(w.u.nobody, `/tasks/${seeded.c4AssignedNobody}`, { title: title("c4AssignedNobody-duzenlendi"), caseId: w.c.c4 });
      expect(same.status).toBe(200);
      expect((await db.task.findUnique({ where: { id: seeded.c4AssignedNobody } }))?.title).toBe(title("c4AssignedNobody-duzenlendi"));
      const unlink = await put(w.u.nobody, `/tasks/${seeded.c4AssignedNobody}`, { caseId: null });
      expect(unlink.status).toBe(200);
      expect((await db.task.findUnique({ where: { id: seeded.c4AssignedNobody } }))?.caseId).toBeNull();
      await db.task.update({ where: { id: seeded.c4AssignedNobody }, data: { caseId: w.c.c4, title: title("c4AssignedNobody") } });
    });
  });

  describe("görev görünüm kapsamı AÇIK — dosya süzgeci kapsamı GENİŞLETMEZ", () => {
    beforeAll(() => flags(true, true));

    it("dosyada ilişkisi olan avukat dosyanın görevlerini görür; ilişkisiz kullanıcı yalnız kendisine atananı görür", async () => {
      const link = await listByCase(w.u.link, w.c.c4);
      expect(link.ids).toEqual(expect.arrayContaining([seeded.c4a, seeded.c4b, seeded.c4AssignedNobody]));
      const nobody = await listByCase(w.u.nobody, w.c.c4);
      expect(nobody.ids).toEqual([seeded.c4AssignedNobody]);
      expect(nobody.total).toBe(1);
    });

    it("ilişkisiz ve atanmamış kullanıcı için dosya süzgeci boş sonuçtur (200; sıfır sayaçlar)", async () => {
      expect(await listByCase(w.u.resp, w.c.c4)).toEqual({ ids: [], total: 0, summary: { pending: 0, inProgress: 0, operationalOpen: 0 } });
    });
  });
});
