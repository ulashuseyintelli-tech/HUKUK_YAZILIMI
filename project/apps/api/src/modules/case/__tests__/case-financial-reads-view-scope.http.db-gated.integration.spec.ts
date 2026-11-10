// Belge modülleri grafiği pdf-poppler'a uzanabilir; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import * as request from "supertest";
import { A_CASE_KEYS, ACaseKey, CASE_NOT_FOUND, CaseKey, ScopeWorld, buildScopeApp, createScopeWorld, expectHiddenResponse, scopeFlag, scopeHttp } from "../../../../test/p3-scope-world";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { AccountingJournalTrialBalanceModule } from "../../accounting-journal/accounting-journal-trial-balance.module";
import { BalanceDisplayShadowDiffModule } from "../../balance-display-shadow-diff/balance-display-shadow-diff.module";
import { BalanceShadowCompareModule } from "../../balance-shadow-compare/balance-shadow-compare.module";
import { ClaimItemModule } from "../../claim-item/claim-item.module";
import { CollectionModule } from "../../collection/collection.module";
import { CollectionService } from "../../collection/collection.service";
import { CostPackageModule } from "../../cost-package/cost-package.module";
import { AuditWriterService } from "../../interest-engine/audit/audit-writer.service";
import { InterestEngineModule } from "../../interest-engine/interest-engine.module";
import { PaymentInstructionModule } from "../../payment-instruction/payment-instruction.module";
import { SummaryEngineModule } from "../../summary-engine/summary-engine.module";
import { CaseModule } from "../case.module";
import { CaseViewScopeService } from "../case-view-scope.service";

