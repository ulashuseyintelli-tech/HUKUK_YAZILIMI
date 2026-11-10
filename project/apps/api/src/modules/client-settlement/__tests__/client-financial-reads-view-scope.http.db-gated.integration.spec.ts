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
import { CLIENT_TOTAL_SCOPE_DENIED, CaseViewScopeService } from "../../case/case-view-scope.service";
import { ClientFinancialDisclosureModule } from "../../client-financial-disclosure/client-financial-disclosure.module";
import { ClientStatementModule } from "../../client-statement/client-statement.module";
import { ClientSettlementModule } from "../client-settlement.module";

/**
 * F02 P3 tarama S3 (owner kararı 09.11.2026) — müvekkil mali okumaları D1 dosya kapsamını dolanamaz.
 *  - DOSYA düzeyi okumalar kapılanır: kapsam dışı = var olmayan (aynı 404), içerik üretilmez.
 *  - MÜVEKKİLİN TÜM HESABINI temsil eden belgeler eksik dosyalarla ÜRETİLMEZ: müvekkilin dosyalarından birini bile göremeyen
 *    kullanıcı 403 alır (kısmi toplam yok; hangi dosyanın gizli olduğu söylenmez).
 *  - Liste / kuyruklar yalnız görünen dosyaların satırlarını taşır (sayı ve sayfalama aynı süzgeçle).
 *  - Dosya görünüm izni mevcut mali işlem yetkilerinin YERİNE GEÇMEZ (aşağıda ölçülür).
 * Gerçek HTTP (ClientSettlement + ClientStatement + ClientFinancialDisclosure modülleri) + tek kullanımlık PostgreSQL.
 *
 * Müvekkil K'nın dosyaları: c1, c4, c6. Müvekkil K2'nin tek dosyası: c1. D1 dallarına göre K'nın bütün dosyalarını yalnız büro
 * geneli görenler görür; Dosya Sorumlusu (c1) K2'nin bütün dosyalarını görür ama K'nınkileri görmez.
 * Yöntem farksaldır: bayrak kapalıyken ilişkisiz kullanıcının yanıtı taban alınır. Kod okuması gerçek erişim kanıtı değildir.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Client financial reads view scope requires TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

describeDb("F02 P3 tarama S3 — müvekkil mali okumaları (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(600_000);
  const flag = scopeFlag();
  let db: PrismaClient;
  let app: INestApplication;
  let w: ScopeWorld;
  const http = scopeHttp(() => app);
  const K_KEYS: ACaseKey[] = ["c1", "c4", "c6"];
  const K = { id: "", k2: "", b: "" };
  const cc = {} as Record<string, string>; // caseClient: K@c1, K@c4, K@c6, K2@c1, B@b1
  const collection = {} as Record<string, string>;
  const disposition = {} as Record<string, string>;
  const payout = {} as Record<string, string>;
  const reversal = {} as Record<string, string>;
  const caseStatement = {} as Record<string, string>;
  const disclosure = {} as Record<string, string>;
  const version = {} as Record<string, string>;
  const obj = { offsetVisiblePair: "", offsetMixedPair: "", clientStatementK: "", clientStatementK2: "", mismatchDisposition: "", mismatchReversal: "" };
  const amount = (k: string) => 2000 + ["c1", "c3", "c4", "c5", "c6", "b1"].indexOf(k) * 137;
  const DENIED = { statusCode: undefined, ...CLIENT_TOTAL_SCOPE_DENIED };
  const nf = (message: string) => ({ statusCode: 404, message, error: "Not Found" });
  const seesAllK = (visible: readonly string[]) => K_KEYS.every((k) => visible.includes(k));
  const text = (res: request.Response) => JSON.stringify(res.body ?? {});
  const date = new Date("2026-10-01T00:00:00.000Z");

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    app = await buildScopeApp(() => db, [ClientSettlementModule, ClientStatementModule, ClientFinancialDisclosureModule]);
    w = await createScopeWorld(db, "cfin");
    K.id = (await db.client.create({ data: { tenantId: w.tA, type: "COMPANY", name: `MUVEKKIL-K-${w.suffix}` } as never })).id;
    K.k2 = (await db.client.create({ data: { tenantId: w.tA, type: "COMPANY", name: `MUVEKKIL-K2-${w.suffix}` } as never })).id;
    K.b = (await db.client.create({ data: { tenantId: w.tB, type: "COMPANY", name: `MUVEKKIL-B-${w.suffix}` } as never })).id;
    const link = async (key: string, clientId: string, k: CaseKey) => (cc[key] = (await db.caseClient.create({ data: { caseId: w.c[k], clientId, role: "ALACAKLI" } as never })).id);
    for (const k of K_KEYS) await link(k, K.id, k);
    await link("k2", K.k2, "c1");
    await link("b1", K.b, "b1");

    for (const k of [...K_KEYS, "b1"] as CaseKey[]) {
      const tenantId = k === "b1" ? w.tB : w.tA;
      const caseId = w.c[k];
      const caseClientId = cc[k];
      collection[k] = (
        await db.collection.create({ data: { tenantId, caseId, amount: amount(k), currency: "TRY", type: "TAHSILAT", date, idempotencyKey: `cfin-${k}-${w.suffix}`, status: "CONFIRMED" } as never })
      ).id;
      disposition[k] = (
        await db.collectionDisposition.create({ data: { tenantId, caseId, collectionId: collection[k], caseClientId, beneficiaryScope: "SINGLE_CASE_CLIENT", totalAmount: amount(k), currency: "TRY" } as never })
      ).id;
      payout[k] = (
        await db.clientPayout.create({ data: { tenantId, caseId, caseClientId, amount: amount(k), currency: "TRY", idempotencyKey: `cfin-po-${k}-${w.suffix}`, paidById: w.u.admin, paidAt: date, status: "RECORDED" } as never })
      ).id;
      reversal[k] = (await db.clientPayoutManualReversal.create({ data: { tenantId, caseId, caseClientId, amount: amount(k), currency: "TRY", dedupeKey: `cfin-rv-${k}-${w.suffix}` } as never })).id;
      caseStatement[k] = (
        await db.clientStatement.create({
          data: { tenantId, clientId: k === "b1" ? K.b : K.id, caseId, periodStart: date, periodEnd: date, openingBalance: 0, closingBalance: amount(k), generatedById: w.u.admin } as never,
        })
      ).id;
      disclosure[k] = (await db.clientFinancialDisclosure.create({ data: { tenantId, caseId, caseClientId, collectionDispositionId: disposition[k] } as never })).id;
      version[k] = (
        await db.clientFinancialDisclosureVersion.create({
          data: {
            tenantId,
            disclosureId: disclosure[k],
            version: 1,
            sourceCollectionId: collection[k],
            sourceCollectionAmount: amount(k),
            sourceCollectionDate: date,
            dispositionTotalAmount: amount(k),
            dispositionPostedAt: date,
            totalCollected: amount(k),
            clientNetAmount: amount(k),
            snapshotHash: `h-${k}-${w.suffix}`,
            sourceFingerprint: `f-${k}-${w.suffix}`,
            sendIdempotencyKey: `s-${k}-${w.suffix}`,
          } as never,
        })
      ).id;
    }
    const offset = async (key: string, payable: ACaseKey, expense: ACaseKey) =>
      (
        await db.clientOffset.create({
          data: { tenantId: w.tA, clientId: K.id, amount: 55, currency: "TRY", kind: "APPLY", payableCaseId: w.c[payable], payableCaseClientId: cc[payable], expenseCaseId: w.c[expense], expenseRequestId: `yok-${key}-${w.suffix}`, idempotencyKey: `cfin-of-${key}-${w.suffix}`, createdById: w.u.admin } as never,
        })
      ).id;
    obj.offsetVisiblePair = await offset("vv", "c1", "c1"); // iki bacak da c1
    obj.offsetMixedPair = await offset("mx", "c1", "c6"); // ödenecek c1, masraf c6
    const clientStatement = async (clientId: string) =>
      (await db.clientStatement.create({ data: { tenantId: w.tA, clientId, caseId: null, periodStart: date, periodEnd: date, openingBalance: 0, closingBalance: 4242, generatedById: w.u.admin } as never })).id;
    obj.clientStatementK = await clientStatement(K.id);
    obj.clientStatementK2 = await clientStatement(K.k2);
    // Nesne–kiracı uyuşmazlığı: satır büro A'da, gösterdiği dosya büro B'de.
    const mismatchCollection = await db.collection.create({ data: { tenantId: w.tA, caseId: w.c.b1, amount: 1, currency: "TRY", type: "TAHSILAT", date, idempotencyKey: `cfin-mm-${w.suffix}`, status: "CONFIRMED" } as never });
    obj.mismatchDisposition = (
      await db.collectionDisposition.create({ data: { tenantId: w.tA, caseId: w.c.b1, collectionId: mismatchCollection.id, beneficiaryScope: "SINGLE_CASE_CLIENT", totalAmount: 1, currency: "TRY" } as never })
    ).id;
    obj.mismatchReversal = (await db.clientPayoutManualReversal.create({ data: { tenantId: w.tA, caseId: w.c.b1, caseClientId: cc.b1, amount: 1, currency: "TRY", dedupeKey: `cfin-rv-mm-${w.suffix}` } as never })).id;
  });

  afterAll(async () => {
    flag.restore();
    await w.cleanup(async (tenantIds) => {
      for (const tenantId of tenantIds) {
        await db.clientFinancialDisclosureVersion.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.clientFinancialDisclosure.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.clientStatement.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.clientOffset.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.clientPayoutManualReversal.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.clientPayout.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.collectionDisposition.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.collection.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.caseClient.deleteMany({ where: { case: { tenantId } } }).catch(() => undefined);
        await db.client.deleteMany({ where: { tenantId } }).catch(() => undefined);
      }
    });
    await app?.close();
    await db.$disconnect();
  });

  // ---------------------------------------------------------------------------------------------------------------------------
  // 1) Müvekkil düzeyi mali belgeler: bütün dosyalar görünür değilse 403
  // ---------------------------------------------------------------------------------------------------------------------------
  const TOTAL: Array<[string, (clientId: string) => string]> = [
    ["GET clients/:clientId/accounting/summary", (c) => `/clients/${c}/accounting/summary`],
    ["GET clients/:clientId/accounting/movements (müvekkil geneli)", (c) => `/clients/${c}/accounting/movements`],
    ["GET client-offsets/client/:clientId/eligibility", (c) => `/client-offsets/client/${c}/eligibility`],
    ["GET client-offsets/client/:clientId", (c) => `/client-offsets/client/${c}`],
    ["GET client-statements/client/:clientId", (c) => `/client-statements/client/${c}`],
  ];

  describe("müvekkil düzeyi mali belgeler — eksik dosyalarla üretilmez (403)", () => {
    afterAll(() => flag.off());

    it.each(TOTAL)("%s: bayrak kapalı taban 200; bayrak açıkken yalnız müvekkilin BÜTÜN dosyalarını gören okur", async (_n, path) => {
      flag.off();
      const base = await http.get(w.u.nobody, path(K.id));
      expect(base.status).toBe(200);
      flag.on();
      for (const [label, actor, visible] of w.visibility) {
        const res = await http.get(actor, path(K.id));
        if (seesAllK(visible)) expect([label, res.status]).toEqual([label, 200]);
        else {
          expect([label, res.status, res.body]).toEqual([label, 403, CLIENT_TOTAL_SCOPE_DENIED]);
          for (const k of K_KEYS) expect([label, k, text(res).includes(w.fileNo(k)), text(res).includes(w.c[k])]).toEqual([label, k, false, false]);
        }
      }
      void DENIED;
    });

    it.each(TOTAL)("%s: tek dosyalı müvekkil K2 — Dosya Sorumlusu (c1) okur; c1'i görmeyen 403 alır", async (_n, path) => {
      flag.on();
      expect((await http.get(w.u.resp, path(K.k2))).status).toBe(200);
      const denied = await http.get(w.u.staff, path(K.k2));
      expect([denied.status, denied.body]).toEqual([403, CLIENT_TOTAL_SCOPE_DENIED]);
      // K'nın c1'ini görmek K'nın bütününü görmek değildir.
      expect((await http.get(w.u.resp, path(K.id))).status).toBe(403);
    });

    it("var olmayan / başka büronun müvekkili: kapı dosya bulamaz, handler'ın kendi yanıtı döner (bayrakla değişmez); başka büronun verisi sızmaz", async () => {
      for (const [, path] of TOTAL) {
        for (const clientId of [w.missing, K.b]) {
          flag.off();
          const before = await http.get(w.u.nobody, path(clientId));
          flag.on();
          const after = await http.get(w.u.nobody, path(clientId));
          expect([path(clientId), after.status]).toEqual([path(clientId), before.status]);
          expect(text(after)).not.toContain(w.fileNo("b1"));
          expect(text(after)).not.toContain(String(amount("b1")));
        }
      }
    });

    it("GET client-statements/:id — müvekkil düzeyi (genel) ekstre: bütün dosyalar görünür değilse 403; dosya ekstresi dosya kapsamına bağlı (404)", async () => {
      flag.on();
      for (const [label, actor, visible] of w.visibility) {
        const general = await http.get(actor, `/client-statements/${obj.clientStatementK}`);
        if (seesAllK(visible)) expect([label, general.status, Number(general.body.closingBalance)]).toEqual([label, 200, 4242]);
        else expect([label, general.status, general.body]).toEqual([label, 403, CLIENT_TOTAL_SCOPE_DENIED]);
        for (const k of K_KEYS) {
          const res = await http.get(actor, `/client-statements/${caseStatement[k]}`);
          if ((visible as string[]).includes(k)) expect([label, k, res.status, res.body.id]).toEqual([label, k, 200, caseStatement[k]]);
          else expectHiddenResponse(res, nf("Ekstre bulunamadı"), [String(amount(k)), w.c[k]]);
        }
      }
      expect((await http.get(w.u.resp, `/client-statements/${obj.clientStatementK2}`)).status).toBe(200);
      expectHiddenResponse(await http.get(w.u.allow, `/client-statements/${w.missing}`), nf("Ekstre bulunamadı"), []);
      expectHiddenResponse(await http.get(w.u.allow, `/client-statements/${caseStatement.b1}`), nf("Ekstre bulunamadı"), [String(amount("b1"))]);
    });

    it("GET clients/:clientId/accounting/movements?scope=case&caseId — tek dosyaya daraltılmış istek o dosyanın kapısından geçer (404), müvekkil toplamı şartı aranmaz", async () => {
      flag.off();
      const base = await http.get(w.u.nobody, `/clients/${K.id}/accounting/movements?scope=case&caseId=${w.c.c1}`);
      flag.on();
      for (const [label, actor, visible] of w.visibility) {
        for (const k of K_KEYS) {
          const res = await http.get(actor, `/clients/${K.id}/accounting/movements?scope=case&caseId=${w.c[k]}`);
          if ((visible as string[]).includes(k)) expect([label, k, res.status]).toEqual([label, k, base.status]);
          else expectHiddenResponse(res, CASE_NOT_FOUND, [w.fileNo(k)]);
        }
      }
      // dosya kimliği var ama istek dosyaya daraltılmamış → müvekkil geneli döküm: bütün dosyalar gerekir
      const mixed = await http.get(w.u.resp, `/clients/${K.id}/accounting/movements?caseId=${w.c.c1}`);
      expect([mixed.status, mixed.body]).toEqual([403, CLIENT_TOTAL_SCOPE_DENIED]);
      expectHiddenResponse(await http.get(w.u.resp, `/clients/${K.id}/accounting/movements?scope=case&caseId=${w.missing}`), CASE_NOT_FOUND, []);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------------------
  // 2) Dosya düzeyi okumalar: kapsam dışı = var olmayan (404)
  // ---------------------------------------------------------------------------------------------------------------------------
  type CaseRoute = { name: string; call: (actor: string, k: CaseKey | "missing") => request.Test; hidden: { statusCode: number; message: string; error: string } };
  const caseId = (k: CaseKey | "missing") => (k === "missing" ? w.missing : w.c[k]);
  const of = (map: Record<string, string>, k: CaseKey | "missing") => (k === "missing" ? w.missing : map[k]);
  const CASE_ROUTES: CaseRoute[] = [
    { name: "GET collection-dispositions/case/:caseId", call: (a, k) => http.get(a, `/collection-dispositions/case/${caseId(k)}`), hidden: CASE_NOT_FOUND },
    { name: "GET collection-dispositions/case/:caseId/outstanding", call: (a, k) => http.get(a, `/collection-dispositions/case/${caseId(k)}/outstanding?caseClientId=${k === "missing" ? "x" : cc[k]}`), hidden: CASE_NOT_FOUND },
    { name: "GET client-statements/case/:caseId", call: (a, k) => http.get(a, `/client-statements/case/${caseId(k)}`), hidden: CASE_NOT_FOUND },
    { name: "GET client-payouts?caseId", call: (a, k) => http.get(a, `/client-payouts?caseId=${caseId(k)}`), hidden: CASE_NOT_FOUND },
    { name: "GET client-payout-manual-reversals/:id", call: (a, k) => http.get(a, `/client-payout-manual-reversals/${of(reversal, k)}`), hidden: nf("Manual reversal workflow bulunamadi") },
    { name: "POST collection-dispositions/:id/distribution-recommendation", call: (a, k) => http.post(a, `/collection-dispositions/${of(disposition, k)}/distribution-recommendation`, {}), hidden: nf("Dağıtım kaydı bulunamadı") },
  ];
  const namedCase = CASE_ROUTES.map((r) => [r.name, r] as const);
  const base = new Map<string, number>();

  describe("dosya düzeyi okumalar — kapsam dışı = var olmayan (404)", () => {
    afterAll(() => flag.off());

    it.each(namedCase)("%s: taban (bayrak kapalı, ilişkisiz kullanıcı) kapının 404 gövdesi değildir", async (_n, r) => {
      flag.off();
      const statuses = new Set<number>();
      for (const k of K_KEYS) {
        const res = await r.call(w.u.nobody, k);
        statuses.add(res.status);
        expect([k, res.body]).not.toEqual([k, r.hidden]);
        expect([401, 404]).not.toContain(res.status);
      }
      expect(statuses.size).toBe(1);
      base.set(r.name, [...statuses][0]);
    });

    it.each(namedCase)("%s: görünür dosyada taban durumu; kapsam dışı / var olmayan / başka büro aynı 404", async (_n, r) => {
      flag.on();
      for (const [label, actor, visible] of w.visibility) {
        // dağıtım önerisi mevcut hazırlama yetkisini de ister: görünürlük ölçümü yetkiden bağımsız dosyalarda yapılır
        for (const k of K_KEYS) {
          const res = await r.call(actor, k);
          if ((visible as string[]).includes(k)) expect([label, k, res.status === 404 && JSON.stringify(res.body) === JSON.stringify(r.hidden)]).toEqual([label, k, false]);
          else expectHiddenResponse(res, r.hidden, [w.fileNo(k), String(amount(k))]);
        }
      }
      expect((await r.call(w.u.allow, "c6")).status).toBe(base.get(r.name));
      const hidden = await r.call(w.u.nobody, "c6");
      expectHiddenResponse(hidden, r.hidden, [String(amount("c6"))]);
      expect((await r.call(w.u.nobody, "missing")).body).toEqual(hidden.body);
      expect((await r.call(w.u.allow, "b1")).body).toEqual(hidden.body);
      expect((await r.call(w.v.allow, "c1")).body).toEqual(hidden.body);
    });

    it("GET client-offsets/:offsetId/detail — mahsup iki dosyaya bağlıdır: ikisi de görünür olmalı", async () => {
      flag.off();
      expect((await http.get(w.u.nobody, `/client-offsets/${obj.offsetMixedPair}/detail`)).body).not.toEqual(nf("Mahsup kaydı bulunamadı"));
      flag.on();
      for (const [label, actor, visible] of w.visibility) {
        const sees = (k: string) => (visible as string[]).includes(k);
        const same = await http.get(actor, `/client-offsets/${obj.offsetVisiblePair}/detail`);
        const mixed = await http.get(actor, `/client-offsets/${obj.offsetMixedPair}/detail`);
        expect([label, "c1+c1", same.status === 404]).toEqual([label, "c1+c1", !sees("c1")]);
        expect([label, "c1+c6", mixed.status === 404]).toEqual([label, "c1+c6", !(sees("c1") && sees("c6"))]);
        if (mixed.status === 404) expectHiddenResponse(mixed, nf("Mahsup kaydı bulunamadı"), [w.c.c6, w.fileNo("c6")]);
      }
      expectHiddenResponse(await http.get(w.u.allow, `/client-offsets/${w.missing}/detail`), nf("Mahsup kaydı bulunamadı"), []);
    });

    it("POST client-offsets/preview — gövdedeki iki dosya da görünür olmalı (kapsam dışı / yok 404)", async () => {
      const body = (payable: string, expense: string) => ({ clientId: K.id, currency: "TRY", payableCaseId: payable, payableCaseClientId: cc.c1, expenseCaseId: expense, expenseRequestId: "yok", amount: "1" });
      flag.off();
      const before = await http.post(w.u.nobody, `/client-offsets/preview`, body(w.c.c1, w.c.c6));
      expect(before.body).not.toEqual(CASE_NOT_FOUND);
      flag.on();
      expect((await http.post(w.u.allow, `/client-offsets/preview`, body(w.c.c1, w.c.c6))).status).toBe(before.status);
      expectHiddenResponse(await http.post(w.u.resp, `/client-offsets/preview`, body(w.c.c1, w.c.c6)), CASE_NOT_FOUND, [w.fileNo("c6")]);
      expectHiddenResponse(await http.post(w.u.resp, `/client-offsets/preview`, body(w.c.c6, w.c.c1)), CASE_NOT_FOUND, [w.fileNo("c6")]);
      expectHiddenResponse(await http.post(w.u.resp, `/client-offsets/preview`, body(w.c.c1, w.missing)), CASE_NOT_FOUND, []);
      expect((await http.post(w.u.resp, `/client-offsets/preview`, body(w.c.c1, w.c.c1))).body).not.toEqual(CASE_NOT_FOUND);
    });

    it("nesne–kiracı uyuşmazlığı görünürlük üretmez (satır büro A'da, dosya büro B'de)", async () => {
      flag.on();
      const scope = app.get(CaseViewScopeService);
      await expect(scope.isCaseObjectVisible(w.tA, w.u.allow, "collectionDisposition", obj.mismatchDisposition)).resolves.toBe(false);
      await expect(scope.isCaseObjectVisible(w.tB, w.v.allow, "collectionDisposition", obj.mismatchDisposition)).resolves.toBe(false);
      await expect(scope.isCaseObjectVisible(w.tA, w.u.allow, "clientPayoutManualReversal", obj.mismatchReversal)).resolves.toBe(false);
      await expect(scope.isCaseObjectVisible(w.tB, w.v.allow, "clientPayoutManualReversal", obj.mismatchReversal)).resolves.toBe(false);
      expect((await http.get(w.u.allow, `/client-payout-manual-reversals/${obj.mismatchReversal}`)).body).toEqual(nf("Manual reversal workflow bulunamadi"));
    });
  });

  // ---------------------------------------------------------------------------------------------------------------------------
  // 3) Liste / kuyruklar: yalnız görünen dosyaların satırları
  // ---------------------------------------------------------------------------------------------------------------------------
  describe("liste ve kuyruklar — yalnız görünen dosyaların satırları", () => {
    afterAll(() => flag.off());
    const ids = (keys: readonly string[], map: Record<string, string>) => keys.map((k) => map[k]).sort();

    it("GET clients/:clientId/accounting/cases — müvekkilin dosya listesi görünen dosyalarla sınırlı", async () => {
      flag.off();
      const all = await http.get(w.u.nobody, `/clients/${K.id}/accounting/cases`);
      expect((all.body.data.items as Array<{ caseId: string }>).map((x) => x.caseId).sort()).toEqual(K_KEYS.map((k) => w.c[k]).sort());
      flag.on();
      for (const [label, actor, visible] of w.visibility) {
        const res = await http.get(actor, `/clients/${K.id}/accounting/cases`);
        const expected = K_KEYS.filter((k) => (visible as string[]).includes(k));
        expect([label, res.status, (res.body.data.items as Array<{ caseId: string }>).map((x) => x.caseId).sort()]).toEqual([label, 200, expected.map((k) => w.c[k]).sort()]);
        for (const k of K_KEYS.filter((x) => !expected.includes(x))) expect([label, k, text(res).includes(w.fileNo(k))]).toEqual([label, k, false]);
      }
    });

    it("GET client-payouts (dosya süzgeçsiz) — satırlar ve toplam sayı aynı süzgeçle", async () => {
      flag.off();
      const all = await http.get(w.u.nobody, `/client-payouts`);
      expect([all.status, (all.body.data.items as Array<{ id: string }>).map((x) => x.id).sort(), all.body.data.total]).toEqual([200, ids(K_KEYS, payout), K_KEYS.length]);
      flag.on();
      for (const [label, actor, visible] of w.visibility) {
        const res = await http.get(actor, `/client-payouts`);
        const expected = K_KEYS.filter((k) => (visible as string[]).includes(k));
        expect([label, res.status, (res.body.data.items as Array<{ id: string }>).map((x) => x.id).sort(), res.body.data.total]).toEqual([label, 200, ids(expected, payout), expected.length]);
      }
      const other = await http.get(w.v.allow, `/client-payouts`);
      expect((other.body.data.items as Array<{ id: string }>).map((x) => x.id)).toEqual([payout.b1]);
    });

    it("GET client-payout-manual-reversals — kuyruk ve toplam sayı aynı süzgeçle", async () => {
      flag.off();
      const all = await http.get(w.u.nobody, `/client-payout-manual-reversals`);
      expect([all.status, all.body.data.total]).toEqual([200, K_KEYS.length + 1]); // + uyuşmazlık satırı (büro A kiracılı, dosyası büro B'de)
      flag.on();
      for (const [label, actor, visible] of w.visibility) {
        const res = await http.get(actor, `/client-payout-manual-reversals`);
        const expected = K_KEYS.filter((k) => (visible as string[]).includes(k));
        expect([label, res.status, (res.body.data.items as Array<{ id: string }>).map((x) => x.id).sort(), res.body.data.total]).toEqual([label, 200, ids(expected, reversal), expected.length]);
      }
    });
  });

  // ---------------------------------------------------------------------------------------------------------------------------
  // 4) Mali bildirimler (dosya başına kayıt)
  // ---------------------------------------------------------------------------------------------------------------------------
  describe("müvekkil mali bildirimleri (büro yüzeyi) — bildirim dosya başınadır", () => {
    afterAll(() => flag.off());
    const P = (clientId: string) => `/client-financial-disclosures/office/clients/${clientId}`;
    const VERSION_ROUTES: Array<[string, (k: string) => string]> = [
      ["versions/:id", (k) => `${P(K.id)}/versions/${version[k]}`],
      ["versions/:id/preview", (k) => `${P(K.id)}/versions/${version[k]}/preview`],
      ["versions/:id/recipients", (k) => `${P(K.id)}/versions/${version[k]}/recipients`],
      ["versions/:id/timeline", (k) => `${P(K.id)}/versions/${version[k]}/timeline`],
      ["disclosures/:id/history", (k) => `${P(K.id)}/disclosures/${disclosure[k]}/history`],
    ];

    it("liste ve hazırlık kaynakları: yanıt yalnız görünen dosyaların kayıtlarını taşır; dosya süzgeci kapsam dışıysa var olmayanla aynı yanıt", async () => {
      for (const tail of ["", "/preparation-sources"]) {
        flag.off();
        const all = await http.get(w.u.nobody, `${P(K.id)}${tail}`);
        const missing = await http.get(w.u.nobody, `${P(K.id)}${tail}?caseId=${w.missing}`);
        flag.on();
        for (const [label, actor, visible] of w.visibility) {
          const res = await http.get(actor, `${P(K.id)}${tail}`);
          expect([label, tail, res.status]).toEqual([label, tail, all.status]);
          for (const k of K_KEYS) {
            if (all.status === 200 && text(all).includes(version[k])) expect([label, tail, k, text(res).includes(version[k])]).toEqual([label, tail, k, (visible as string[]).includes(k)]);
            if (!(visible as string[]).includes(k)) {
              expect([label, tail, k, text(res).includes(w.fileNo(k)), text(res).includes(disposition[k])]).toEqual([label, tail, k, false, false]);
              const filtered = await http.get(actor, `${P(K.id)}${tail}?caseId=${w.c[k]}`);
              expect([label, tail, k, filtered.status, filtered.body]).toEqual([label, tail, k, missing.status, missing.body]);
            }
          }
        }
      }
    });

    it.each(VERSION_ROUTES)("%s: kapsam dışı dosyanın bildirimi var olmayan bildirimle aynı yanıtı alır; görünür dosyada yanıt tabanla aynı durumda", async (_n, path) => {
      flag.off();
      const baseStatus = {} as Record<string, number>;
      for (const k of K_KEYS) baseStatus[k] = (await http.get(w.u.nobody, path(k))).status;
      flag.on();
      const missingVersion = await http.get(w.u.allow, path("c1").replace(version.c1, w.missing).replace(disclosure.c1, w.missing));
      for (const [label, actor, visible] of w.visibility) {
        for (const k of K_KEYS) {
          const res = await http.get(actor, path(k));
          if ((visible as string[]).includes(k)) expect([label, k, res.status]).toEqual([label, k, baseStatus[k]]);
          else {
            expect([label, k, res.status, res.body]).toEqual([label, k, missingVersion.status, missingVersion.body]);
            expect([label, k, text(res).includes(String(amount(k)))]).toEqual([label, k, false]);
          }
        }
      }
      expect(missingVersion.status).not.toBe(baseStatus.c1 === 200 ? 200 : -1);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------------------
  // 5) Bayrak kapalı uyumluluğu, mevcut yetkiler, yazım yolları
  // ---------------------------------------------------------------------------------------------------------------------------
  describe("bayrak kapalı uyumluluğu ve mevcut yetkiler", () => {
    afterAll(() => flag.off());

    it("bayrak kapalıyken kapsam servisi hiçbir süzgeç / ret üretmez", async () => {
      flag.off();
      const scope = app.get(CaseViewScopeService);
      await expect(scope.assertAllClientCasesVisible(w.tA, w.u.nobody, K.id)).resolves.toBeUndefined();
      await expect(scope.isCaseObjectVisible(w.tA, w.u.nobody, "clientOffset", obj.offsetMixedPair)).resolves.toBe(true);
      expect(await scope.caseRowFilter(w.tA, w.u.nobody)).toBeUndefined();
    });

    it("müvekkil toplamı kapısı: eksik aktör / müvekkil kimliği fail-closed (403); büro geneli izinli geçer", async () => {
      flag.on();
      const scope = app.get(CaseViewScopeService);
      await expect(scope.assertAllClientCasesVisible(w.tA, undefined, K.id)).rejects.toMatchObject({ status: 403 });
      await expect(scope.assertAllClientCasesVisible(w.tA, w.u.resp, undefined)).rejects.toMatchObject({ response: CLIENT_TOTAL_SCOPE_DENIED });
      await expect(scope.assertAllClientCasesVisible(w.tA, w.u.allow, K.id)).resolves.toBeUndefined();
      // başka büronun kullanıcısı için K'nın (büro A) dosyaları kendi kiracısında yoktur → kapı dosya bulmaz; veri de dönmez
      await expect(scope.assertAllClientCasesVisible(w.tB, w.v.nobody, K.id)).resolves.toBeUndefined();
    });

    it("dosya görünüm izni mali işlem yetkisinin yerine geçmez: dağıtım önerisi büro geneli görüntüleme izniyle de hazırlama yetkisi ister", async () => {
      flag.off();
      const before = await http.post(w.u.allow, `/collection-dispositions/${disposition.c1}/distribution-recommendation`, {});
      flag.on();
      const after = await http.post(w.u.allow, `/collection-dispositions/${disposition.c1}/distribution-recommendation`, {});
      expect([after.status, after.body]).toEqual([before.status, before.body]);
      expect(before.status).toBe(403); // mevcut hazırlama yetkisi (assertCanPrepareDisposition) — bayraktan bağımsız
    });

    it("yazım yolları kapsama bağlanmadı: POST client-payout-manual-reversals/:id/close ilişkisiz kullanıcıda bayrakla değişmez", async () => {
      flag.off();
      const before = await http.post(w.u.nobody, `/client-payout-manual-reversals/${reversal.c6}/close`, {});
      flag.on();
      const after = await http.post(w.u.nobody, `/client-payout-manual-reversals/${reversal.c6}/close`, {});
      expect([after.status, after.body]).toEqual([before.status, before.body]);
    });

    it("kimliksiz istek 401 alır", async () => {
      flag.on();
      for (const path of [`/clients/${K.id}/accounting/summary`, `/client-offsets/client/${K.id}`, `/client-statements/client/${K.id}`, `/client-payouts`, `/client-financial-disclosures/office/clients/${K.id}`]) {
        expect([path, (await http.anonymous(path)).status]).toEqual([path, 401]);
      }
    });
  });
});
