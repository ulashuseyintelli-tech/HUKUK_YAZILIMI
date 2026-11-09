// Belge modülleri grafiği pdf-poppler'a uzanabilir; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { ForbiddenException, INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import * as request from "supertest";
import { A_CASE_KEYS, ACaseKey, CASE_NOT_FOUND, CaseKey, ScopeWorld, buildScopeApp, createScopeWorld, expectHiddenResponse, scopeFlag, scopeHttp } from "../../../../test/p3-scope-world";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { PrecautionaryOrderModule } from "../../precautionary-order/precautionary-order.module";
import { RelatedLawsuitsModule } from "../../related-lawsuits/related-lawsuits.module";
import { CaseViewScopeService } from "../case-view-scope.service";

/**
 * F02 P3 tarama S8 / S9 (owner kararları 09.11.2026) — dosyaya bağlı ALTERNATİF okuma yolları D1 dosya kapsamını dolanamaz:
 *  - S8: karşılıksız çek şikâyet dilekçesi `related-lawsuits/generate/karsiliksiz-cek/:caseId` (+ preview, + word). Aynı belgenin
 *    `template-engine` yolu D2'de kapılandı; bu yol aynı servisi doğrudan çağırıyordu.
 *  - S9: ihtiyati haciz kararları `precautionary-orders/case/:caseId`, `/:id`, `/:id/costs/total`.
 * Gerçek HTTP (RelatedLawsuitsModule + PrecautionaryOrderModule + ValidationPipe) + tek kullanımlık PostgreSQL; JWT yerine DB kimliği.
 *
 * Sözleşme D1 ile aynıdır (yeni kural / anahtar / bayrak YOK; CaseViewScopeService). Bayrak kapalı: davranış bugünküyle aynı.
 * Bayrak açık: kapsam dışı ve var olmayan dosya / karar AYNI 404 gövdesini alır; içerik üretilmez. Yazım uçları değişmez.
 * Kod okuması gerçek erişim kanıtı değildir; bu spec yalnız yalıtılmış DB'deki davranışı ölçer.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Case view scope alt routes require TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

describeDb("F02 P3 tarama S8 / S9 — alternatif belge ve ihtiyati haciz okuma yolları (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(300_000);
  const flag = scopeFlag();
  let db: PrismaClient;
  let app: INestApplication;
  let w: ScopeWorld;
  const http = scopeHttp(() => app);
  const order = {} as Record<CaseKey | "mismatch" | "writeOff" | "writeOn", string>;
  const court = (k: string) => `MAHKEME-${k}-${w.suffix}`;
  const cheque = (k: string) => `CEK-${k}-${w.suffix}`;
  const ORDER_NOT_FOUND = { statusCode: 404, message: "İhtiyati haciz kararı bulunamadı", error: "Not Found" } as const;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    app = await buildScopeApp(() => db, [RelatedLawsuitsModule, PrecautionaryOrderModule]);
    w = await createScopeWorld(db, "alt");

    const mkOrder = async (key: string, tenantId: string, caseId: string) => {
      const row = await db.precautionaryOrder.create({
        data: { tenantId, caseId, orderType: "IHTIYATI_HACIZ", courtName: court(key), decisionDate: new Date("2026-10-01T00:00:00.000Z"), securedAmount: 1000, currency: "TRY" } as never,
      });
      await db.precautionaryCost.create({ data: { tenantId, precautionaryOrderId: row.id, costType: "HARC", amount: 125, currency: "TRY", sortOrder: 1 } as never });
      return row.id;
    };
    for (const k of A_CASE_KEYS) order[k] = await mkOrder(k, w.tA, w.c[k]);
    order.b1 = await mkOrder("b1", w.tB, w.c.b1);
    // Karşılıksız çek dilekçesi çek takibi + çek kaydı + aktif borçlu ister: dosyalar çek takibine çevrilir; her dosyaya
    // ayırt edilebilir seri numaralı bir çek ve bir borçlu eklenir.
    await db.case.updateMany({ where: { id: { in: [...A_CASE_KEYS, "b1"].map((k) => w.c[k as CaseKey]) } }, data: { type: "CHECK" } as never });
    for (const k of [...A_CASE_KEYS, "b1"] as CaseKey[]) {
      const debtor = await db.debtor.create({ data: { tenantId: k === "b1" ? w.tB : w.tA, type: "COMPANY", name: `BORCLU-${k}-${w.suffix}` } as never });
      await db.caseDebtor.create({ data: { caseId: w.c[k], debtorId: debtor.id } as never });
      await db.caseInstrument.create({
        data: {
          tenantId: k === "b1" ? w.tB : w.tA,
          caseId: w.c[k],
          instrumentType: "CEK",
          serialNo: cheque(k),
          amount: 5000,
          currency: "TRY",
          issueDate: new Date("2026-09-01T00:00:00.000Z"),
          bankName: "Test Bankası",
          drawerName: `KESIDECI-${k}-${w.suffix}`,
        } as never,
      });
    }
    // Nesne–dosya kiracı uyuşmazlığı: satır büro B'de, gösterdiği dosya büro A'da (tenantId ile dosya arasında DB kısıtı yok).
    order.mismatch = await mkOrder("mismatch", w.tB, w.c.c4);
    order.writeOff = await mkOrder("writeoff", w.tA, w.c.c6);
    order.writeOn = await mkOrder("writeon", w.tA, w.c.c6);
  });

  afterAll(async () => {
    flag.restore();
    await app?.close();
    await w?.cleanup(async (tenants) => {
      await db.caseInstrument.deleteMany({ where: { tenantId: { in: tenants } } }).catch(() => undefined);
      await db.caseDebtor.deleteMany({ where: { case: { tenantId: { in: tenants } } } }).catch(() => undefined);
      await db.debtor.deleteMany({ where: { tenantId: { in: tenants } } }).catch(() => undefined);
      await db.precautionaryCost.deleteMany({ where: { tenantId: { in: tenants } } }).catch(() => undefined);
      await db.precautionaryOrder.deleteMany({ where: { tenantId: { in: tenants } } }).catch(() => undefined);
    });
    await db.$disconnect();
  });

  type Route = { name: string; path: (k: CaseKey) => string; hidden: { statusCode: number; message: string; error: string }; json: boolean };
  const ROUTES: Route[] = [
    { name: "GET related-lawsuits/generate/karsiliksiz-cek/:caseId", path: (k) => `/related-lawsuits/generate/karsiliksiz-cek/${w.c[k]}`, hidden: CASE_NOT_FOUND, json: true },
    { name: "GET related-lawsuits/generate/karsiliksiz-cek/:caseId/preview", path: (k) => `/related-lawsuits/generate/karsiliksiz-cek/${w.c[k]}/preview`, hidden: CASE_NOT_FOUND, json: true },
    { name: "GET related-lawsuits/generate/karsiliksiz-cek/:caseId/word", path: (k) => `/related-lawsuits/generate/karsiliksiz-cek/${w.c[k]}/word`, hidden: CASE_NOT_FOUND, json: false },
    { name: "GET precautionary-orders/case/:caseId", path: (k) => `/precautionary-orders/case/${w.c[k]}`, hidden: CASE_NOT_FOUND, json: true },
    { name: "GET precautionary-orders/:id", path: (k) => `/precautionary-orders/${order[k]}`, hidden: ORDER_NOT_FOUND, json: true },
    { name: "GET precautionary-orders/:id/costs/total", path: (k) => `/precautionary-orders/${order[k]}/costs/total`, hidden: ORDER_NOT_FOUND, json: true },
  ];
  const named = ROUTES.map((r) => [r.name, r] as const);
  const leaks = (k: CaseKey) => [w.fileNo(k), court(k), cheque(k), `KESIDECI-${k}-`, `BORCLU-${k}-`, w.c[k], order[k]];
  /** Karşılaştırılabilir yanıt özeti: JSON uçlarında gövde, ikili (Word) uçta durum + içerik türü + uzunluk sınıfı. */
  const shape = (r: Route, res: request.Response) =>
    r.json ? { status: res.status, body: res.body } : { status: res.status, type: String(res.headers["content-type"] ?? "").split(";")[0], hasBody: Number(res.headers["content-length"] ?? 0) > 0 };

  describe("bayrak KAPALI — bugünkü davranış (karakterizasyon)", () => {
    beforeAll(() => flag.off());

    it.each(named)("%s: ilişkisiz kullanıcı kiracının her dosyasını okur (kapsam uygulanmaz)", async (_n, r) => {
      for (const k of A_CASE_KEYS) {
        const res = await http.get(w.u.nobody, r.path(k));
        expect([k, res.status]).toEqual([k, 200]);
      }
    });

    it("karşılıksız çek dilekçesi dosyanın çek verisinden üretilir (seri numarası metinde ve önizlemede)", async () => {
      const doc = await http.get(w.u.nobody, `/related-lawsuits/generate/karsiliksiz-cek/${w.c.c6}`);
      expect(JSON.stringify(doc.body)).toContain(cheque("c6"));
      const preview = await http.get(w.u.nobody, `/related-lawsuits/generate/karsiliksiz-cek/${w.c.c6}/preview`);
      expect(String(preview.body.html)).toContain(cheque("c6"));
      const word = await http.get(w.u.nobody, `/related-lawsuits/generate/karsiliksiz-cek/${w.c.c6}/word`);
      expect(String(word.headers["content-type"])).toContain("wordprocessingml");
      expect(String(word.headers["content-disposition"])).toContain(w.c.c6);
    });

    it("ihtiyati haciz yanıtları dosyanın verisini taşır (işaretler yanıtta)", async () => {
      const list = await http.get(w.u.nobody, `/precautionary-orders/case/${w.c.c6}`);
      expect(JSON.stringify(list.body)).toContain(court("c6"));
      const one = await http.get(w.u.nobody, `/precautionary-orders/${order.c6}`);
      expect([one.body.id, one.body.courtName]).toEqual([order.c6, court("c6")]);
      const total = await http.get(w.u.nobody, `/precautionary-orders/${order.c6}/costs/total`);
      expect([total.body.total, total.body.count]).toEqual([125, 1]);
    });

    it("kiracı sınırı bayraktan bağımsız: büro A kullanıcısı büro B'nin dosyasını / kararını okuyamaz", async () => {
      for (const r of ROUTES.slice(0, 3)) expect((await http.get(w.u.nobody, r.path("b1"))).status).not.toBe(200);
      const list = await http.get(w.u.nobody, `/precautionary-orders/case/${w.c.b1}`);
      expect([list.status, list.body]).toEqual([200, []]);
      expect((await http.get(w.u.nobody, `/precautionary-orders/${order.b1}`)).body).toEqual(ORDER_NOT_FOUND);
      const total = await http.get(w.u.nobody, `/precautionary-orders/${order.b1}/costs/total`);
      expect([total.status, total.body.count]).toEqual([200, 0]);
    });
  });

  describe("bayrak kapalı ilişkisiz kullanıcı = bayrak açık büro geneli izinli kullanıcı (yanıt eşitliği)", () => {
    afterAll(() => flag.off());
    it.each(named)("%s", async (_n, r) => {
      flag.off();
      const before = await http.get(w.u.nobody, r.path("c6"));
      flag.on();
      const after = await http.get(w.u.allow, r.path("c6"));
      flag.off();
      expect(before.status).toBe(200);
      expect(shape(r, after)).toEqual(shape(r, before));
    });
  });

  describe("bayrak AÇIK — görünürlük (D1 dalları)", () => {
    beforeAll(() => flag.on());
    afterAll(() => flag.off());

    it.each(named)("%s: her D1 dalında yalnız görünür dosyalar okunur; kapsam dışı dosya içerik üretmeden 404 alır", async (_n, r) => {
      for (const [label, actor, visible] of w.visibility) {
        for (const k of A_CASE_KEYS) {
          const res = await http.get(actor, r.path(k));
          if ((visible as ACaseKey[]).includes(k)) expect([label, k, res.status]).toEqual([label, k, 200]);
          else {
            expect([label, k, res.status]).toEqual([label, k, 404]);
            expectHiddenResponse(res, r.hidden, leaks(k));
          }
        }
      }
    });

    it.each(named)("%s: var olmayan kimlik kapsam dışıyla AYNI gövdeyi alır (varlık sızmaz)", async (_n, r) => {
      const missingPath = r.path("c6").replace(w.c.c6, w.missing).replace(order.c6, w.missing);
      const missing = await http.get(w.u.nobody, missingPath);
      const hidden = await http.get(w.u.nobody, r.path("c6"));
      expect([missing.status, missing.body]).toEqual([404, r.hidden]);
      expect(hidden.body).toEqual(missing.body);
    });

    it.each(named)("%s: iki kiracı — büro B'nin büro geneli izinli kullanıcısı büro A dosyasını, büro A'nınki büro B dosyasını okuyamaz", async (_n, r) => {
      expectHiddenResponse(await http.get(w.v.allow, r.path("c4")), r.hidden, leaks("c4"));
      expectHiddenResponse(await http.get(w.u.allow, r.path("b1")), r.hidden, leaks("b1"));
    });

    it.each(named)("%s: ilişki–dosya uyuşmazlığı — büro A kartının büro B dosyasındaki CaseLawyer satırı erişim üretmez", async (_n, r) => {
      expectHiddenResponse(await http.get(w.u.link, r.path("b1")), r.hidden, leaks("b1"));
    });

    it("nesne–dosya kiracı uyuşmazlığı: büro B satırı büro A dosyasını gösteriyorsa iki büroya da kapalıdır", async () => {
      for (const actor of [w.v.allow, w.u.allow, w.u.link]) {
        expectHiddenResponse(await http.get(actor, `/precautionary-orders/${order.mismatch}`), ORDER_NOT_FOUND, [court("mismatch"), w.fileNo("c4")]);
        expectHiddenResponse(await http.get(actor, `/precautionary-orders/${order.mismatch}/costs/total`), ORDER_NOT_FOUND, [court("mismatch")]);
      }
      // Dosya listesi yalnız dosyanın kendi kiracısındaki kararları döndürür; yabancı satır listeye girmez.
      const list = await http.get(w.u.link, `/precautionary-orders/case/${w.c.c4}`);
      expect(list.status).toBe(200);
      expect((list.body as Array<{ id: string }>).map((o) => o.id)).toEqual([order.c4]);
    });

    it("kimlik yok → 401; aktör / kiracı bağlamı yok → 403 CASE_VIEW_SCOPE_UNRESOLVED (fail-closed)", async () => {
      for (const r of ROUTES) expect((await http.anonymous(r.path("c4"))).status).toBe(401);
      const scope = app.get(CaseViewScopeService);
      await expect(scope.assertCaseVisible(w.tA, undefined, w.c.c4)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(scope.isCaseObjectVisible(w.tA, null, "precautionaryOrder", order.c4)).rejects.toMatchObject({ response: { code: "CASE_VIEW_SCOPE_UNRESOLVED" } });
      await expect(scope.isCaseObjectVisible(undefined as never, w.u.link, "precautionaryOrder", order.c4)).rejects.toMatchObject({ response: { code: "CASE_VIEW_SCOPE_UNRESOLVED" } });
    });
  });

  describe("yazım uçları ve mevcut işlem yetkileri değişmez", () => {
    afterAll(() => flag.off());

    it("VIEWER yazma reddi kapsam kapısından bağımsız 403 verir (bayrak kapalı ve açık)", async () => {
      for (const set of [flag.off, flag.on]) {
        set();
        const res = await http.post(w.u.viewer, `/precautionary-orders/${order.c4}/apply`);
        expect(res.status).toBe(403);
        expect(JSON.stringify(res.body)).not.toContain("CASE_VIEW_SCOPE");
      }
    });

    it("ilişkisiz kullanıcının yazımı bayrak açıkken de kapsam kapısına takılmaz (yazım uçları owner kararıyla kapsam dışı)", async () => {
      flag.off();
      const before = await http.post(w.u.nobody, `/precautionary-orders/${order.writeOff}/lift`, { reason: "karakterizasyon" });
      flag.on();
      const after = await http.post(w.u.nobody, `/precautionary-orders/${order.writeOn}/lift`, { reason: "karakterizasyon" });
      flag.off();
      expect(after.status).toBe(before.status);
      expect(after.status).not.toBe(404);
      const rows = await db.precautionaryOrder.findMany({ where: { id: { in: [order.writeOff, order.writeOn] } }, select: { status: true } });
      expect(new Set(rows.map((row) => row.status)).size).toBe(1);
    });
  });
});