/**
 * F02 P3 tarama S1 (owner kararı 09.11.2026) — DOSYA DÜZEYİ mali okumalar D1 dosya kapsamını dolanamaz.
 * ACCT-5A'nın büro içi mali okuma yetkisi korunur (bayrak kapalı: bugünkü davranış); bayrak açıkken dosya kapsamı AYRICA uygulanır.
 * Yevmiye mizanı ve geçiş hazırlığı büro düzeyinde, mevcut yönetici yetkisinde kalır (bu spec'te değişmediği ölçülür).
 * Gerçek HTTP (ilgili modüller + ValidationPipe) + tek kullanımlık PostgreSQL; JWT yerine DB kimliği.
 *
 * Yöntem FARKSALDIR: her uç için bayrak kapalıyken ilişkisiz kullanıcının aldığı yanıt TABAN alınır. Bayrak açıkken
 *  - dosyayı gören aktör tabanla AYNI durumu alır (kapı görünür dosyada davranışı değiştirmez),
 *  - görmeyen aktör içerik üretilmeden 404 alır; kapsam dışı = var olmayan = başka büronun dosyası (aynı gövde).
 * Taban hiçbir uçta kapının 404 gövdesine eşit değildir (aksi halde kapının etkisi ölçülemezdi; aşağıda doğrulanır).
 * Yeni kural / anahtar / bayrak YOK (CaseViewScopeService). Kod okuması gerçek erişim kanıtı değildir.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Case financial reads view scope requires TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

describeDb("F02 P3 tarama S1 — dosya düzeyi mali okumalar (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(600_000);
  const flag = scopeFlag();
  let db: PrismaClient;
  let app: INestApplication;
  let w: ScopeWorld;
  const http = scopeHttp(() => app);
  const ALL: CaseKey[] = [...A_CASE_KEYS, "b1"];
  const claim = {} as Record<CaseKey, string>;
  const collection = {} as Record<CaseKey, string>;
  const record = {} as Record<CaseKey, string>;
  const client = {} as Record<string, string>;
  const mismatch = { claimItem: "", collection: "" };
  const amount = (k: CaseKey) => 1000 + ALL.indexOf(k) * 111; // dosyaya özgü tutar: 1000, 1111, 1222, …
  const tenantOf = (k: CaseKey) => (k === "b1" ? w.tB : w.tA);

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    app = await buildScopeApp(() => db, [
      CaseModule,
      AccountingJournalTrialBalanceModule,
      BalanceDisplayShadowDiffModule,
      BalanceShadowCompareModule,
      ClaimItemModule,
      CollectionModule,
      CostPackageModule,
      InterestEngineModule,
      PaymentInstructionModule,
      SummaryEngineModule,
    ]);
    w = await createScopeWorld(db, "fin");
    for (const tenantId of [w.tA, w.tB]) {
      client[tenantId] = (await db.client.create({ data: { tenantId, type: "COMPANY", name: `MUVEKKIL-${w.suffix}` } as never })).id;
    }
    const writer = app.get(AuditWriterService);
    for (const k of ALL) {
      const tenantId = tenantOf(k);
      const caseId = w.c[k];
      claim[k] = (
        await db.claimItem.create({
          data: { tenantId, caseId, itemType: "PRINCIPAL", originalAmount: amount(k), demandedAmount: amount(k), amount: amount(k), currency: "TRY" } as never,
        })
      ).id;
      collection[k] = (
        await db.collection.create({
          data: { tenantId, caseId, amount: amount(k), currency: "TRY", type: "TAHSILAT", date: new Date("2026-10-01T00:00:00.000Z"), idempotencyKey: `fin-${k}-${w.suffix}`, status: "CONFIRMED" } as never,
        })
      ).id;
      record[k] = await writer.writeRecord(
        { caseId, inputHash: "0".repeat(64), request: { iz: `KAYIT-${k}-${w.suffix}` }, totalInterest: amount(k), totalDue: amount(k), segmentCount: 0, warningCount: 0, rateTableVersion: "t", engineVersion: "t", interpretationProfileId: "t", mode: "PREVIEW" } as never,
        tenantId,
      );
    }
    // Nesne–kiracı uyuşmazlığı: satır büro A'da, gösterdiği dosya büro B'de (tenantId ile dosya arasında DB kısıtı yok).
    mismatch.claimItem = (await db.claimItem.create({ data: { tenantId: w.tA, caseId: w.c.b1, itemType: "PRINCIPAL", originalAmount: 1, demandedAmount: 1, amount: 1, currency: "TRY" } as never })).id;
    mismatch.collection = (
      await db.collection.create({ data: { tenantId: w.tA, caseId: w.c.b1, amount: 1, currency: "TRY", type: "TAHSILAT", date: new Date("2026-10-01T00:00:00.000Z"), idempotencyKey: `fin-mm-${w.suffix}`, status: "CONFIRMED" } as never })
    ).id;
  });

  afterAll(async () => {
    flag.restore();
    await w.cleanup(async (tenantIds) => {
      for (const tenantId of tenantIds) {
        await db.collection.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.claimItem.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.client.deleteMany({ where: { tenantId } }).catch(() => undefined);
      }
    });
    await app?.close();
    await db.$disconnect();
  });

  type Hidden = { statusCode: number; message: string; error: string };
  type Route = {
    name: string;
    call: (actor: string, k: CaseKey | "missing") => request.Test;
    /** Görünmeyen dosyada beklenen yanıt; `empty`: uç kapsam dışı dosyada da var olmayan dosyadaki gibi boş liste döner. */
    hidden: Hidden | ((k: CaseKey | "missing") => Hidden) | "empty";
  };
  const id = (k: CaseKey | "missing") => (k === "missing" ? w.missing : w.c[k]);
  const obj = (map: Record<CaseKey, string>, k: CaseKey | "missing") => (k === "missing" ? w.missing : map[k]);
  const nf = (message: string): Hidden => ({ statusCode: 404, message, error: "Not Found" });
  const get = (path: (k: CaseKey | "missing") => string, hidden: Route["hidden"] = CASE_NOT_FOUND) => ({ call: (actor: string, k: CaseKey | "missing") => http.get(actor, path(k)), hidden });
  const post = (path: (k: CaseKey | "missing") => string, body: (k: CaseKey | "missing") => object, hidden: Route["hidden"] = CASE_NOT_FOUND) => ({
    call: (actor: string, k: CaseKey | "missing") => http.post(actor, path(k), body(k)),
    hidden,
  });
  const statementQuery = (k: CaseKey | "missing") =>
    `statementType=CLIENT_CASE_STATEMENT&from=2026-01-01&to=2026-12-31&dateBasis=postedAt&currency=TRY&caseId=${id(k)}&clientId=${client[k === "b1" ? w.tB : w.tA]}`;

  const ROUTES: Route[] = [
    { name: "GET accounting-journal/financial-statements?caseId", ...get((k) => `/accounting-journal/financial-statements?${statementQuery(k)}`) },
    { name: "GET interest-engine/case/:caseId/balance/display/shadow-diff", ...get((k) => `/interest-engine/case/${id(k)}/balance/display/shadow-diff`) },
    { name: "GET balance-compare/case/:caseId", ...get((k) => `/balance-compare/case/${id(k)}`) },
    { name: "POST cases/:caseId/payment-preview", ...post((k) => `/cases/${id(k)}/payment-preview`, () => ({ amount: 100 })) },
    { name: "GET claim-items/case/:caseId", ...get((k) => `/claim-items/case/${id(k)}`) },
    { name: "GET claim-items/:id", ...get((k) => `/claim-items/${obj(claim, k)}`, nf("Alacak kalemi bulunamadı")) },
    { name: "GET claim-items/case/:caseId/summary", ...get((k) => `/claim-items/case/${id(k)}/summary`) },
    { name: "POST claim-items/case/:caseId/validate", ...post((k) => `/claim-items/case/${id(k)}/validate`, () => ({})) },
    { name: "GET collections/:id", ...get((k) => `/collections/${obj(collection, k)}`, nf("Tahsilat bulunamadı")) },
    { name: "GET collections/case/:caseId", ...get((k) => `/collections/case/${id(k)}`) },
    { name: "GET collections/cover/:caseId", ...get((k) => `/collections/cover/${id(k)}`) },
    { name: "GET collections/check-completion/:caseId", ...get((k) => `/collections/check-completion/${id(k)}`) },
    { name: "POST cost-packages/compute (gövde caseId)", ...post(() => `/cost-packages/compute`, (k) => ({ caseId: id(k), packageCode: "YOK-PAKET", acceptIncomplete: true })) },
    { name: "GET interest-engine/case/:caseId/balance", ...get((k) => `/interest-engine/case/${id(k)}/balance`) },
    { name: "GET interest-engine/case/:caseId/balance/display", ...get((k) => `/interest-engine/case/${id(k)}/balance/display`) },
    { name: "GET interest-engine/records/:id", ...get((k) => `/interest-engine/records/${obj(record, k)}`, (k) => nf(`Record ${obj(record, k)} not found`)) },
    { name: "GET interest-engine/records?caseId", ...get((k) => `/interest-engine/records?caseId=${id(k)}`, "empty") },
    { name: "GET interest-engine/trace/:recordId", ...get((k) => `/interest-engine/trace/${obj(record, k)}`, (k) => nf(`Trace for record ${obj(record, k)} not found`)) },
    { name: "POST payment-instructions (gövde caseId)", ...post(() => `/payment-instructions`, (k) => ({ caseId: id(k), payerType: "DEBTOR", purpose: "DEBT_PAYMENT", amount: 10 })) },
    { name: "POST payment-instructions/debtor (gövde caseId)", ...post(() => `/payment-instructions/debtor`, (k) => ({ caseId: id(k), amount: 10, debtorName: "x" })) },
    { name: "POST payment-instructions/fee (gövde caseId)", ...post(() => `/payment-instructions/fee`, (k) => ({ caseId: id(k), purpose: "APPLICATION_FEE", amount: 10 })) },
    { name: "GET summary-engine/case/:caseId", ...get((k) => `/summary-engine/case/${id(k)}`) },
  ];
  const named = ROUTES.map((r) => [r.name, r] as const);
  const hiddenOf = (r: Route, k: CaseKey | "missing"): Hidden | "empty" => (typeof r.hidden === "function" ? r.hidden(k) : r.hidden);
  const expectHidden = (r: Route, k: CaseKey | "missing", res: request.Response, label: string) => {
    const hidden = hiddenOf(r, k);
    if (hidden === "empty") expect([label, k, res.status, res.body]).toEqual([label, k, 200, []]);
    else expectHiddenResponse(res, hidden, k === "missing" ? [] : [w.fileNo(k), String(amount(k))]);
  };
  /** Karşılaştırma için gövde: üretim anı damgaları (ISO, milisaniyeli) sabitlenir; başka hiçbir alan değiştirilmez. */
  const stable = (body: unknown) => JSON.parse(JSON.stringify(body ?? null).replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, "<an>"));
  /** Bayrak kapalı taban: ilişkisiz kullanıcının her büro A dosyasındaki durumu. */
  const baseline = new Map<string, Record<ACaseKey, number>>();

  it("envanter: bu spec S1'in çalışan uygulamadaki 22 erişilebilir ucunu ölçer (`collections/summary` gölgede; ayrıca ölçülür)", () => {
    expect(ROUTES).toHaveLength(22);
    expect(new Set(ROUTES.map((r) => r.name)).size).toBe(22);
  });

  describe("bayrak KAPALI — bugünkü davranış (taban)", () => {
    beforeAll(() => flag.off());

    it.each(named)("%s: ilişkisiz kullanıcı kiracının her dosyasında aynı sınıftan yanıt alır; taban kapının 404 gövdesi değildir", async (_n, r) => {
      const row = {} as Record<ACaseKey, number>;
      for (const k of A_CASE_KEYS) {
        const res = await r.call(w.u.nobody, k);
        row[k] = res.status;
        expect([k, res.status]).not.toEqual([k, 401]);
        expect([k, res.status]).not.toEqual([k, 403]);
        const hidden = hiddenOf(r, k);
        if (hidden === "empty") expect([k, JSON.stringify(res.body)]).not.toEqual([k, "[]"]);
        else expect([k, res.body]).not.toEqual([k, hidden]);
      }
      expect(new Set(Object.values(row)).size).toBe(1); // dosyalar eş kuruldu: taban durumu dosyadan bağımsız
      baseline.set(r.name, row);
    });

    it("okuma uçları dosyanın tutarını gerçekten taşır (alacak kalemi, tahsilat, hesap kaydı)", async () => {
      const items = await http.get(w.u.nobody, `/claim-items/case/${w.c.c6}`);
      expect([items.status, JSON.stringify(items.body).includes(String(amount("c6")))]).toEqual([200, true]);
      const one = await http.get(w.u.nobody, `/collections/${collection.c6}`);
      expect([one.status, one.body.id, Number(one.body.amount)]).toEqual([200, collection.c6, amount("c6")]);
      const rec = await http.get(w.u.nobody, `/interest-engine/records/${record.c6}`);
      expect([rec.status, rec.body.caseId, rec.body.totalDue]).toEqual([200, w.c.c6, amount("c6")]);
      const list = await http.get(w.u.nobody, `/interest-engine/records?caseId=${w.c.c6}`);
      expect((list.body as Array<{ id: string }>).map((x) => x.id)).toEqual([record.c6]);
    });

    it("kiracı sınırı bayraktan bağımsız: büro A kullanıcısı büro B dosyasının verisini alamaz", async () => {
      for (const r of ROUTES) {
        const res = await r.call(w.u.nobody, "b1");
        const text = JSON.stringify(res.body ?? {});
        expect([r.name, text.includes(w.fileNo("b1")), text.includes(String(amount("b1")))]).toEqual([r.name, false, false]);
      }
    });
  });

  describe("bayrak AÇIK — görünürlük (D1 dalları)", () => {
    beforeAll(() => flag.on());
    afterAll(() => flag.off());

    it.each(named)("%s: görünür dosyada taban durumu, kapsam dışı dosyada içerik üretilmeden 404", async (_n, r) => {
      const base = baseline.get(r.name)!;
      expect(base).toBeDefined();
      for (const [label, actor, visible] of w.visibility) {
        for (const k of A_CASE_KEYS) {
          const res = await r.call(actor, k);
          if ((visible as ACaseKey[]).includes(k)) expect([label, k, res.status]).toEqual([label, k, base[k]]);
          else expectHidden(r, k, res, label);
        }
      }
    });

    it.each(named)("%s: var olmayan dosya = kapsam dışı dosya = başka büronun dosyası", async (_n, r) => {
      const hidden = await r.call(w.u.nobody, "c6");
      const missing = await r.call(w.u.nobody, "missing");
      const foreign = await r.call(w.u.allow, "b1");
      expectHidden(r, "c6", hidden, "kapsam dışı");
      expectHidden(r, "missing", missing, "yok");
      expectHidden(r, "b1", foreign, "başka büro");
      if (typeof r.hidden !== "function") {
        expect(missing.body).toEqual(hidden.body);
        expect(foreign.body).toEqual(hidden.body);
      }
    });

    it("büro geneli izinli kullanıcının yanıtı tabanla aynıdır (yanıt eşitliği: bayrak kapalı ilişkisiz = bayrak açık izinli)", async () => {
      for (const r of ROUTES) {
        flag.off();
        const before = await r.call(w.u.nobody, "c6");
        flag.on();
        const after = await r.call(w.u.allow, "c6");
        expect([r.name, after.status, stable(after.body)]).toEqual([r.name, before.status, stable(before.body)]);
      }
    });

    it("iki kiracı: büro B'nin izinli kullanıcısı büro A dosyasını okuyamaz; ilişkisiz kullanıcısı kendi dosyasını da okuyamaz", async () => {
      for (const r of ROUTES) {
        expectHidden(r, "c1", await r.call(w.v.allow, "c1"), `${r.name} B→A`);
        expectHidden(r, "b1", await r.call(w.v.nobody, "b1"), `${r.name} B ilişkisiz`);
      }
    });

    it("ilişki–dosya ve nesne–kiracı uyuşmazlığı görünürlük üretmez", async () => {
      for (const r of ROUTES) expectHidden(r, "b1", await r.call(w.u.link, "b1"), `${r.name} link→b1`);
      const scope = app.get(CaseViewScopeService);
      for (const [kind, objectId] of Object.entries(mismatch) as Array<["claimItem" | "collection", string]>) {
        await expect(scope.isCaseObjectVisible(w.tA, w.u.allow, kind, objectId)).resolves.toBe(false);
        await expect(scope.isCaseObjectVisible(w.tB, w.v.allow, kind, objectId)).resolves.toBe(false);
      }
      expect((await http.get(w.u.allow, `/claim-items/${mismatch.claimItem}`)).body).toEqual(nf("Alacak kalemi bulunamadı"));
      expect((await http.get(w.v.allow, `/collections/${mismatch.collection}`)).body).toEqual(nf("Tahsilat bulunamadı"));
    });

    it("kimliksiz istek 401 alır (kapı kimlik doğrulamadan SONRA çalışır; yöntem düzeyi kimlik kapılı uçlar dahil)", async () => {
      for (const path of [
        `/interest-engine/case/${w.c.c1}/balance`,
        `/interest-engine/case/${w.c.c1}/balance/display`,
        `/interest-engine/case/${w.c.c1}/balance/display/shadow-diff`,
        `/balance-compare/case/${w.c.c1}`,
        `/claim-items/case/${w.c.c1}`,
        `/collections/${collection.c1}`,
        `/interest-engine/records/${record.c1}`,
        `/accounting-journal/financial-statements?${statementQuery("c1")}`,
      ]) {
        expect([path, (await http.anonymous(path)).status]).toEqual([path, 401]);
      }
    });

    it("sorgu / gövde kimliği güvenilmez: dizi ya da nesne verilirse dosya çözülmez (404), kapı atlanmaz", async () => {
      const q = statementQuery("c6").replace(`caseId=${w.c.c6}`, `caseId=${w.c.c1}&caseId=${w.c.c6}`);
      expectHiddenResponse(await http.get(w.u.resp, `/accounting-journal/financial-statements?${q}`), CASE_NOT_FOUND, []);
      expectHiddenResponse(await http.post(w.u.resp, `/payment-instructions/debtor`, { caseId: [w.c.c1], amount: 10, debtorName: "x" }), CASE_NOT_FOUND, []);
      expectHiddenResponse(await http.post(w.u.resp, `/payment-instructions/debtor`, { amount: 10, debtorName: "x" }), CASE_NOT_FOUND, []);
      expectHiddenResponse(await http.post(w.u.resp, `/cost-packages/compute`, { caseId: { id: w.c.c1 }, packageCode: "YOK-PAKET" }), CASE_NOT_FOUND, []);
    });

    it("dosyasız masraf paketi hesabı (gövdede dosya kimliği yok) kapıdan geçer: yanıt bayrak kapalıyken aldığıyla aynı", async () => {
      flag.off();
      const before = await http.post(w.u.nobody, `/cost-packages/compute`, { packageCode: "YOK-PAKET" });
      flag.on();
      const after = await http.post(w.u.nobody, `/cost-packages/compute`, { packageCode: "YOK-PAKET" });
      expect([after.status, after.body]).toEqual([before.status, before.body]);
      expect(after.body).not.toEqual(CASE_NOT_FOUND);
    });
  });

  describe("GET collections/summary — bugün `collections/:id` rotasının gölgesinde; servis süzgeci ayrıca ölçülür", () => {
    afterAll(() => flag.off());

    it("gölge: istek `:id` rotasına düşer ('summary' kimlikli tahsilat aranır → 404); bayrak açıkken de aynı gövde", async () => {
      flag.off();
      const before = await http.get(w.u.nobody, `/collections/summary`);
      flag.on();
      const after = await http.get(w.u.nobody, `/collections/summary`);
      expect([before.status, before.body]).toEqual([404, nf("Tahsilat bulunamadı")]);
      expect(after.body).toEqual(before.body);
    });

    it("servis: dosya süzgeci verilirse toplam yalnız o dosyaların tahsilatlarından oluşur (D1 dalları); süzgeçsiz çağrı büro toplamıdır", async () => {
      const service = app.get(CollectionService);
      const scope = app.get(CaseViewScopeService);
      const total = (keys: readonly ACaseKey[]) => keys.reduce((sum, k) => sum + amount(k), 0);
      flag.off();
      expect((await service.getSummary(w.tA, undefined, "TRY")).totalCollected).toBe(total(A_CASE_KEYS) + 1); // + uyuşmazlık satırı (büro A kiracılı)
      expect(await scope.caseRowFilter(w.tA, w.u.nobody)).toBeUndefined();
      flag.on();
      for (const [label, actor, visible] of w.visibility) {
        const filter = await scope.caseRowFilter(w.tA, actor);
        const summary = await service.getSummary(w.tA, undefined, "TRY", filter);
        const expected = visible.length === A_CASE_KEYS.length ? total(A_CASE_KEYS) + (filter ? 0 : 1) : total(visible as ACaseKey[]);
        expect([label, summary.totalCollected]).toEqual([label, expected]);
      }
    });
  });

  describe("S1 istisnası — yevmiye mizanı ve geçiş hazırlığı büro düzeyinde, mevcut yönetici yetkisinde kalır", () => {
    afterAll(() => flag.off());
    const OFFICE = [`/accounting-journal/trial-balance?from=2026-01-01&to=2026-12-31&dateBasis=postedAt&currency=TRY`, `/accounting-journal/cutover-readiness`];

    it.each(OFFICE)("%s: yönetici olmayan 403 (bayraktan bağımsız); yöneticinin yanıtı bayrakla değişmez", async (path) => {
      for (const on of [false, true]) {
        on ? flag.on() : flag.off();
        expect([on, (await http.get(w.u.allow, path)).status]).toEqual([on, 403]);
        expect([on, (await http.get(w.u.resp, path)).status]).toEqual([on, 403]);
      }
      flag.off();
      const before = await http.get(w.u.admin, path);
      flag.on();
      const after = await http.get(w.u.admin, path);
      expect(before.status).not.toBe(403);
      expect([after.status, stable(after.body)]).toEqual([before.status, stable(before.body)]);
    });
  });

  describe("yazım yolları kapsama bağlanmadı (mevcut işlem yetkileri geçerli)", () => {
    afterAll(() => flag.off());
    it("POST claim-items/case/:caseId/recalculate-interest: ilişkisiz kullanıcı bayrak açıkken de aynı yanıtı alır", async () => {
      flag.off();
      const before = await http.post(w.u.nobody, `/claim-items/case/${w.c.c6}/recalculate-interest`, {});
      flag.on();
      const after = await http.post(w.u.nobody, `/claim-items/case/${w.c.c6}/recalculate-interest`, {});
      expect(after.status).toBe(before.status);
      expect(after.body).not.toEqual(CASE_NOT_FOUND);
    });
  });
});
