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
import { CaseViewScopeService } from "../../case/case-view-scope.service";
import { TaskModule } from "../task.module";
import { TaskService } from "../task.service";
import { TASK_VIEW_ALL_KEY, TASK_VIEW_SCOPE_FLAG } from "../task-view-scope";

/**
 * F02 P3 tarama S10 (owner kararı 09.11.2026) — tek görev okuması `GET /tasks/:id`:
 *  1. listeyle AYNI görev görünüm kapsamına bağlıdır (`OFFICE_TASK_VIEW_SCOPE_ENABLED`); kapsam dışı görev var olmayanla aynı 404;
 *  2. yanıta gömülen dosya nesnesi yalnız dosya aktöre görünürse döner (`OFFICE_CASE_VIEW_SCOPE_ENABLED`) — görev erişimi dosya
 *     erişimi ÜRETMEZ. Aynı kural listedeki gömülü dosya özetine de uygulanır (aynı yanıt alanı).
 * İki kapsam AYRI bayrak ve AYRI izin anahtarıdır; farklı sonuç doğuran durumlar burada açıkça ölçülür:
 *  - görev atanmış ama dosyada ilişkisi yok → görev görünür, dosya gömülmez;
 *  - dosyada büro geneli izin (`office.cases.view_all`) var ama görevle ilişkisi yok → görev görünmez;
 *  - görevde büro geneli izin (`office.tasks.view_all`) var ama dosyada ilişkisi yok → görev görünür, dosya gömülmez.
 * Gerçek HTTP (TaskModule + ValidationPipe) + tek kullanımlık PostgreSQL; JWT yerine DB kimliği. Yazım uçları değişmez.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Task single read scope requires TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

describeDb("F02 P3 tarama S10 — tek görev okuması görev kapsamı + gömülü dosya görünürlüğü (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(300_000);
  const taskFlag = scopeFlag(TASK_VIEW_SCOPE_FLAG);
  const caseFlag = scopeFlag(CASE_VIEW_SCOPE_FLAG);
  let db: PrismaClient;
  let app: INestApplication;
  let w: ScopeWorld;
  const http = scopeHttp(() => app);
  const t = { c4Assigned: "", c6Created: "", c4Other: "", noCase: "", c3Other: "", b1: "", writeOff: "", writeOn: "" };
  let both = "";
  const title = (k: string) => `GOREV-${k}-${w.suffix}`;
  const TASK_NOT_FOUND = { statusCode: 404, message: "Görev bulunamadı", error: "Not Found" } as const;
  const A_TASKS = ["c4Assigned", "c6Created", "c4Other", "noCase", "c3Other"] as const;
  const caseOf: Record<(typeof A_TASKS)[number], "c4" | "c6" | "c3" | null> = { c4Assigned: "c4", c6Created: "c6", c4Other: "c4", noCase: null, c3Other: "c3" };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    app = await buildScopeApp(() => db, [TaskModule]);
    w = await createScopeWorld(db, "task1");
    both = (await db.user.create({ data: { tenantId: w.tA, email: `task1-both-${w.suffix}@example.test`, name: "both", surname: "P3", role: "USER" } })).id;

    const mk = async (key: string, tenantId: string, data: Record<string, unknown>) =>
      (await db.task.create({ data: { tenantId, title: title(key), ...data } as never })).id;
    t.c4Assigned = await mk("c4Assigned", w.tA, { caseId: w.c.c4, assigneeId: w.u.nobody, createdById: w.u.admin }); // atanan: dosyada ilişkisiz
    t.c6Created = await mk("c6Created", w.tA, { caseId: w.c.c6, assigneeId: w.u.admin, createdById: w.u.link }); // oluşturan: c6'da ilişkisiz
    t.c4Other = await mk("c4Other", w.tA, { caseId: w.c.c4, assigneeId: w.u.admin, createdById: w.u.admin }); // yalnız dosya bağıyla (link)
    t.noCase = await mk("noCase", w.tA, { assigneeId: w.u.staff, createdById: w.u.admin }); // dosyasız
    t.c3Other = await mk("c3Other", w.tA, { caseId: w.c.c3, assigneeId: w.u.admin, createdById: w.u.admin }); // c3: yalnız oluşturan (creator) görür — görev kapsamında DEĞİL
    t.b1 = await mk("b1", w.tB, { caseId: w.c.b1, assigneeId: w.v.nobody, createdById: w.v.allow });
    t.writeOff = await mk("writeOff", w.tA, { caseId: w.c.c6, assigneeId: w.u.admin, createdById: w.u.admin });
    t.writeOn = await mk("writeOn", w.tA, { caseId: w.c.c6, assigneeId: w.u.admin, createdById: w.u.admin });

    const grant = (subjectUserId: string, permissionKey: string) =>
      db.permissionGrant.create({ data: { tenantId: w.tA, subjectUserId, permissionKey, effect: "ALLOW", scope: "GLOBAL" } });
    await grant(w.u.creator, TASK_VIEW_ALL_KEY); // görevde büro geneli; dosyada yalnız c3'ü görür
    await grant(both, TASK_VIEW_ALL_KEY);
    await grant(both, "office.cases.view_all");
  });

  afterAll(async () => {
    taskFlag.restore();
    caseFlag.restore();
    await app?.close();
    await w?.cleanup(async (tenants) => {
      await db.task.deleteMany({ where: { tenantId: { in: tenants } } }).catch(() => undefined);
    });
    await db.$disconnect();
  });

  const one = (actor: string, id: string) => http.get(actor, `/tasks/${id}`);
  const listIds = async (actor: string) => ((await http.get(actor, "/tasks?limit=100")).body.data as Array<{ id: string }>).map((row) => row.id);
  const flags = (task: boolean, kase: boolean) => {
    if (task) taskFlag.on();
    else taskFlag.off();
    if (kase) caseFlag.on();
    else caseFlag.off();
  };
  const actors = () => ({ nobody: w.u.nobody, link: w.u.link, staff: w.u.staff, creator: w.u.creator, allow: w.u.allow, admin: w.u.admin, both });

  describe("iki bayrak KAPALI — bugünkü davranış (karakterizasyon)", () => {
    beforeAll(() => flags(false, false));

    it("ilişkisiz kullanıcı kiracının her görevini okur; yanıt dosya kaydını bütün alanlarıyla gömer", async () => {
      for (const key of A_TASKS) {
        const res = await one(w.u.nobody, t[key]);
        expect([key, res.status, res.body.title]).toEqual([key, 200, title(key)]);
        const k = caseOf[key];
        if (k) expect([res.body.case.id, res.body.case.fileNumber, res.body.case.tenantId]).toEqual([w.c[k], w.fileNo(k), w.tA]);
        else expect(res.body.case).toBeNull();
      }
    });

    it("kiracı sınırı bayraktan bağımsız: büro A kullanıcısı büro B görevini okuyamaz; yok = aynı gövde", async () => {
      expect((await one(w.u.nobody, t.b1)).body).toEqual(TASK_NOT_FOUND);
      expect((await one(w.u.nobody, w.missing)).body).toEqual(TASK_NOT_FOUND);
    });
  });

  describe("görev bayrağı AÇIK, dosya bayrağı KAPALI — tek okuma listeyle aynı kapsamda", () => {
    beforeAll(() => flags(true, false));
    afterAll(() => flags(false, false));

    it("her aktör için: tek okuma 200 ⇔ görev listede; kapsam dışı görev var olmayanla aynı 404 (başlık / dosya sızmaz)", async () => {
      for (const [label, actor] of Object.entries(actors())) {
        const inList = new Set(await listIds(actor));
        for (const key of A_TASKS) {
          const res = await one(actor, t[key]);
          if (inList.has(t[key])) expect([label, key, res.status, res.body.id]).toEqual([label, key, 200, t[key]]);
          else {
            expect([label, key, res.status, res.body]).toEqual([label, key, 404, TASK_NOT_FOUND]);
            expect(JSON.stringify(res.body)).not.toContain(title(key));
          }
        }
      }
    });

    it("beklenen kapsam: atanan / oluşturan / dosya bağı / görev büro geneli izni; dosya büro geneli izni ve ADMIN rolü görev kapsamı ÜRETMEZ", async () => {
      const visible = async (actor: string) => {
        const out: string[] = [];
        for (const key of A_TASKS) if ((await one(actor, t[key])).status === 200) out.push(key);
        return out;
      };
      expect(await visible(w.u.nobody)).toEqual(["c4Assigned"]); // atanan
      expect(await visible(w.u.link)).toEqual(["c4Assigned", "c6Created", "c4Other"]); // c4 dosya bağı + oluşturduğu
      expect(await visible(w.u.staff)).toEqual(["noCase"]); // dosyasız: yalnız atanan
      expect(await visible(w.u.creator)).toEqual([...A_TASKS]); // office.tasks.view_all
      expect(await visible(w.u.allow)).toEqual([]); // office.cases.view_all görev kapsamı üretmez
      expect(await visible(w.u.resp)).toEqual([]);
    });

    it("dosya bayrağı kapalıyken gömülü dosya bugünkü gibi döner (görev kapsamındaki aktör için)", async () => {
      const res = await one(w.u.nobody, t.c4Assigned);
      expect([res.status, res.body.case.fileNumber]).toEqual([200, w.fileNo("c4")]);
    });

    it("büro B kullanıcısı büro A görevini okuyamaz", async () => {
      expect((await one(w.v.allow, t.c4Assigned)).body).toEqual(TASK_NOT_FOUND);
    });
  });

  describe("dosya bayrağı AÇIK — görev erişimi dosya erişimi üretmez", () => {
    afterAll(() => flags(false, false));

    it("görev bayrağı kapalı: görev okunur; gömülü dosya yalnız dosya aktöre görünürse döner, görevin kendi alanları değişmez", async () => {
      flags(false, true);
      const scope = app.get(CaseViewScopeService);
      for (const [label, actor] of Object.entries(actors())) {
        for (const key of A_TASKS) {
          const res = await one(actor, t[key]);
          expect([label, key, res.status, res.body.title]).toEqual([label, key, 200, title(key)]);
          const k = caseOf[key];
          if (!k) {
            expect(res.body.case).toBeNull();
            continue;
          }
          expect(res.body.caseId).toBe(w.c[k]); // görevin kendi sütunu
          if (await scope.isCaseVisible(w.tA, actor, w.c[k])) expect([label, key, res.body.case?.fileNumber]).toEqual([label, key, w.fileNo(k)]);
          else {
            expect([label, key, res.body.case]).toEqual([label, key, null]);
            expect(JSON.stringify(res.body)).not.toContain(w.fileNo(k));
          }
        }
      }
    });

    it("iki bayrak açık: atanan görevi okur ama dosyayı göremez (dosya gömülmez); dosya bağı olan görevi dosyasıyla okur", async () => {
      flags(true, true);
      const assigned = await one(w.u.nobody, t.c4Assigned);
      expect([assigned.status, assigned.body.case, assigned.body.caseId]).toEqual([200, null, w.c.c4]);
      expect(JSON.stringify(assigned.body)).not.toContain(w.fileNo("c4"));
      await expect(app.get(CaseViewScopeService).isCaseVisible(w.tA, w.u.nobody, w.c.c4)).resolves.toBe(false);

      const linked = await one(w.u.link, t.c4Other);
      expect([linked.status, linked.body.case.fileNumber]).toEqual([200, w.fileNo("c4")]);
      const created = await one(w.u.link, t.c6Created); // oluşturduğu görev; c6 dosyasında ilişkisi yok
      expect([created.status, created.body.case]).toEqual([200, null]);
    });

    it("iki bayrak açık: görevde büro geneli izin dosya erişimi üretmez; dosyada büro geneli izin görev erişimi üretmez", async () => {
      flags(true, true);
      const taskAll = await one(w.u.creator, t.c4Other);
      expect([taskAll.status, taskAll.body.case]).toEqual([200, null]);
      const ownCase = await one(w.u.creator, t.c3Other);
      expect([ownCase.status, ownCase.body.case.fileNumber]).toEqual([200, w.fileNo("c3")]);
      expect((await one(w.u.allow, t.c4Other)).body).toEqual(TASK_NOT_FOUND);
    });

    it("liste aynı kuralı uygular: görünmeyen dosyanın özeti (dosya no) listede gömülmez; sayım ve sayfalama değişmez", async () => {
      flags(true, true);
      const res = await http.get(w.u.link, "/tasks?limit=100");
      const rows = res.body.data as Array<{ id: string; caseId: string | null; case: { fileNumber: string } | null }>;
      expect(rows.map((row) => row.id).sort()).toEqual([t.c4Assigned, t.c6Created, t.c4Other].sort());
      expect(res.body.meta.total).toBe(3);
      const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
      expect(byId[t.c4Other].case?.fileNumber).toBe(w.fileNo("c4"));
      expect([byId[t.c6Created].case, byId[t.c6Created].caseId]).toEqual([null, w.c.c6]);
      expect(JSON.stringify(res.body)).not.toContain(w.fileNo("c6"));
    });

    it("iki bayrak kapalı ilişkisiz kullanıcı = iki bayrak açık iki izinli kullanıcı (gövde eşitliği)", async () => {
      for (const key of A_TASKS) {
        flags(false, false);
        const before = await one(w.u.nobody, t[key]);
        flags(true, true);
        const after = await one(both, t[key]);
        expect([key, after.status]).toEqual([key, 200]);
        expect(after.body).toEqual(before.body);
      }
    });
  });

  describe("eksik bağlam ve yazım uçları", () => {
    afterAll(() => flags(false, false));

    it("kimlik yok → 401; görev bayrağı açık + aktör yok → 403 TASK_VIEW_SCOPE_UNRESOLVED; dosya bayrağı açık + aktör yok → 403 CASE_VIEW_SCOPE_UNRESOLVED", async () => {
      flags(true, true);
      expect((await http.anonymous(`/tasks/${t.c4Assigned}`)).status).toBe(401);
      const service = app.get(TaskService);
      await expect(service.findOneForActor(w.tA, t.c4Assigned, undefined as never)).rejects.toMatchObject({ response: { code: "TASK_VIEW_SCOPE_UNRESOLVED" } });
      flags(false, true);
      await expect(service.findOneForActor(w.tA, t.c4Assigned, undefined as never)).rejects.toMatchObject({ response: { code: "CASE_VIEW_SCOPE_UNRESOLVED" } });
    });

    it("yazım değişmez: görev kapsamı dışındaki kullanıcının güncellemesi bayrak açıkken de bugünkü sonucu verir; VIEWER 403", async () => {
      const put = (actor: string, id: string) => request(app.getHttpServer()).put(`/tasks/${id}`).set("x-test-user-id", actor).send({ description: "karakterizasyon" });
      flags(false, false);
      const before = await put(w.u.nobody, t.writeOff);
      flags(true, true);
      const after = await put(w.u.nobody, t.writeOn);
      expect(after.status).toBe(before.status);
      expect(after.status).not.toBe(404);
      const viewer = await put(w.u.viewer, t.writeOn);
      expect(viewer.status).toBe(403);
      expect(JSON.stringify(viewer.body)).not.toContain("VIEW_SCOPE");
    });
  });
});
