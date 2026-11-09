// Modül grafiği `pdf-poppler`'ı yükleyebilir; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
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
import { AddressDiscoveryModule } from "../../address-discovery/address-discovery.module";
import { AddressTaskModule } from "../../address-task/address-task.module";
import { AssetQueryModule } from "../../asset-query/asset-query.module";
import { CaseViewScopeService } from "../../case/case-view-scope.service";
import { DebtorCommunicationService } from "../communication.service";
import { DebtorModule } from "../debtor.module";
import { DebtorService } from "../debtor.service";

/**
 * F02 P3 tarama S4 (owner kararı 09.11.2026) — borçlu tarafındaki dosyaya bağlı okumalar D1 dosya kapsamını dolanamaz (31 GET):
 *  A. dosya kimliği yolda (5): müvekkil bilgi talepleri, adres görevleri / notları, 89 ihbarname özeti → CaseViewScopeGuard;
 *  B. dosya borçlusu kimliğiyle (11): adres araştırma, UYAP adres sorguları, kurum yazıları, mal varlığı sorguları, üçüncü kişiler,
 *     dış dosyalar → mevcut "caseDebtor" nesne kapısı;
 *  C. kendi kimliğiyle (4): bilgi talebi, UYAP sorgusu, kurum yazısı, mal varlığı sorgusu → yeni nesne türleri;
 *  D. borçlu kimliğiyle / kiracı geneli (11): yanıt GÖRÜNÜR dosyalara süzülür. Borçlu kartı büro geneli ana kayıt olarak görünür
 *     kalır; gömülü dosya ayrıntıları yalnız görünen dosyalardan gelir. Çapraz dosya uyarısında görünmeyen dosyalar için yalnız
 *     kiracı içi sayı döner — dosya kimliği, numarası ve sorumlusu verilmez.
 * Gerçek HTTP (AddressDiscovery + AddressTask + AssetQuery + Debtor modülleri, ValidationPipe) + tek kullanımlık PostgreSQL.
 * Sözleşme D1 ile aynıdır (yeni kural / anahtar / bayrak YOK). Bayrak kapalı: davranış bugünküyle aynı. Yazım uçları değişmez.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Debtor side case view scope requires TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

describeDb("F02 P3 tarama S4 — borçlu tarafı dosyaya bağlı okumalar (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(600_000);
  const flag = scopeFlag();
  let db: PrismaClient;
  let app: INestApplication;
  let w: ScopeWorld;
  const http = scopeHttp(() => app);
  type K = CaseKey;
  const ALL: K[] = [...A_CASE_KEYS, "b1"];
  const d = {} as Record<K, string>; // dosyanın kendi borçlusu
  const cd = {} as Record<K, string>;
  const addr = {} as Record<K, string>;
  const cir = {} as Record<K, string>;
  const uq = {} as Record<K, string>;
  const il = {} as Record<K, string>;
  const aq = {} as Record<K, string>;
  const tp = {} as Record<K, string>;
  const shared = { debtor: "", addr: "", cd: {} as Record<"c1" | "c4" | "c6", string> };
  const mismatch = { uyapQuery: "", institutionLetter: "", assetQuery: "", clientInfoRequest: "" };
  const SHARED_CASES = ["c1", "c4", "c6"] as const;
  const mark = (kind: string, k: string) => `${kind}-${k}-${w.suffix}`;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    app = await buildScopeApp(() => db, [AddressDiscoveryModule, AddressTaskModule, AssetQueryModule, DebtorModule]);
    w = await createScopeWorld(db, "dside");
    const tenantOf = (k: K) => (k === "b1" ? w.tB : w.tA);
    const userOf = (k: K) => (k === "b1" ? w.v.allow : w.u.admin);
    const client = { [w.tA]: "", [w.tB]: "" } as Record<string, string>;
    for (const t of [w.tA, w.tB]) client[t] = (await db.client.create({ data: { tenantId: t, type: "INDIVIDUAL", displayName: `MUV-${t}`, name: `MUV-${t}` } as never })).id;
    const past = new Date("2026-01-05T00:00:00.000Z");

    for (const k of ALL) {
      const tenantId = tenantOf(k);
      d[k] = (await db.debtor.create({ data: { tenantId, type: "COMPANY", name: mark("BRC", k), vkn: `9${w.suffix.replace(/\D/g, "1")}${ALL.indexOf(k)}` } as never })).id;
      cd[k] = (await db.caseDebtor.create({ data: { caseId: w.c[k], debtorId: d[k] } as never })).id;
      addr[k] = (await db.debtorAddress.create({ data: { debtorId: d[k], street: mark("SOKAK", k), city: "Ankara" } as never })).id;
      await db.serviceHistory.create({ data: { caseDebtorId: cd[k], addressId: addr[k], toStatus: "SENT", actionDate: past, note: mark("GECMIS", k) } });
      cir[k] = (await db.clientInfoRequest.create({ data: { tenantId, caseId: w.c[k], clientId: client[tenantId], debtorId: d[k], emailTo: "m@example.test", emailSubject: mark("KONU", k), emailBody: "x" } as never })).id;
      uq[k] = (await db.uyapQuery.create({ data: { tenantId, caseDebtorId: cd[k], queryType: "SGK", queryCode: "AB", requestedBy: userOf(k), errorMessage: mark("UYAP", k) } as never })).id;
      il[k] = (await db.institutionLetter.create({ data: { tenantId, caseDebtorId: cd[k], institution: "SGK", letterType: "ADRES", subject: mark("YAZI", k), body: "x" } as never })).id;
      aq[k] = (await db.assetQuery.create({ data: { tenantId, caseDebtorId: cd[k], queryType: "VEHICLE", requestedBy: userOf(k), errorMessage: mark("MALV", k) } as never })).id;
      tp[k] = (await db.thirdParty.create({ data: { tenantId, caseDebtorId: cd[k], type: "BANKA", name: mark("UCUNCU", k), address: "x", ihbarname89_1_date: past, ihbarname89_1_status: "GONDERILDI" } as never })).id;
      await db.externalCase.create({ data: { tenantId, caseDebtorId: cd[k], externalOffice: "Ankara 1. İcra", externalCaseNo: mark("DIS", k), counterpartyName: "x", claimAmount: 10 } as never });
      await db.addressTask.create({ data: { tenantId, caseId: w.c[k], debtorId: d[k], taskType: "DOC_EXTRACT_DEBTOR_ADDRESSES", status: "WAITING_EXTERNAL", dueAt: past, title: mark("ADRGOREV", k) } as never });
      await db.addressAuditLog.create({ data: { tenantId, caseId: w.c[k], debtorId: d[k], action: "NOTE", showInNotes: true, noteText: mark("ADRNOT", k) } as never });
      await db.debtorCommunication.create({ data: { tenantId, debtorId: d[k], caseId: w.c[k], channel: "SMS", content: mark("ILETISIM", k) } });
    }

    // Aynı borçlu satırı üç dosyada (c1, c4, c6): borçlu kimlikli yanıtların süzülmesi.
    const sharedVkn = `8${w.suffix.replace(/\D/g, "2")}`;
    shared.debtor = (await db.debtor.create({ data: { tenantId: w.tA, type: "COMPANY", name: mark("ORTAK", "borclu"), vkn: sharedVkn } as never })).id;
    shared.addr = (await db.debtorAddress.create({ data: { debtorId: shared.debtor, street: mark("ORTAK-SOKAK", "x"), city: "İzmir" } as never })).id;
    for (const k of SHARED_CASES) {
      shared.cd[k] = (await db.caseDebtor.create({ data: { caseId: w.c[k], debtorId: shared.debtor } as never })).id;
      await db.serviceHistory.create({ data: { caseDebtorId: shared.cd[k], addressId: shared.addr, toStatus: "RETURNED", actionDate: past, note: mark("ORTAK-GECMIS", k) } });
      await db.addressTask.create({ data: { tenantId: w.tA, caseId: w.c[k], debtorId: shared.debtor, taskType: "DOC_EXTRACT_DEBTOR_ADDRESSES", status: "PENDING", title: mark("ORTAK-GOREV", k) } as never });
      await db.debtorCommunication.create({ data: { tenantId: w.tA, debtorId: shared.debtor, caseId: w.c[k], channel: "SMS", content: mark("ORTAK-ILETISIM", k) } });
    }
    await db.debtorCommunication.create({ data: { tenantId: w.tA, debtorId: shared.debtor, channel: "CALL", content: mark("ORTAK-ILETISIM", "dosyasiz") } });
    // Çapraz dosya eşleşmesi: aynı VKN'li AYRI borçlu kayıtları c4, c6 ve (başka kiracıda) b1'de.
    for (const k of ["c4", "c6", "b1"] as K[]) {
      const dup = await db.debtor.create({ data: { tenantId: tenantOf(k), type: "COMPANY", name: mark("ESLESEN", k), vkn: sharedVkn } as never });
      await db.caseDebtor.create({ data: { caseId: w.c[k], debtorId: dup.id } as never });
      await db.debtorAddress.create({ data: { debtorId: dup.id, street: mark("ESLESEN-SOKAK", k), city: "Bursa" } as never });
    }
    // Aynı VKN'li bir eşleşen borçlu İKİ dosyada: önce c6 (staff'a gizli), sonra c5 (staff'a görünür) → adres yanıtındaki kaynak
    // dosya, süzgeç yoksa gizli dosyadan seçilebilir.
    const both = await db.debtor.create({ data: { tenantId: w.tA, type: "COMPANY", name: mark("ESLESEN", "iki-dosya"), vkn: sharedVkn } as never });
    await db.caseDebtor.create({ data: { caseId: w.c.c6, debtorId: both.id } as never });
    await db.caseDebtor.create({ data: { caseId: w.c.c5, debtorId: both.id } as never });
    await db.debtorAddress.create({ data: { debtorId: both.id, street: mark("ESLESEN-SOKAK", "iki-dosya"), city: "Adana" } as never });
    // Nesne–kiracı uyuşmazlığı: satır büro A'da, gösterdiği dosya borçlusu / dosya büro B'de (tenantId ile bağ arasında DB kısıtı yok).
    mismatch.uyapQuery = (await db.uyapQuery.create({ data: { tenantId: w.tA, caseDebtorId: cd.b1, queryType: "GSM", queryCode: "AR", requestedBy: w.u.admin } as never })).id;
    mismatch.institutionLetter = (await db.institutionLetter.create({ data: { tenantId: w.tA, caseDebtorId: cd.b1, institution: "SGK", letterType: "ADRES", subject: "x", body: "x" } as never })).id;
    mismatch.assetQuery = (await db.assetQuery.create({ data: { tenantId: w.tA, caseDebtorId: cd.b1, queryType: "BANK", requestedBy: w.u.admin } as never })).id;
    mismatch.clientInfoRequest = (await db.clientInfoRequest.create({ data: { tenantId: w.tA, caseId: w.c.b1, clientId: client[w.tA], emailTo: "m@example.test", emailSubject: "x", emailBody: "x" } as never })).id;
    // Çapraz dosya uyarısı tetikleyicisi: ortak borçlunun adresi c6 dosyasından güncellendi.
    await db.auditLog.create({ data: { tenantId: w.tA, action: "DEBTOR_ADDRESS_UPDATE", entityType: "DEBTOR", entityId: shared.debtor, metadata: { sourceCaseId: w.c.c6 } } });
  });

  afterAll(async () => {
    flag.restore();
    await app?.close();
    await w?.cleanup(async (tenants) => {
      const t = { in: tenants };
      for (const run of [
        () => db.debtorCommunication.deleteMany({ where: { tenantId: t } }),
        () => db.addressAuditLog.deleteMany({ where: { tenantId: t } }),
        () => db.addressTask.deleteMany({ where: { tenantId: t } }),
        () => db.externalCase.deleteMany({ where: { tenantId: t } }),
        () => db.thirdParty.deleteMany({ where: { tenantId: t } }),
        () => db.assetQuery.deleteMany({ where: { tenantId: t } }),
        () => db.institutionLetter.deleteMany({ where: { tenantId: t } }),
        () => db.uyapQuery.deleteMany({ where: { tenantId: t } }),
        () => db.clientInfoRequest.deleteMany({ where: { tenantId: t } }),
        () => db.addressResearch.deleteMany({ where: { tenantId: t } }),
        () => db.serviceHistory.deleteMany({ where: { caseDebtor: { case: { tenantId: t } } } }),
        () => db.caseDebtor.deleteMany({ where: { case: { tenantId: t } } }),
        () => db.debtorAddress.deleteMany({ where: { debtor: { tenantId: t } } }),
        () => db.debtor.deleteMany({ where: { tenantId: t } }),
        () => db.client.deleteMany({ where: { tenantId: t } }),
      ]) await run().catch(() => undefined);
    });
    await db.$disconnect();
  });

  // ------------------------------------------------------------------ A / B / C: kapı (dekoratör) uçları
  type Route = { name: string; path: (k: K) => string; hidden: { statusCode: number; message: string; error: string }; marker?: (k: K) => string };
  const notFound = (message: string) => ({ statusCode: 404, message, error: "Not Found" });
  const ROUTES: Route[] = [
    // A — dosya kimliği yolda
    { name: "GET address-discovery/client-info-request/case/:caseId", path: (k) => `/address-discovery/client-info-request/case/${w.c[k]}`, hidden: CASE_NOT_FOUND, marker: (k) => mark("KONU", k) },
    { name: "GET address-tasks/case/:caseId", path: (k) => `/address-tasks/case/${w.c[k]}`, hidden: CASE_NOT_FOUND },
    { name: "GET address-tasks/case/:caseId/all", path: (k) => `/address-tasks/case/${w.c[k]}/all`, hidden: CASE_NOT_FOUND, marker: (k) => mark("ADRGOREV", k) },
    { name: "GET address-tasks/case/:caseId/notes", path: (k) => `/address-tasks/case/${w.c[k]}/notes`, hidden: CASE_NOT_FOUND, marker: (k) => mark("ADRNOT", k) },
    { name: "GET cases/:caseId/ihbarname-summary", path: (k) => `/cases/${w.c[k]}/ihbarname-summary`, hidden: CASE_NOT_FOUND },
    // B — dosya borçlusu kimliğiyle
    { name: "GET address-discovery/research/:caseDebtorId", path: (k) => `/address-discovery/research/${cd[k]}`, hidden: CASE_NOT_FOUND, marker: (k) => w.fileNo(k) },
    { name: "GET address-discovery/research/:caseDebtorId/suggestions", path: (k) => `/address-discovery/research/${cd[k]}/suggestions`, hidden: CASE_NOT_FOUND },
    { name: "GET address-discovery/research/:caseDebtorId/timeline", path: (k) => `/address-discovery/research/${cd[k]}/timeline`, hidden: CASE_NOT_FOUND },
    { name: "GET address-discovery/uyap-query/debtor/:caseDebtorId", path: (k) => `/address-discovery/uyap-query/debtor/${cd[k]}`, hidden: CASE_NOT_FOUND, marker: (k) => mark("UYAP", k) },
    { name: "GET address-discovery/uyap-query/debtor/:caseDebtorId/suggestions", path: (k) => `/address-discovery/uyap-query/debtor/${cd[k]}/suggestions`, hidden: CASE_NOT_FOUND },
    { name: "GET address-discovery/institution-letter/debtor/:caseDebtorId", path: (k) => `/address-discovery/institution-letter/debtor/${cd[k]}`, hidden: CASE_NOT_FOUND, marker: (k) => mark("YAZI", k) },
    { name: "GET asset-queries/debtor/:caseDebtorId", path: (k) => `/asset-queries/debtor/${cd[k]}`, hidden: CASE_NOT_FOUND, marker: (k) => mark("MALV", k) },
    { name: "GET asset-queries/debtor/:caseDebtorId/summary", path: (k) => `/asset-queries/debtor/${cd[k]}/summary`, hidden: CASE_NOT_FOUND },
    { name: "GET case-debtors/:caseDebtorId/third-parties", path: (k) => `/case-debtors/${cd[k]}/third-parties`, hidden: CASE_NOT_FOUND, marker: (k) => mark("UCUNCU", k) },
    { name: "GET case-debtors/:caseDebtorId/third-parties/with-status", path: (k) => `/case-debtors/${cd[k]}/third-parties/with-status`, hidden: CASE_NOT_FOUND, marker: (k) => mark("UCUNCU", k) },
    { name: "GET case-debtors/:caseDebtorId/external-cases", path: (k) => `/case-debtors/${cd[k]}/external-cases`, hidden: CASE_NOT_FOUND, marker: (k) => mark("DIS", k) },
    // C — kendi kimliğiyle
    { name: "GET address-discovery/client-info-request/:id", path: (k) => `/address-discovery/client-info-request/${cir[k]}`, hidden: notFound("Bilgi talebi bulunamadı"), marker: (k) => mark("KONU", k) },
    { name: "GET address-discovery/uyap-query/:id", path: (k) => `/address-discovery/uyap-query/${uq[k]}`, hidden: notFound("Sorgu bulunamadı"), marker: (k) => mark("UYAP", k) },
    { name: "GET address-discovery/institution-letter/:id", path: (k) => `/address-discovery/institution-letter/${il[k]}`, hidden: notFound("Yazı bulunamadı"), marker: (k) => mark("YAZI", k) },
    { name: "GET asset-queries/:queryId", path: (k) => `/asset-queries/${aq[k]}`, hidden: notFound("Sorgu bulunamadı"), marker: (k) => mark("MALV", k) },
  ];
  const named = ROUTES.map((r) => [r.name, r] as const);
  const leaks = (k: K) => [w.fileNo(k), w.c[k], cd[k], d[k], ...["BRC", "KONU", "UYAP", "YAZI", "MALV", "UCUNCU", "DIS", "ADRGOREV", "ADRNOT"].map((kind) => mark(kind, k))];

  describe("bayrak KAPALI — bugünkü davranış (karakterizasyon)", () => {
    beforeAll(() => flag.off());

    it.each(named)("%s: ilişkisiz kullanıcı kiracının her dosyasını okur; yanıt dosyanın verisini taşır", async (_n, r) => {
      for (const k of A_CASE_KEYS) {
        const res = await http.get(w.u.nobody, r.path(k));
        expect([k, res.status]).toEqual([k, 200]);
        if (r.marker) expect([k, JSON.stringify(res.body).includes(r.marker(k))]).toEqual([k, true]);
      }
    });

    it("kiracı sınırı bayraktan bağımsız: büro A kullanıcısı büro B'nin dosya verisini hiçbir yoldan alamaz", async () => {
      for (const r of ROUTES) {
        const res = await http.get(w.u.nobody, r.path("b1"));
        for (const leak of leaks("b1").filter((x) => x !== w.c.b1 && x !== cd.b1)) expect([r.name, JSON.stringify(res.body).includes(leak)]).toEqual([r.name, false]);
      }
    });
  });

  describe("bayrak kapalı ilişkisiz kullanıcı = bayrak açık büro geneli izinli kullanıcı (gövde eşitliği)", () => {
    afterAll(() => flag.off());
    it.each(named)("%s", async (_n, r) => {
      // Araştırma durumu ilk okumada kayıt açar; karşılaştırmadan önce bir kez ısıtılır.
      flag.off();
      await http.get(w.u.nobody, r.path("c6"));
      const before = await http.get(w.u.nobody, r.path("c6"));
      flag.on();
      const after = await http.get(w.u.allow, r.path("c6"));
      flag.off();
      expect([before.status, after.status]).toEqual([200, 200]);
      expect(after.body).toEqual(before.body);
    });
  });

  describe("bayrak AÇIK — kapı uçları (A / B / C)", () => {
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

    it.each(named)("%s: var olmayan kimlik kapsam dışıyla AYNI gövde; iki kiracı ve ilişki–dosya uyuşmazlığı kapalı", async (_n, r) => {
      const swap = (p: string) => [w.c.c6, cd.c6, cir.c6, uq.c6, il.c6, aq.c6].reduce((acc, id) => acc.replace(id, w.missing), p);
      const missing = await http.get(w.u.nobody, swap(r.path("c6")));
      expect([missing.status, missing.body]).toEqual([404, r.hidden]);
      expect((await http.get(w.u.nobody, r.path("c6"))).body).toEqual(missing.body);
      expectHiddenResponse(await http.get(w.v.allow, r.path("c4")), r.hidden, leaks("c4")); // büro B büro geneli izinli → büro A dosyası
      expectHiddenResponse(await http.get(w.u.allow, r.path("b1")), r.hidden, leaks("b1")); // büro A büro geneli izinli → büro B dosyası
      expectHiddenResponse(await http.get(w.u.link, r.path("b1")), r.hidden, leaks("b1")); // büro A kartının büro B dosyasındaki ilişkisi
    });

    it("kimlik yok → 401; aktör bağlamı yok → 403 CASE_VIEW_SCOPE_UNRESOLVED (yeni nesne türleri dahil, fail-closed)", async () => {
      for (const r of ROUTES) expect([r.name, (await http.anonymous(r.path("c4"))).status]).toEqual([r.name, 401]);
      const scope = app.get(CaseViewScopeService);
      for (const [kind, id] of [["clientInfoRequest", cir.c4], ["uyapQuery", uq.c4], ["institutionLetter", il.c4], ["assetQuery", aq.c4]] as const) {
        await expect(scope.isCaseObjectVisible(w.tA, null, kind, id)).rejects.toMatchObject({ response: { code: "CASE_VIEW_SCOPE_UNRESOLVED" } });
        await expect(scope.isCaseObjectVisible(w.tA, w.u.link, kind, id)).resolves.toBe(true);
        await expect(scope.isCaseObjectVisible(w.tB, w.v.allow, kind, id)).resolves.toBe(false); // nesne aktörün kiracısında değil
      }
      await expect(scope.caseRowFilter(w.tA, undefined)).rejects.toMatchObject({ response: { code: "CASE_VIEW_SCOPE_UNRESOLVED" } });
    });

    it("nesne–kiracı uyuşmazlığı: büro A satırı büro B'nin dosya borçlusunu / dosyasını gösteriyorsa iki büroya da kapalıdır", async () => {
      const scope = app.get(CaseViewScopeService);
      for (const [kind, id] of Object.entries(mismatch) as Array<[keyof typeof mismatch, string]>) {
        await expect(scope.isCaseObjectVisible(w.tA, w.u.allow, kind, id)).resolves.toBe(false); // satır A'da, dosya B'de
        await expect(scope.isCaseObjectVisible(w.tB, w.v.allow, kind, id)).resolves.toBe(false); // dosya B'de, satır A'da
      }
      expect((await http.get(w.v.allow, `/asset-queries/${mismatch.assetQuery}`)).body).toEqual(notFound("Sorgu bulunamadı"));
      expect((await http.get(w.u.allow, `/address-discovery/uyap-query/${mismatch.uyapQuery}`)).body).toEqual(notFound("Sorgu bulunamadı"));
    });
  });

  // ------------------------------------------------------------------ D: borçlu kimlikli / kiracı geneli yanıtların süzülmesi
  const text = (res: request.Response) => JSON.stringify(res.body ?? {});
  const has = (res: request.Response, kind: string, k: string) => text(res).includes(mark(kind, k));

  describe("bayrak KAPALI — borçlu kimlikli yanıtlar bugünkü gibi bütün dosyaları taşır", () => {
    beforeAll(() => flag.off());

    it("borçlu kartı, çapraz dosya, adres ve iletişim yanıtları ilişkisiz kullanıcıya üç dosyayı da gösterir", async () => {
      const card = await http.get(w.u.nobody, `/debtors/${shared.debtor}`);
      expect((card.body.caseDebtors as Array<{ case: { fileNumber: string } }>).map((x) => x.case.fileNumber).sort()).toEqual(SHARED_CASES.map((k) => w.fileNo(k)).sort());
      const alerts = await http.get(w.u.nobody, `/debtors/${shared.debtor}/cross-file-alerts?excludeCaseId=${w.c.c4}`);
      expect([alerts.body.hasAlert, alerts.body.sourceCaseId, "hiddenOtherActiveCaseCount" in alerts.body]).toEqual([true, w.c.c6, false]);
      expect((alerts.body.otherActiveCases as Array<{ caseId: string }>).map((x) => x.caseId).sort()).toEqual([w.c.c1, w.c.c6].sort());
      const matches = await http.get(w.u.nobody, `/address-discovery/cross-file/${shared.debtor}`);
      expect((matches.body as Array<{ caseId: string }>).map((x) => x.caseId).sort()).toEqual([w.c.c4, w.c.c5, w.c.c6, w.c.c6].sort());
      const comms = await http.get(w.u.nobody, `/debtors/${shared.debtor}/communications`);
      expect(comms.body.meta.total).toBe(4);
      const history = await http.get(w.u.nobody, `/addresses/${shared.addr}/history`);
      expect(history.body).toHaveLength(3);
      const overdue = await http.get(w.u.nobody, "/third-parties/overdue");
      expect(A_CASE_KEYS.every((k) => has(overdue, "UCUNCU", k))).toBe(true);
      expect(has(overdue, "UCUNCU", "b1")).toBe(false);
    });
  });

  describe("bayrak AÇIK — borçlu kimlikli yanıtlar görünür dosyalara süzülür", () => {
    beforeAll(() => flag.on());
    afterAll(() => flag.off());
    /** link yalnız c4'ü, resp yalnız c1'i görür; nobody hiçbirini; allow hepsini. */
    const seen = (actor: string): string[] =>
      actor === w.u.allow ? [...SHARED_CASES] : actor === w.u.link ? ["c4"] : actor === w.u.resp ? ["c1"] : [];
    const actorsUnderTest = () => [w.u.link, w.u.resp, w.u.nobody, w.u.allow];

    it("GET debtors/:id — borçlu kartı görünür kalır; dosya borçlusu satırları ve dosyalı iletişimler yalnız görünen dosyalardan", async () => {
      for (const actor of actorsUnderTest()) {
        const res = await http.get(actor, `/debtors/${shared.debtor}`);
        expect([res.status, res.body.name]).toEqual([200, mark("ORTAK", "borclu")]);
        expect((res.body.caseDebtors as Array<{ case: { fileNumber: string } }>).map((x) => x.case.fileNumber).sort()).toEqual(seen(actor).map((k) => w.fileNo(k as K)).sort());
        expect(has(res, "ORTAK-ILETISIM", "dosyasiz")).toBe(true); // dosyasız kayıt değişmez
        for (const k of SHARED_CASES) {
          expect([actor, k, has(res, "ORTAK-ILETISIM", k)]).toEqual([actor, k, seen(actor).includes(k)]);
          if (!seen(actor).includes(k)) for (const leak of [w.fileNo(k), w.c[k], shared.cd[k]]) expect(text(res)).not.toContain(leak);
        }
      }
    });

    it("GET debtors/:id/cross-file-alerts — görünmeyen dosyalar için yalnız sayı; kimlik, dosya no, sorumlu ve kaynak dosya verilmez", async () => {
      const call = (actor: string) => http.get(actor, `/debtors/${shared.debtor}/cross-file-alerts?excludeCaseId=${w.c.c4}`);
      const link = await call(w.u.link); // c4'ü görür; c1 ve c6 gizli
      expect([link.status, link.body.hasAlert, link.body.otherActiveCases, link.body.hiddenOtherActiveCaseCount, link.body.sourceCaseId]).toEqual([200, true, [], 2, null]);
      for (const k of ["c1", "c6"] as const) for (const leak of [w.c[k], w.fileNo(k)]) expect(text(link)).not.toContain(leak);
      expect(text(link)).not.toContain("Av P3"); // sorumlu adı
      const resp = await call(w.u.resp); // c1'i görür
      expect([(resp.body.otherActiveCases as Array<{ caseId: string }>).map((x) => x.caseId), resp.body.hiddenOtherActiveCaseCount, resp.body.sourceCaseId]).toEqual([[w.c.c1], 1, null]);
      const allow = await call(w.u.allow); // büro geneli izin: süzme yok, alan eklenmez
      expect([(allow.body.otherActiveCases as Array<{ caseId: string }>).map((x) => x.caseId).sort(), "hiddenOtherActiveCaseCount" in allow.body, allow.body.sourceCaseId]).toEqual([
        [w.c.c1, w.c.c6].sort(),
        false,
        w.c.c6,
      ]);
    });

    it("GET address-discovery/cross-file/:debtorId (+ addresses, + count) — eşleşmeler ve kaynak dosya yalnız görünen dosyalardan", async () => {
      // Eşleşme satırları: ESLESEN-c4@c4, ESLESEN-c6@c6, ESLESEN-iki-dosya@c6 ve @c5. Adresler borçlu başına bir kez döner.
      const MATCH_CASES: ACaseKey[] = ["c4", "c6", "c6", "c5"];
      const DEBTOR_CASES: ACaseKey[][] = [["c4"], ["c6"], ["c6", "c5"]];
      for (const [label, actor, visible] of w.visibility) {
        const sees = (k: ACaseKey) => (visible as ACaseKey[]).includes(k);
        const matches = await http.get(actor, `/address-discovery/cross-file/${shared.debtor}`);
        expect([label, matches.status, (matches.body as Array<{ caseId: string }>).map((x) => x.caseId).sort()]).toEqual([label, 200, MATCH_CASES.filter(sees).map((k) => w.c[k]).sort()]);
        const addresses = await http.get(actor, `/address-discovery/cross-file/${shared.debtor}/addresses?currentCaseId=${w.c.c1}`);
        const from = (addresses.body as Array<{ fromCaseId: string }>).map((x) => x.fromCaseId);
        expect([label, from.length]).toEqual([label, DEBTOR_CASES.filter((cases) => cases.some(sees)).length]);
        for (const id of from) expect([label, A_CASE_KEYS.filter(sees).map((k) => w.c[k]).includes(id)]).toEqual([label, true]); // kaynak dosya görünür bir dosya
        const count = await http.get(actor, `/address-discovery/cross-file/${shared.debtor}/count?currentCaseId=${w.c.c1}`);
        expect([label, count.body]).toEqual([label, { count: from.length }]);
        for (const k of A_CASE_KEYS.filter((x) => !sees(x))) for (const res of [matches, addresses]) for (const leak of [w.fileNo(k), w.c[k]]) expect([label, k, text(res).includes(leak)]).toEqual([label, k, false]);
      }
      // staff yalnız c5'i görür: iki dosyadaki eşleşen borçlunun adresi görünür dosyadan (c5) gelir, gizli c6'dan değil.
      const staff = await http.get(w.u.staff, `/address-discovery/cross-file/${shared.debtor}/addresses?currentCaseId=${w.c.c1}`);
      expect((staff.body as Array<{ fromCaseId: string; fromCaseFileNumber: string }>).map((x) => [x.fromCaseId, x.fromCaseFileNumber])).toEqual([[w.c.c5, w.fileNo("c5")]]);
    });

    it("GET address-tasks/debtor/:debtorId ve address-tasks/overdue — yalnız görünen dosyaların adres görevleri", async () => {
      for (const actor of actorsUnderTest()) {
        const byDebtor = await http.get(actor, `/address-tasks/debtor/${shared.debtor}`);
        expect((byDebtor.body.tasks as Array<{ caseId: string }>).map((x) => x.caseId).sort()).toEqual(seen(actor).map((k) => w.c[k as K]).sort());
        const overdue = await http.get(actor, "/address-tasks/overdue");
        const overdueCases = new Set((overdue.body.tasks as Array<{ caseId: string }>).map((x) => x.caseId));
        const visibleA = actor === w.u.allow ? [...A_CASE_KEYS] : (seen(actor) as ACaseKey[]);
        expect([...overdueCases].sort()).toEqual(visibleA.map((k) => w.c[k]).sort());
      }
    });

    it("GET addresses/:addressId/history ve debtors/:debtorId/notification-chain — tebligat denemeleri yalnız görünen dosyalardan", async () => {
      for (const actor of actorsUnderTest()) {
        const history = await http.get(actor, `/addresses/${shared.addr}/history`);
        expect([history.status, (history.body as unknown[]).length]).toEqual([200, seen(actor).length]);
        for (const k of SHARED_CASES) expect([actor, k, has(history, "ORTAK-GECMIS", k)]).toEqual([actor, k, seen(actor).includes(k)]);
        const chain = await http.get(actor, `/debtors/${shared.debtor}/notification-chain`);
        expect([chain.status, chain.body.totalAttempts]).toEqual([200, seen(actor).length]);
      }
    });

    it("GET debtors/:debtorId/communications — dosyalı kayıtlar süzülür, dosyasız kayıt kalır; sayım aynı süzgeçle; caseId süzgeci doğrulanır", async () => {
      for (const actor of actorsUnderTest()) {
        const res = await http.get(actor, `/debtors/${shared.debtor}/communications`);
        expect([res.status, res.body.meta.total, (res.body.data as unknown[]).length]).toEqual([200, seen(actor).length + 1, seen(actor).length + 1]);
        expect(has(res, "ORTAK-ILETISIM", "dosyasiz")).toBe(true);
        for (const k of SHARED_CASES) expect([actor, k, has(res, "ORTAK-ILETISIM", k)]).toEqual([actor, k, seen(actor).includes(k)]);
      }
      const ok = await http.get(w.u.link, `/debtors/${shared.debtor}/communications?caseId=${w.c.c4}`);
      expect([ok.status, ok.body.meta.total]).toEqual([200, 1]);
      expectHiddenResponse(await http.get(w.u.link, `/debtors/${shared.debtor}/communications?caseId=${w.c.c6}`), CASE_NOT_FOUND, [mark("ORTAK-ILETISIM", "c6")]);
      expectHiddenResponse(await http.get(w.u.link, `/debtors/${shared.debtor}/communications?caseId=${w.missing}`), CASE_NOT_FOUND, []);
    });

    it("GET third-parties/overdue — kiracı geneli liste yalnız görünen dosyaların ihbarnameleri", async () => {
      for (const [label, actor, visible] of w.visibility) {
        const res = await http.get(actor, "/third-parties/overdue");
        expect(res.status).toBe(200);
        for (const k of A_CASE_KEYS) expect([label, k, has(res, "UCUNCU", k)]).toEqual([label, k, (visible as ACaseKey[]).includes(k)]);
        expect(has(res, "UCUNCU", "b1")).toBe(false);
      }
    });

    it("borçlu ana kaydı iki kiracı arasında kapalı kalır (bayraktan bağımsız)", async () => {
      for (const path of [`/debtors/${shared.debtor}`, `/address-discovery/cross-file/${shared.debtor}`, `/debtors/${shared.debtor}/communications`, `/debtors/${shared.debtor}/notification-chain`, `/addresses/${shared.addr}/history`]) {
        const res = await http.get(w.v.allow, path);
        expect([path, res.status === 404 || (res.status === 200 && text(res).indexOf(w.suffix) === -1)]).toEqual([path, true]);
      }
    });

    it("aktör bağlamı yok → 403 (servis düzeyi, fail-closed)", async () => {
      await expect(app.get(DebtorService).findOneForActor(w.tA, shared.debtor, undefined as never)).rejects.toMatchObject({ response: { code: "CASE_VIEW_SCOPE_UNRESOLVED" } });
      await expect(app.get(DebtorService).getCrossFileDebtorAlerts(w.tA, shared.debtor, w.c.c4, undefined)).rejects.toMatchObject({ response: { code: "CASE_VIEW_SCOPE_UNRESOLVED" } });
      await expect(app.get(DebtorCommunicationService).getCommunicationHistory(w.tA, shared.debtor, {}, undefined)).rejects.toMatchObject({ response: { code: "CASE_VIEW_SCOPE_UNRESOLVED" } });
    });
  });

  describe("bayrak kapalı ilişkisiz kullanıcı = bayrak açık büro geneli izinli kullanıcı — borçlu kimlikli yanıtlar (gövde eşitliği)", () => {
    afterAll(() => flag.off());
    const PATHS = () => [
      `/debtors/${shared.debtor}`,
      `/debtors/${shared.debtor}/cross-file-alerts?excludeCaseId=${w.c.c4}`,
      `/address-discovery/cross-file/${shared.debtor}`,
      `/address-discovery/cross-file/${shared.debtor}/addresses?currentCaseId=${w.c.c1}`,
      `/address-discovery/cross-file/${shared.debtor}/count?currentCaseId=${w.c.c1}`,
      `/address-tasks/debtor/${shared.debtor}`,
      "/address-tasks/overdue",
      `/addresses/${shared.addr}/history`,
      `/debtors/${shared.debtor}/notification-chain`,
      `/debtors/${shared.debtor}/communications`,
      "/third-parties/overdue",
    ];
    it("on bir uç: aynı durum ve aynı gövde", async () => {
      for (const path of PATHS()) {
        flag.off();
        const before = await http.get(w.u.nobody, path);
        flag.on();
        const after = await http.get(w.u.allow, path);
        flag.off();
        expect([path, before.status, after.status]).toEqual([path, 200, 200]);
        expect([path, after.body]).toEqual([path, before.body]);
      }
    });
  });

  describe("yazım uçları ve mevcut işlem yetkileri değişmez", () => {
    afterAll(() => flag.off());

    it("VIEWER yazma reddi kapsam kapısından bağımsız 403; ilişkisiz kullanıcının yazımı bayrak açıkken de kapsam kapısına takılmaz", async () => {
      for (const set of [flag.off, flag.on]) {
        set();
        const viewer = await http.post(w.u.viewer, `/address-discovery/research/${cd.c4}/start`);
        expect(viewer.status).toBe(403);
        expect(text(viewer)).not.toContain("CASE_VIEW_SCOPE");
      }
      flag.off();
      const before = await http.post(w.u.nobody, `/address-discovery/research/${cd.c5}/start`);
      flag.on();
      const after = await http.post(w.u.nobody, `/address-discovery/research/${cd.c6}/start`);
      expect(after.status).toBe(before.status);
      expect(after.status).not.toBe(404);
    });
  });
});
