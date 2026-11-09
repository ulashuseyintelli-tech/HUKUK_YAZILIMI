import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { A_CASE_KEYS, ACaseKey, CASE_NOT_FOUND, CaseKey, ScopeWorld, buildScopeApp, createScopeWorld, expectHiddenResponse, scopeFlag, scopeHttp } from "../../../../test/p3-scope-world";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { V28EngineModule } from "./v28-engine.module";

/**
 * F02 P3 tarama S11 (owner kararı T1, 09.11.2026) — v28 motorunun DOSYA KİMLİKLİ okuma uçları D1 dosya kapsamını dolanamaz.
 * Çalışan uygulamada kayıtlı olan 15 uç (`icrabot/v28/facts|timeline|runs|outbox|feedback`): olgular, bayraklar, denetim izi,
 * zaman çizelgesi, motor koşuları, eylem kuyruğu ve eylem geri bildirimleri.
 * Gerçek HTTP (V28EngineModule + ValidationPipe) + tek kullanımlık PostgreSQL; JWT yerine DB kimliği.
 *
 * Sözleşme D1 ile aynıdır (yeni kural / anahtar / bayrak YOK; CaseViewScopeService). Bayrak kapalı: davranış bugünküyle aynı.
 * Bayrak açık: kapsam dışı, var olmayan ve başka büronun dosyası AYNI 404 gövdesini alır; içerik üretilmez.
 * T1 sınırı: dosya kimliği taşımayan entegrasyon okumaları ve yazım uçları bu teslimin DIŞINDADIR ve değişmez (aşağıda ölçülür).
 * Motorun kendi kiracı denetimi (`assertCaseInScope`) değişmedi; kapı controller dekoratöründedir.
 * Kod okuması gerçek erişim kanıtı değildir; bu spec yalnız yalıtılmış DB'deki davranışı ölçer.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("v28 case view scope requires TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

describeDb("F02 P3 tarama S11 — v28 dosya kimlikli okuma uçları (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(300_000);
  const flag = scopeFlag();
  let db: PrismaClient;
  let app: INestApplication;
  let w: ScopeWorld;
  const http = scopeHttp(() => app);
  const ALL: CaseKey[] = [...A_CASE_KEYS, "b1"];
  const mark = (k: string) => `V28IZ-${k}-${w.suffix}`;
  const run = {} as Record<CaseKey, string>;
  const text = (res: { body: unknown; text?: string }) => JSON.stringify(res.body ?? {}) + String(res.text ?? "");

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    app = await buildScopeApp(() => db, [V28EngineModule]);
    w = await createScopeWorld(db, "v28");
    for (const k of ALL) {
      const caseId = w.c[k];
      const tenantId = k === "b1" ? w.tB : w.tA;
      await db.icrabotCaseFact.createMany({
        data: [
          { caseId, key: "case.iz", value: mark(k) },
          { caseId, key: "actions.sms.last_status", value: mark(k) },
          { caseId, key: "actions.last.status", value: mark(k) },
          { caseId, key: "actions.callback.teslim", value: { iz: mark(k) } },
        ],
      });
      await db.icrabotCaseFlag.create({ data: { caseId, key: "IZLI", value: true } });
      await db.icrabotFactAudit.create({ data: { caseId, key: "case.iz", oldValue: null as never, newValue: mark(k), kind: "fact", meta: {} } });
      run[k] = (await db.icrabotEngineRun.create({ data: { caseId, ruleId: mark(k), snapshotHash: "x", status: "succeeded" } })).id;
      await db.icrabotTimelineEntry.create({ data: { caseId, tenantId, runId: run[k], type: "NOTE", title: mark(k), aggregateVersion: BigInt(1) } });
      await db.icrabotOutboxAction.create({ data: { caseId, tenantId, runId: run[k], actionType: "send_sms", idempotencyKey: mark(k), payload: { iz: mark(k) }, status: "done" } });
    }
  });

  afterAll(async () => {
    flag.restore();
    const caseIds = ALL.map((k) => w.c[k]);
    await w.cleanup(async () => {
      await db.icrabotOutboxAction.deleteMany({ where: { caseId: { in: caseIds } } }).catch(() => undefined);
      await db.icrabotTimelineEntry.deleteMany({ where: { caseId: { in: caseIds } } }).catch(() => undefined);
      await db.icrabotEngineRun.deleteMany({ where: { caseId: { in: caseIds } } }).catch(() => undefined);
      await db.icrabotFactAudit.deleteMany({ where: { caseId: { in: caseIds } } }).catch(() => undefined);
      await db.icrabotCaseFlag.deleteMany({ where: { caseId: { in: caseIds } } }).catch(() => undefined);
      await db.icrabotCaseFact.deleteMany({ where: { caseId: { in: caseIds } } }).catch(() => undefined);
    });
    await app?.close();
    await db.$disconnect();
  });

  /**
   * `marked`: görünür dosyada yanıt dosyanın işaretini taşır (içerik gerçekten o dosyadan).
   * `ok`: görünür dosyada beklenen durum. `pattern` ucu bu PR'dan önce de 500 verir (ham sorgu var olmayan bir tablo adına gider);
   * düzeltmesi bu teslimin konusu değildir. Kapı yine de ölçülür: kapsam dışı dosya servise ulaşmadan 404 alır.
   */
  type Route = { name: string; path: (caseId: string) => string; marked: boolean; ok?: number };
  const ok = (r: Route) => r.ok ?? 200;
  const ROUTES: Route[] = [
    { name: "GET icrabot/v28/facts/:caseId", path: (c) => `/icrabot/v28/facts/${c}`, marked: true },
    { name: "GET icrabot/v28/facts/:caseId/fact/:key", path: (c) => `/icrabot/v28/facts/${c}/fact/case.iz`, marked: true },
    { name: "GET icrabot/v28/facts/:caseId/flag/:key", path: (c) => `/icrabot/v28/facts/${c}/flag/IZLI`, marked: false },
    { name: "GET icrabot/v28/facts/:caseId/audit", path: (c) => `/icrabot/v28/facts/${c}/audit`, marked: true },
    { name: "GET icrabot/v28/facts/:caseId/pattern/:pattern", path: (c) => `/icrabot/v28/facts/${c}/pattern/case.*`, marked: false, ok: 500 },
    { name: "GET icrabot/v28/facts/:caseId/audit/:key", path: (c) => `/icrabot/v28/facts/${c}/audit/case.iz`, marked: true },
    { name: "GET icrabot/v28/timeline/:caseId", path: (c) => `/icrabot/v28/timeline/${c}`, marked: true },
    { name: "GET icrabot/v28/timeline/:caseId/stats", path: (c) => `/icrabot/v28/timeline/${c}/stats`, marked: false },
    { name: "GET icrabot/v28/timeline/:caseId/summary", path: (c) => `/icrabot/v28/timeline/${c}/summary`, marked: false },
    { name: "GET icrabot/v28/runs/case/:caseId", path: (c) => `/icrabot/v28/runs/case/${c}`, marked: true },
    { name: "GET icrabot/v28/outbox/case/:caseId", path: (c) => `/icrabot/v28/outbox/case/${c}`, marked: true },
    { name: "GET icrabot/v28/feedback/:caseId/:actionType", path: (c) => `/icrabot/v28/feedback/${c}/sms`, marked: true },
    { name: "GET icrabot/v28/feedback/:caseId", path: (c) => `/icrabot/v28/feedback/${c}`, marked: true },
    { name: "GET icrabot/v28/feedback/:caseId/callbacks", path: (c) => `/icrabot/v28/feedback/${c}/callbacks`, marked: false },
    { name: "GET icrabot/v28/feedback/:caseId/last", path: (c) => `/icrabot/v28/feedback/${c}/last`, marked: false },
  ];
  const named = ROUTES.map((r) => [r.name, r] as const);
  const leaks = (k: CaseKey) => [mark(k), w.fileNo(k), w.c[k], run[k]];

  it("envanter: bu spec çalışan uygulamadaki 15 dosya kimlikli v28 okuma ucunun tamamını ölçer", () => {
    expect(ROUTES).toHaveLength(15);
    expect(new Set(ROUTES.map((r) => r.name)).size).toBe(15);
  });

  describe("bayrak KAPALI — bugünkü davranış (karakterizasyon)", () => {
    beforeAll(() => flag.off());

    it.each(named)("%s: ilişkisiz kullanıcı kiracının her dosyasını okur (kapsam uygulanmaz)", async (_n, r) => {
      for (const k of A_CASE_KEYS) {
        const res = await http.get(w.u.nobody, r.path(w.c[k]));
        expect([k, res.status]).toEqual([k, ok(r)]);
        if (r.marked) expect([k, text(res).includes(mark(k))]).toEqual([k, true]);
      }
    });

    it.each(named)("%s: kiracı sınırı bayraktan bağımsız — büro A kullanıcısı büro B dosyasının verisini alamaz", async (_n, r) => {
      const res = await http.get(w.u.nobody, r.path(w.c.b1));
      expect(text(res)).not.toContain(mark("b1"));
      expect(text(res)).not.toContain(w.fileNo("b1"));
    });
  });

  it("gölge: `feedback/:caseId/callbacks` ve `/last` bugün `:caseId/:actionType` rotasına düşer (kendi handler'ları erişilemez; kapı o rotadadır)", async () => {
    flag.off();
    for (const tail of ["callbacks", "last"]) {
      const res = await http.get(w.u.nobody, `/icrabot/v28/feedback/${w.c.c6}/${tail}`);
      // getLastFeedback'in biçimi: actionId alanı yalnız orada var; getCallbackHistory olsaydı `teslim` anahtarı dönerdi.
      expect([tail, res.status, Object.keys(res.body).includes("actionId"), Object.keys(res.body).includes("teslim")]).toEqual([tail, 200, true, false]);
    }
  });

  describe("bayrak kapalı ilişkisiz kullanıcı = bayrak açık büro geneli izinli kullanıcı (yanıt eşitliği)", () => {
    afterAll(() => flag.off());
    it.each(named)("%s", async (_n, r) => {
      flag.off();
      const before = await http.get(w.u.nobody, r.path(w.c.c6));
      flag.on();
      const after = await http.get(w.u.allow, r.path(w.c.c6));
      flag.off();
      expect(before.status).toBe(ok(r));
      expect([after.status, after.body]).toEqual([before.status, before.body]);
    });
  });

  describe("bayrak AÇIK — görünürlük (D1 dalları)", () => {
    beforeAll(() => flag.on());
    afterAll(() => flag.off());

    it.each(named)("%s: her D1 dalında yalnız görünür dosyalar okunur; kapsam dışı dosya içerik üretmeden 404 alır", async (_n, r) => {
      for (const [label, actor, visible] of w.visibility) {
        for (const k of A_CASE_KEYS) {
          const res = await http.get(actor, r.path(w.c[k]));
          if ((visible as ACaseKey[]).includes(k)) {
            expect([label, k, res.status]).toEqual([label, k, ok(r)]);
            if (r.marked) expect([label, k, text(res).includes(mark(k))]).toEqual([label, k, true]);
          } else {
            expect([label, k, res.status]).toEqual([label, k, 404]);
            expectHiddenResponse(res, CASE_NOT_FOUND, leaks(k));
          }
        }
      }
    });

    it.each(named)("%s: var olmayan dosya = kapsam dışı dosya = başka büronun dosyası (aynı 404 gövdesi)", async (_n, r) => {
      const hidden = await http.get(w.u.nobody, r.path(w.c.c6));
      const missing = await http.get(w.u.nobody, r.path(w.missing));
      const foreign = await http.get(w.u.allow, r.path(w.c.b1));
      expectHiddenResponse(hidden, CASE_NOT_FOUND, leaks("c6"));
      expectHiddenResponse(missing, CASE_NOT_FOUND, []);
      expectHiddenResponse(foreign, CASE_NOT_FOUND, leaks("b1"));
      expect(missing.body).toEqual(hidden.body);
      expect(foreign.body).toEqual(hidden.body);
    });

    it("iki kiracı: büro B'nin büro geneli izinli kullanıcısı kendi dosyasını okur, büro A dosyasını okuyamaz", async () => {
      for (const r of ROUTES) {
        expect([r.name, (await http.get(w.v.allow, r.path(w.c.b1))).status]).toEqual([r.name, ok(r)]);
        expectHiddenResponse(await http.get(w.v.allow, r.path(w.c.c1)), CASE_NOT_FOUND, leaks("c1"));
        expectHiddenResponse(await http.get(w.v.nobody, r.path(w.c.b1)), CASE_NOT_FOUND, leaks("b1"));
      }
    });

    it("ilişki–dosya kiracı uyuşmazlığı görünürlük üretmez (büro A'nın `link` kartı b1'de CaseLawyer satırı taşır)", async () => {
      for (const r of ROUTES) expectHiddenResponse(await http.get(w.u.link, r.path(w.c.b1)), CASE_NOT_FOUND, leaks("b1"));
    });

    it("kimliksiz istek 401 alır (kapı kimlik doğrulamanın yerine geçmez)", async () => {
      for (const r of ROUTES) expect([r.name, (await http.anonymous(r.path(w.c.c1))).status]).toEqual([r.name, 401]);
    });
  });

  describe("T1 sınırı — bu teslimin dışında kalan yollar değişmez", () => {
    afterAll(() => flag.off());
    // Beklenen durumlar bugünkü davranışın karakterizasyonudur (bu PR'dan önce de böyle): `timeline/run/:runId` 500 verir,
    // `runs/stats` ise `runs/:runId` rotasının gölgesinde 404 alır. İkisi de bu teslimin konusu değildir; yalnız DEĞİŞMEDİĞİ ölçülür.
    const OUTSIDE: Array<[() => string, number]> = [
      [() => `/icrabot/v28/facts/by-flag/IZLI`, 200],
      [() => `/icrabot/v28/timeline/run/${run.c6}`, 500],
      [() => `/icrabot/v28/runs/${run.c6}`, 200],
      [() => `/icrabot/v28/runs/stats`, 404],
      [() => `/icrabot/v28/outbox/stats`, 200],
    ];

    it("dosya kimliği taşımayan v28 okumaları bayrak açıkken de aynı yanıtı verir (ilişkisiz kullanıcı)", async () => {
      for (const [path, expected] of OUTSIDE) {
        flag.off();
        const before = await http.get(w.u.nobody, path());
        flag.on();
        const after = await http.get(w.u.nobody, path());
        expect([path(), after.status, after.body]).toEqual([path(), before.status, before.body]);
        expect([path(), before.status]).toEqual([path(), expected]);
      }
    });

    it("yazım ucu kapsama bağlanmadı: ilişkisiz kullanıcı bayrak açıkken de olgu yazar (mevcut işlem yetkisi)", async () => {
      flag.off();
      const before = await http.post(w.u.nobody, `/icrabot/v28/facts/${w.c.c6}/fact/yazim.kapali`, { value: 1 });
      flag.on();
      const after = await http.post(w.u.nobody, `/icrabot/v28/facts/${w.c.c6}/fact/yazim.acik`, { value: 1 });
      flag.off();
      expect([before.status, before.body.ok]).toEqual([200, true]);
      expect([after.status, after.body.ok]).toEqual([200, true]);
      expect(await db.icrabotCaseFact.count({ where: { caseId: w.c.c6, key: { in: ["yazim.kapali", "yazim.acik"] } } })).toBe(2);
    });
  });
});
