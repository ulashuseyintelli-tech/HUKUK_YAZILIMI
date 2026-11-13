// Belge modülleri grafiği pdf-poppler'a uzanabilir; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { INestApplication } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import * as request from "supertest";
import { A_CASE_KEYS, ACaseKey, ScopeWorld, buildScopeApp, createScopeWorld, expectHiddenResponse, scopeFlag, scopeHttp } from "../../../../test/p3-scope-world";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { CaseViewScopeModule } from "../../case/case-view-scope.module";
import { CaseViewScopeService } from "../../case/case-view-scope.service";
import { ExpenseBlockReasonModule } from "../../expense-block-reason/expense-block-reason.module";
import { ExpenseNotificationService } from "../expense-notification.service";
import { ExpenseRequestModule } from "../expense-request.module";
import { ExpenseRequestService } from "../expense-request.service";
import { ExpenseViewService } from "../expense-view.service";
import { ClientSettlementReadService } from "../../client-settlement/client-settlement-read.service";
import { linkClient } from "../../../../test/client-currency-fixture";

/**
 * F02 P3 tarama S2 (owner kararı 09.11.2026) — MEVCUT masraf görünüm kapsamı (OFFICE_EXPENSE_VIEW_SCOPE_ENABLED;
 * `office.expenses.view_all`) liste ve istatistiğin yanında tek kayıt, dosya listesi, dosya özetleri ve kuyruklara tutarlı uygulanır.
 * Yeni kural / anahtar / bayrak YOK. Bu uçlar P3 dosya görünüm bayrağına DEĞİL masraf bayrağına bağlıdır.
 *
 * Kural (expense-view-scope.ts): büro geneli izin (ALLOW) → hepsi; yoksa aktörün OLUŞTURDUĞU / ONAYLADIĞI talepler ∪ aktörün
 * CaseLawyer ya da CaseStaff(canView) olduğu dosyaların talepleri.
 *  - Satır okumaları (tek kayıt, dosya listesi, kuyruklar) bu kuralla süzülür; kapsam dışı tek kayıt = var olmayan (404).
 *  - Dosyanın BÜTÜN taleplerinden üretilen okumalar (özet, ayrıntı, üç görünüm, finans kalemleri, açılış durumu, masraf kapısı,
 *    engel nedenleri) büro geneli izin ya da dosya bağı ister; yalnız kendi talebini gören aktör eksik taleplerle özet alamaz (404).
 *  - Onaylama yetkisi / ADMIN rolü büro geneli görüntüleme izni SAYILMAZ.
 * Masraf kapsamı ile P3 dosya kapsamının FARKLI sonuç verdiği durumlar aşağıda açıkça ölçülür.
 * Gerçek HTTP + tek kullanımlık PostgreSQL. Kod okuması gerçek erişim kanıtı değildir.
 *
 * Talepler: her büro A dosyasında yöneticinin oluşturduğu bir talep (T-c1 … T-c6); ek olarak c6'da `creator`ın oluşturduğu
 * (T-own) ve c1'de `noView`ın onayladığı (T-appr) birer talep. Büro geneli masraf izni: `expAll`.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Expense read scope requires TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

describeDb("F02 P3 tarama S2 — masraf okuma uçlarında masraf görünüm kapsamı (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(600_000);
  const flag = scopeFlag("OFFICE_EXPENSE_VIEW_SCOPE_ENABLED");
  const p3 = scopeFlag();
  let db: PrismaClient;
  let app: INestApplication;
  let w: ScopeWorld;
  const http = scopeHttp(() => app);
  const req = {} as Record<string, string>; // T-c1 … T-c6, own, appr, b1
  const block = {} as Record<string, string>;
  const client = {} as Record<string, string>;
  let expAll = "";
  let expAllB = "";
  const amount = (k: string) => 300 + ["c1", "c3", "c4", "c5", "c6", "own", "appr", "b1"].indexOf(k) * 17;
  const REQ_NOT_FOUND = { statusCode: 404, message: "Masraf talebi bulunamadı", error: "Not Found" } as const;
  const CASE_EXPENSE_NOT_FOUND = { statusCode: 404, message: "Takip bulunamadı", error: "Not Found" } as const;
  const ids = (res: request.Response) => (res.body as Array<{ id: string }>).map((x) => x.id).sort();
  const sorted = (keys: string[]) => keys.map((k) => req[k]).sort();

  /** Masraf kapsamında aktör → [görebildiği talepler, bütününü görebildiği dosyalar]. */
  const EXPECT: Array<[string, () => string, string[], ACaseKey[]]> = [
    ["büro geneli masraf izni (ALLOW)", () => expAll, ["c1", "c3", "c4", "c5", "c6", "own", "appr"], ["c1", "c3", "c4", "c5", "c6"]],
    ["CaseLawyer (c4)", () => w.u.link, ["c4"], ["c4"]],
    ["CaseStaff canView (c5)", () => w.u.staff, ["c5"], ["c5"]],
    ["talebi oluşturan (dosya bağı yok)", () => w.u.creator, ["own"], []],
    ["talebi onaylayan + CaseStaff canView=false (c6)", () => w.u.noView, ["appr"], []],
    ["Dosya Sorumlusu (c1; CaseLawyer değil)", () => w.u.resp, [], []],
    ["büro geneli DOSYA izni (masraf izni değil)", () => w.u.allow, [], []],
    ["ADMIN rolü (izin / ilişki yok; talepleri oluşturan)", () => w.u.admin, ["c1", "c3", "c4", "c5", "c6", "appr"], []],
    ["ilişkisiz", () => w.u.nobody, [], []],
  ];

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    app = await buildScopeApp(() => db, [ExpenseRequestModule, ExpenseBlockReasonModule, CaseViewScopeModule]);
    w = await createScopeWorld(db, "exp");
    const mkUser = async (tenantId: string, key: string) =>
      (await db.user.create({ data: { tenantId, email: `exp-${key}-${w.suffix}@example.test`, name: key, surname: "P3", role: "USER" } })).id;
    expAll = await mkUser(w.tA, "expall");
    expAllB = await mkUser(w.tB, "expallb");
    for (const [tenantId, subjectUserId] of [[w.tA, expAll], [w.tB, expAllB]]) {
      await db.permissionGrant.create({ data: { tenantId, subjectUserId, permissionKey: "office.expenses.view_all", effect: "ALLOW", scope: "GLOBAL" } as never });
    }
    for (const tenantId of [w.tA, w.tB]) client[tenantId] = (await db.client.create({ data: { tenantId, type: "COMPANY", name: `MUVEKKIL-${w.suffix}` } as never })).id;
    const mk = async (key: string, tenantId: string, caseId: string, createdById: string, approvedById?: string) =>
      (req[key] = (
        await db.expenseRequest.create({
          data: { tenantId, caseId, clientId: client[tenantId], totalAmount: amount(key), createdById, ...(approvedById ? { approvedById } : {}), status: "SENT", dueDate: new Date("2026-01-01T00:00:00.000Z") } as never,
        })
      ).id);
    for (const k of A_CASE_KEYS) await mk(k, w.tA, w.c[k], w.u.admin);
    await mk("own", w.tA, w.c.c6, w.u.creator);
    await mk("appr", w.tA, w.c.c1, w.u.admin, w.u.noView);
    await mk("b1", w.tB, w.c.b1, w.v.allow);
    for (const k of [...A_CASE_KEYS, "b1"] as const) {
      block[k] = (
        await db.expenseBlockReason.create({ data: { tenantId: k === "b1" ? w.tB : w.tA, caseId: w.c[k], blockedActionCode: `ENGEL-${k}-${w.suffix}`, reasonCode: "OTHER", createdById: k === "b1" ? w.v.allow : w.u.admin } as never })
      ).id;
    }
  });

  afterAll(async () => {
    flag.restore();
    p3.restore();
    await w.cleanup(async (tenantIds) => {
      for (const tenantId of tenantIds) {
        await db.expenseBlockReason.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.expenseRequest.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.client.deleteMany({ where: { tenantId } }).catch(() => undefined);
      }
    });
    await app?.close();
    await db.$disconnect();
  });

  // dosyanın bütün taleplerinden üretilen okumalar
  const CASE_READS: Array<[string, (caseId: string) => string]> = [
    ["GET expense-requests/case/:caseId/summary", (c) => `/expense-requests/case/${c}/summary`],
    ["GET expense-requests/case/:caseId/details", (c) => `/expense-requests/case/${c}/details`],
    ["GET expense-requests/case/:caseId/three-view", (c) => `/expense-requests/case/${c}/three-view`],
    ["GET expense-requests/case/:caseId/finance-items", (c) => `/expense-requests/case/${c}/finance-items`],
    ["GET expense-requests/case/:caseId/opening-status", (c) => `/expense-requests/case/${c}/opening-status`],
    ["GET expense-requests/case/:caseId/gate-status", (c) => `/expense-requests/case/${c}/gate-status`],
    ["GET expense-requests/case/:caseId/can-perform/:actionType", (c) => `/expense-requests/case/${c}/can-perform/TEBLIGAT`],
    ["GET expense-requests/case/:caseId/gate-summary", (c) => `/expense-requests/case/${c}/gate-summary`],
    ["GET expense-block-reasons/case/:caseId", (c) => `/expense-block-reasons/case/${c}`],
  ];
  const ROW_READS: Array<[string, (id: string) => string]> = [
    ["GET expense-requests/:id", (id) => `/expense-requests/${id}`],
    ["GET expense-requests/:id/three-view", (id) => `/expense-requests/${id}/three-view`],
  ];

  describe("bayrak KAPALI — bugünkü davranış (büro geneli)", () => {
    beforeAll(() => {
      flag.off();
      p3.off();
    });

    it.each(CASE_READS)("%s: ilişkisiz kullanıcı kiracının her dosyasında yanıt alır (kapsam uygulanmaz)", async (_n, path) => {
      const statuses = new Set<number>();
      for (const k of A_CASE_KEYS) {
        const res = await http.get(w.u.nobody, path(w.c[k]));
        statuses.add(res.status);
        expect([k, res.body]).not.toEqual([k, CASE_EXPENSE_NOT_FOUND]);
      }
      expect([...statuses]).toEqual([200]);
    });

    it.each(ROW_READS)("%s: ilişkisiz kullanıcı kiracının her talebini okur", async (_n, path) => {
      for (const k of ["c1", "c6", "own", "appr"]) expect([k, (await http.get(w.u.nobody, path(req[k]))).status]).toEqual([k, 200]);
    });

    it("dosya listesi ve müvekkil talepleri büro genelidir; kiracı sınırı bayraktan bağımsızdır", async () => {
      expect(ids(await http.get(w.u.nobody, `/expense-requests/by-case/${w.c.c6}`))).toEqual(sorted(["c6", "own"]));
      const byClient = await http.get(w.u.nobody, `/expense-requests/client/${client[w.tA]}/requests`);
      expect([byClient.status, (byClient.body as unknown[]).length]).toEqual([200, 7]);
      expect(ids(await http.get(w.u.nobody, `/expense-requests/by-case/${w.c.b1}`))).toEqual([]);
      expect((await http.get(w.u.nobody, `/expense-requests/${req.b1}`)).body).toEqual(REQ_NOT_FOUND);
    });
  });

  describe("bayrak AÇIK — masraf kapsamı", () => {
    beforeAll(() => {
      flag.on();
      p3.off(); // P3 dosya bayrağı kapalıyken de uygulanır: bu uçlar masraf bayrağına bağlıdır
    });
    afterAll(() => flag.off());

    it.each(ROW_READS)("%s: yalnız kapsamdaki talep okunur; kapsam dışı = var olmayan = başka büro (aynı 404)", async (_n, path) => {
      for (const [label, actor, visible] of EXPECT) {
        for (const k of ["c1", "c3", "c4", "c5", "c6", "own", "appr"]) {
          const res = await http.get(actor(), path(req[k]));
          if (visible.includes(k)) expect([label, k, res.status]).toEqual([label, k, 200]);
          else expectHiddenResponse(res, REQ_NOT_FOUND, [String(amount(k)), req[k], w.fileNo("c6")]);
        }
      }
      const hidden = await http.get(w.u.nobody, path(req.c6));
      expect((await http.get(w.u.nobody, path(w.missing))).body).toEqual(hidden.body);
      // Büro geneli izinli aktörde kapsam süzgeci yoktur: başka büronun talebi handler'ın kendi kiracı sınırına düşer ve var
      // olmayan taleple AYNI yanıtı alır (varlık sızmaz). `:id/three-view` bu durumda bugün de 500 verir (bu PR'dan önce de;
      // servis bulunamayan talep için genel hata fırlatır) — bu teslimin konusu değildir, yalnız eşitlik ölçülür.
      for (const [actor, foreign] of [[expAll, req.b1], [expAllB, req.c1]]) {
        const other = await http.get(actor, path(foreign));
        const missing = await http.get(actor, path(w.missing));
        expect([other.status, other.body]).toEqual([missing.status, missing.body]);
        expect(other.status).not.toBe(200);
      }
    });

    it("GET expense-requests/by-case/:caseId — liste aktörün kapsamındaki taleplerle sınırlı (GET expense-requests ile aynı sonuç)", async () => {
      for (const [label, actor, visible] of EXPECT) {
        for (const [k, inCase] of [["c1", ["c1", "appr"]], ["c4", ["c4"]], ["c6", ["c6", "own"]]] as Array<[ACaseKey, string[]]>) {
          const expected = sorted(inCase.filter((x) => visible.includes(x)));
          const byCase = await http.get(actor(), `/expense-requests/by-case/${w.c[k]}`);
          const list = await http.get(actor(), `/expense-requests?caseId=${w.c[k]}`);
          expect([label, k, byCase.status, ids(byCase)]).toEqual([label, k, 200, expected]);
          expect([label, k, ids(list)]).toEqual([label, k, expected]);
        }
      }
    });

    it("GET expense-requests/client/:clientId/requests — müvekkilin talepleri aktörün kapsamıyla daralır", async () => {
      for (const [label, actor, visible] of EXPECT) {
        const res = await http.get(actor(), `/expense-requests/client/${client[w.tA]}/requests`);
        expect([label, res.status, (res.body as unknown[]).length]).toEqual([label, 200, visible.length]);
        for (const k of ["c1", "c3", "c4", "c5", "c6", "own", "appr"]) expect([label, k, JSON.stringify(res.body).includes(req[k])]).toEqual([label, k, visible.includes(k)]);
      }
      const other = await http.get(expAll, `/expense-requests/client/${client[w.tB]}/requests`);
      expect([other.status, other.body]).toEqual([200, []]);
    });

    it.each(CASE_READS)("%s: büro geneli izin ya da dosya bağı ister; yoksa var olmayan dosyayla aynı 404 (eksik taleplerle özet yok)", async (_n, path) => {
      for (const [label, actor, , cases] of EXPECT) {
        for (const k of A_CASE_KEYS) {
          const res = await http.get(actor(), path(w.c[k]));
          if (cases.includes(k)) expect([label, k, res.status]).toEqual([label, k, 200]);
          else expectHiddenResponse(res, CASE_EXPENSE_NOT_FOUND, [w.fileNo(k), String(amount(k)), `ENGEL-${k}-`]);
        }
      }
      const hidden = await http.get(w.u.nobody, path(w.c.c6));
      expect((await http.get(w.u.nobody, path(w.missing))).body).toEqual(hidden.body);
      expect((await http.get(w.u.link, path(w.c.b1))).body).toEqual(hidden.body); // ilişki–dosya kiracı uyuşmazlığı (link kartı b1'de CaseLawyer satırı taşır)
      // büro geneli izinli: başka büronun dosyası kapıdan geçer ama veri dönmez (handler'ın kendi kiracı sınırı)
      const foreign = await http.get(expAll, path(w.c.b1));
      expect(JSON.stringify(foreign.body)).not.toContain(`ENGEL-b1-`);
      expect(JSON.stringify(foreign.body)).not.toContain(req.b1);
    });

    it("yalnız kendi talebini gören aktör: talebi tek kayıt ve listede görür, dosyanın özetini göremez", async () => {
      expect((await http.get(w.u.creator, `/expense-requests/${req.own}`)).status).toBe(200);
      expect(ids(await http.get(w.u.creator, `/expense-requests/by-case/${w.c.c6}`))).toEqual([req.own]);
      expect((await http.get(w.u.creator, `/expense-requests/case/${w.c.c6}/summary`)).body).toEqual(CASE_EXPENSE_NOT_FOUND);
      expect((await http.get(w.u.creator, `/expense-requests/case/${w.c.c6}/details`)).body).toEqual(CASE_EXPENSE_NOT_FOUND);
    });

    it("onaylama yetkisi / ADMIN rolü büro geneli görüntüleme izni sayılmaz: ADMIN yalnız kendi oluşturduklarını görür, dosya özetini göremez", async () => {
      expect((await http.get(w.u.admin, `/expense-requests/${req.own}`)).body).toEqual(REQ_NOT_FOUND);
      for (const k of A_CASE_KEYS) expect([k, (await http.get(w.u.admin, `/expense-requests/case/${w.c[k]}/summary`)).body]).toEqual([k, CASE_EXPENSE_NOT_FOUND]);
      // onaylayan: onayladığı talebi görür, o dosyanın (c1) bütününü görmez
      expect((await http.get(w.u.noView, `/expense-requests/${req.appr}`)).status).toBe(200);
      expect((await http.get(w.u.noView, `/expense-requests/${req.c1}`)).body).toEqual(REQ_NOT_FOUND);
      expect((await http.get(w.u.noView, `/expense-requests/case/${w.c.c1}/summary`)).body).toEqual(CASE_EXPENSE_NOT_FOUND);
    });

    it("kuyruk servisleri kapsamla daralır; HTTP'de `due-reminders` ve `pending-tasks` bugün `:id` rotasının gölgesindedir", async () => {
      const service = app.get(ExpenseRequestService);
      for (const [label, actor, visible] of EXPECT) {
        const scope = await service.readScopeWhere(w.tA, actor());
        const due = await app.get(ExpenseNotificationService).findDueReminders(w.tA, 2, scope);
        const pending = await app.get(ExpenseViewService).getPendingExpenseTasks(w.tA, scope);
        expect([label, due.map((x) => x.id).sort()]).toEqual([label, sorted(visible)]);
        expect([label, pending.length]).toEqual([label, visible.length]);
      }
      for (const tail of ["due-reminders", "pending-tasks"]) {
        flag.off();
        const before = await http.get(w.u.nobody, `/expense-requests/${tail}`);
        flag.on();
        const after = await http.get(w.u.nobody, `/expense-requests/${tail}`);
        expect([tail, before.status, before.body]).toEqual([tail, 404, REQ_NOT_FOUND]);
        expect([tail, after.body]).toEqual([tail, REQ_NOT_FOUND]);
      }
    });

    it("eksik bağlam fail-closed: aktör çözümlenemezse 403 (liste kapsamıyla aynı gövde)", async () => {
      const service = app.get(ExpenseRequestService);
      const unresolved = { response: { code: "EXPENSE_VIEW_SCOPE_UNRESOLVED" } };
      await expect(service.assertRequestVisible(w.tA, req.c1, undefined)).rejects.toMatchObject(unresolved);
      await expect(service.assertCaseExpensesVisible(w.tA, w.c.c1, undefined)).rejects.toMatchObject(unresolved);
      await expect(service.readScopeWhere(w.tA, undefined)).rejects.toMatchObject(unresolved);
      await expect(service.assertCaseExpensesVisible(w.tA, undefined as never, w.u.link)).rejects.toMatchObject({ status: 404 });
    });

    it("yazım / işlem yolları kapsama bağlanmadı: kapsam dışı aktörün hatırlatma işlemi bayrakla değişmez", async () => {
      flag.off();
      const before = await http.post(w.u.nobody, `/expense-requests/${req.c5}/remind`, {});
      flag.on();
      const after = await http.post(w.u.nobody, `/expense-requests/${req.c5}/remind`, {});
      expect(after.status).toBe(before.status);
      expect(after.body).not.toEqual(REQ_NOT_FOUND);
    });
  });

  describe("masraf kapsamı ile P3 dosya kapsamının FARKLI sonuç verdiği durumlar (iki bayrak da açık)", () => {
    beforeAll(() => {
      flag.on();
      p3.on();
    });
    afterAll(() => {
      flag.off();
      p3.off();
    });
    const summary = async (actor: string, k: ACaseKey) => (await http.get(actor, `/expense-requests/case/${w.c[k]}/summary`)).status;
    const caseVisible = (actor: string, k: ACaseKey) => app.get(CaseViewScopeService).isCaseVisible(w.tA, actor, w.c[k]);

    it("Dosya Sorumlusu: dosyayı görür (P3), dosyanın masraflarını görmez (masraf kapsamında Dosya Sorumlusu dalı yok)", async () => {
      expect([await caseVisible(w.u.resp, "c1"), await summary(w.u.resp, "c1")]).toEqual([true, 404]);
      expect((await http.get(w.u.resp, `/expense-requests/${req.c1}`)).body).toEqual(REQ_NOT_FOUND);
    });

    it("dosyayı oluşturan: dosyayı görür (P3), masraflarını görmez; başka dosyada talebi oluşturan: talebini görür, dosyayı görmez", async () => {
      expect([await caseVisible(w.u.creator, "c3"), await summary(w.u.creator, "c3")]).toEqual([true, 404]);
      expect([await caseVisible(w.u.creator, "c6"), (await http.get(w.u.creator, `/expense-requests/${req.own}`)).status]).toEqual([false, 200]);
    });

    it("büro geneli DOSYA izni masraf izni değildir; büro geneli MASRAF izni dosya izni değildir", async () => {
      expect([await caseVisible(w.u.allow, "c6"), await summary(w.u.allow, "c6")]).toEqual([true, 404]);
      expect([await caseVisible(expAll, "c6"), await summary(expAll, "c6")]).toEqual([false, 200]);
    });

    it("dosya bağı (CaseLawyer / CaseStaff canView) iki kapsamda da aynı sonucu verir; DENY'li dosya izni dosya bağını bozmaz", async () => {
      expect([await caseVisible(w.u.link, "c4"), await summary(w.u.link, "c4")]).toEqual([true, 200]);
      expect([await caseVisible(w.u.staff, "c5"), await summary(w.u.staff, "c5")]).toEqual([true, 200]);
      expect([await caseVisible(w.u.deny, "c4"), await summary(w.u.deny, "c4")]).toEqual([true, 200]);
      expect([await caseVisible(w.u.noView, "c6"), await summary(w.u.noView, "c6")]).toEqual([false, 404]);
    });

    it("P3 bayrağı bu uçların sonucunu değiştirmez (masraf bayrağı belirleyici)", async () => {
      for (const [label, actor, visible, cases] of EXPECT) {
        p3.off();
        const offRow = (await http.get(actor(), `/expense-requests/${req.c4}`)).status;
        const offCase = await summary(actor(), "c4");
        p3.on();
        expect([label, (await http.get(actor(), `/expense-requests/${req.c4}`)).status, await summary(actor(), "c4")]).toEqual([label, offRow, offCase]);
        expect([label, offRow === 200, offCase === 200]).toEqual([label, visible.includes("c4"), cases.includes("c4")]);
      }
    });
  });

  describe("CL-R12 — existing remaining in the opt-in case summary (real HTTP/DB/DI)", () => {
    const ownClients: string[] = [];
    let selectedClient: string;
    let otherClient: string;
    let selectedRequest: string;
    let collectionId: string;
    let dispositionId: string;
    const D = (value: string | number) => new Prisma.Decimal(value);
    const url = (caseId = w.c.c4, clientId = selectedClient, currency?: string) =>
      `/expense-requests/case/${caseId}/summary?clientId=${clientId}${currency === undefined ? '' : `&remainingCurrency=${currency}`}`;
    const totals = async () => ({
      requests: await db.expenseRequest.count({ where: { tenantId: w.tA } }),
      offsets: await db.clientOffset.count({ where: { tenantId: w.tA } }),
      applications: await db.collectionDispositionExpenseApplication.count({ where: { tenantId: w.tA } }),
      audits: await db.auditLog.count({ where: { tenantId: w.tA } }),
      tasks: await db.task.count({ where: { tenantId: w.tA } }),
    });

    beforeAll(async () => {
      flag.on(); p3.on();
      const makeClient = async (label: string) => {
        const row = await db.client.create({ data: { tenantId: w.tA, type: 'COMPANY', name: `CLR12-${label}-${w.suffix}` } as never });
        ownClients.push(row.id); return row.id;
      };
      selectedClient = await makeClient('selected'); otherClient = await makeClient('other');
      const cc = await linkClient(db, w.c.c4, selectedClient, w.u.admin);
      await linkClient(db, w.c.c6, selectedClient, w.u.admin);
      await linkClient(db, w.c.c4, otherClient, w.u.admin, 'ORTAK_ALACAKLI');
      const makeExpense = async (caseId: string, clientId: string, amount: number, currency = 'TRY', paid = 0, status = 'SENT') =>
        (await db.expenseRequest.create({ data: { tenantId: w.tA, caseId, clientId, totalAmount: D(amount), paidTotal: D(paid), currency, status, gateType: 'BLOCKING', createdById: w.u.admin } as never })).id;
      selectedRequest = await makeExpense(w.c.c4, selectedClient, 1000, 'TRY', 200, 'PARTIAL');
      await makeExpense(w.c.c4, selectedClient, 500, 'USD');
      await makeExpense(w.c.c4, selectedClient, 999, 'TRY', 0, 'CANCELLED');
      await makeExpense(w.c.c4, otherClient, 700);
      await makeExpense(w.c.c6, selectedClient, 600);

      // Valid full-reversal pairs: offset APPLY 250+50, REVERSAL 50; reimbursement APPLY 80+20, REVERSAL 20.
      const offset = async (amount: number, key: string, kind: 'APPLY' | 'REVERSAL', reversesOffsetId?: string) =>
        db.clientOffset.create({ data: { tenantId: w.tA, clientId: selectedClient, amount: D(amount), currency: 'TRY', kind, payableCaseId: w.c.c4, payableCaseClientId: cc, expenseCaseId: w.c.c4, expenseRequestId: selectedRequest, idempotencyKey: `clr12-${key}-${w.suffix}`, createdById: w.u.admin, reversesOffsetId, reason: kind === 'REVERSAL' ? 'CL-R12 full reversal fixture' : undefined } });
      await offset(250, 'apply-a', 'APPLY');
      const off = await offset(50, 'apply-b', 'APPLY'); await offset(50, 'reverse-b', 'REVERSAL', off.id);
      const collection = await db.collection.create({ data: { tenantId: w.tA, caseId: w.c.c4, idempotencyKey: `clr12-${w.suffix}`, amount: D(1000), currency: 'TRY', type: 'TAHSILAT', channel: 'BANKA', sourceType: 'MANUAL', status: 'CONFIRMED', confirmedAt: new Date(), date: new Date(), createdById: w.u.admin } as never });
      collectionId = collection.id;
      const disp = await db.collectionDisposition.create({ data: { tenantId: w.tA, caseId: w.c.c4, collectionId, caseClientId: cc, beneficiaryScope: 'SINGLE_CASE_CLIENT', status: 'POSTED', totalAmount: D(1000), currency: 'TRY', createdById: w.u.admin, postedById: w.u.admin, postedAt: new Date() } as never });
      dispositionId = disp.id;
      await db.collectionDispositionLine.create({ data: { dispositionId, type: 'CLIENT_PAYABLE', amount: D(900), caseClientId: cc } });
      for (const amount of [80, 20]) {
        const line = await db.collectionDispositionLine.create({ data: { dispositionId, type: 'FIRM_EXPENSE_REIMBURSEMENT', amount: D(amount), expenseRequestId: selectedRequest } });
        const application = await db.collectionDispositionExpenseApplication.create({ data: { tenantId: w.tA, caseId: w.c.c4, expenseRequestId: selectedRequest, collectionDispositionId: dispositionId, collectionDispositionLineId: line.id, kind: 'APPLY', amount: D(amount), currency: 'TRY', reimbursementScope: 'FIRM_FRONTED', createdById: w.u.admin } });
        if (amount === 20) await db.collectionDispositionExpenseApplication.create({ data: { tenantId: w.tA, caseId: w.c.c4, expenseRequestId: selectedRequest, collectionDispositionId: dispositionId, collectionDispositionLineId: line.id, kind: 'REVERSAL', amount: D(20), currency: 'TRY', reimbursementScope: 'FIRM_FRONTED', createdById: w.u.admin, reversesApplicationId: application.id, reason: 'CL-R12 full reversal fixture' } });
      }
    });

    afterAll(async () => {
      if (dispositionId) {
        await db.collectionDispositionExpenseApplication.deleteMany({ where: { collectionDispositionId: dispositionId } });
        await db.collectionDispositionLine.deleteMany({ where: { dispositionId } });
        await db.collectionDisposition.deleteMany({ where: { id: dispositionId } });
      }
      if (collectionId) await db.collection.deleteMany({ where: { id: collectionId } });
      await db.clientOffset.deleteMany({ where: { tenantId: w.tA, clientId: { in: ownClients } } });
      await db.expenseRequest.deleteMany({ where: { tenantId: w.tA, clientId: { in: ownClients } } });
      await db.caseClient.deleteMany({ where: { clientId: { in: ownClients } } });
      await db.client.deleteMany({ where: { id: { in: ownClients } } });
      flag.off(); p3.off();
    });

    it('legacy response stays exact; the explicit TRY read adds canonical 470 without changing any legacy field', async () => {
      const before = await totals();
      const legacy = await http.get(w.u.link, url());
      expect(legacy.status).toBe(200);
      expect(legacy.body).toEqual({ totalRequested: 1500, totalPaid: 200, totalPending: 1300, requestCount: 2, paidCount: 0, pendingCount: 2, blockingUnpaid: 1300 });
      const current = await http.get(w.u.link, url(w.c.c4, selectedClient, 'TRY'));
      expect(current.status).toBe(200);
      expect(current.body).toEqual({ ...legacy.body, expenseUnpaid: '470', expenseUnpaidCurrency: 'TRY' });
      expect((app.get(ExpenseRequestService) as any).settlementRead).toBe(app.get(ClientSettlementReadService));
      expect(await totals()).toEqual(before);
      const stored = await db.expenseRequest.findUniqueOrThrow({ where: { id: selectedRequest } });
      expect([stored.paidTotal.toString(), stored.status]).toEqual(['200', 'PARTIAL']);
    });

    it('global total and case rows reuse the same remaining; single-case reads do not gain a global-client access requirement', async () => {
      const path = `/clients/${selectedClient}/accounting/summary?currency=TRY`;
      const global = await http.get(w.u.allow, path);
      expect(global.status).toBe(200);
      expect(global.body.data.clientScoped.expenseUnpaid).toBe('1070');
      expect(global.body.data.caseBreakdown.find((r: any) => r.caseId === w.c.c4).expenseUnpaid).toBe('470');
      expect(global.body.data.caseBreakdown.find((r: any) => r.caseId === w.c.c6).expenseUnpaid).toBe('600');
      expect((await http.get(w.u.link, path)).status).toBe(403);
      expect((await http.get(w.u.link, url(w.c.c4, selectedClient, 'TRY'))).body.expenseUnpaid).toBe('470');
    });

    it('currency, client and real case remain separate; CANCELLED and other currencies are excluded from the new remaining', async () => {
      for (const [caseId, clientId, currency, expected] of [[w.c.c4, selectedClient, 'USD', '500'], [w.c.c6, selectedClient, 'TRY', '600'], [w.c.c4, otherClient, 'TRY', '700']] as const) {
        const res = await http.get(expAll, url(caseId, clientId, currency));
        expect([res.status, res.body.expenseUnpaid, res.body.expenseUnpaidCurrency]).toEqual([200, expected, currency]);
      }
      const empty = await http.get(expAll, url(w.c.c4, selectedClient, 'EUR'));
      expect([empty.status, empty.body.expenseUnpaid]).toEqual([200, '0']);
    });

    it('existing expense-view denials and tenant boundaries remain identical, without a new write or success audit', async () => {
      const before = await totals();
      const legacy = await http.get(w.u.nobody, url());
      const current = await http.get(w.u.nobody, url(w.c.c4, selectedClient, 'TRY'));
      expect([legacy.status, current.status, current.body]).toEqual([404, 404, legacy.body]);
      // Existing GLOBAL expense permission short-circuits the visibility check in the actor's own tenant.
      // Cross-tenant aggregate reads therefore retain legacy empty 200, indistinguishable from a missing case.
      const foreignLegacy = await http.get(expAllB, url());
      const foreign = await http.get(expAllB, url(w.c.c4, selectedClient, 'TRY'));
      const missing = await http.get(expAllB, url('missing-clr12-case', selectedClient, 'TRY'));
      expect([foreignLegacy.status, foreignLegacy.body.totalRequested, foreignLegacy.body.requestCount]).toEqual([200, 0, 0]);
      expect([foreign.status, foreign.body]).toEqual([200, { ...foreignLegacy.body, expenseUnpaid: '0', expenseUnpaidCurrency: 'TRY' }]);
      expect([missing.status, missing.body]).toEqual([foreign.status, foreign.body]);
      const wrongCase = await http.get(w.u.link, url(w.c.c6, selectedClient, 'TRY'));
      expect(wrongCase.status).toBe(404);
      expect(await totals()).toEqual(before);
    });

    it('invalid opt-in currency or missing client is explicit 400, not legacy success', async () => {
      const before = await totals();
      for (const suffix of [`?clientId=${selectedClient}&remainingCurrency=`, `?clientId=${selectedClient}&remainingCurrency=try`, '?remainingCurrency=TRY']) {
        const res = await http.get(w.u.link, `/expense-requests/case/${w.c.c4}/summary${suffix}`);
        expect(res.status).toBe(400);
      }
      expect(await totals()).toEqual(before);
    });
  });
});
