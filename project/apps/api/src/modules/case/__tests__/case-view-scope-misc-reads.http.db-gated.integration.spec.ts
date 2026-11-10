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
import { AiModule } from "../../ai/ai.module";
import { AutomationModule } from "../../automation/automation.module";
import { BankModule } from "../../bank/bank.module";
import { CalendarModule } from "../../calendar/calendar.module";
import { CaseStatusModule } from "../../case-status/case-status.module";
import { ClientIntakeReviewModule } from "../../client-intake-review/client-intake-review.module";
import { ClientIntelStatementModule } from "../../client-intel-statement/client-intel-statement.module";
import { ClientNotificationModule } from "../../client-notification/client-notification.module";
import { LegalTimeShadowModule } from "../../legal-time-shadow/legal-time-shadow.module";
import { NotificationModule } from "../../notification/notification.module";
import { PolicyEngineModule } from "../../policy-engine/policy-engine.module";
import { RiskModule } from "../../risk/risk.module";
import { ValidationGateModule } from "../../validation-gate/validation-gate.module";
import { CaseViewScopeService } from "../case-view-scope.service";

/**
 * F02 P3 tarama S5 / S6 / S7 (owner kararları 09.11.2026) — dosyaya bağlı kalan okuma yolları D1 dosya kapsamını dolanamaz:
 *  S5 müvekkil istihbarat beyanları, müvekkil form gönderimleri (inceleme kuyruğu), müvekkil bildirim özeti;
 *  S6 AI öneri / tahmin, otomasyon bağlamı ve istatistiği, politika motoru okumaları, risk raporları, haciz öncesi istihbarat,
 *     yasal süre gölge raporu;
 *  S7 borçlu bildirim kuyruğu, dosya durum geçmişi, takvim, banka hareketleri.
 * Dosyalı kayıtlar süzülür / kapılanır; DOSYASIZ kayıtların mevcut yetkileri korunur (takvim, bildirim kuyruğu, müvekkil bildirimi).
 * Banka hareketleri büro muhasebesi kapsamında kalır: satırlar süzülmez; bayrak açıkken ham banka yükü dönmez ve eşleşen dosya /
 * tahsilat kimliği yalnız dosya görünüyorsa döner.
 * Gerçek HTTP + tek kullanımlık PostgreSQL. Yöntem farksaldır (bayrak kapalı ilişkisiz kullanıcı = taban). Yeni kural / anahtar /
 * bayrak YOK. Kod okuması gerçek erişim kanıtı değildir.
 */
/** Sıra duyarsız karşılaştırma: sıralama ölçütü olmayan (ya da eşit değerli) listelerde satır sırası sorgudan sorguya değişebilir. */
const canon = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canon).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))
    : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, canon(v)]))
      : value;

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Case view scope misc reads require TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

describeDb("F02 P3 tarama S5 / S6 / S7 — kalan dosyaya bağlı okumalar (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(600_000);
  const flag = scopeFlag();
  let db: PrismaClient;
  let app: INestApplication;
  let w: ScopeWorld;
  const http = scopeHttp(() => app);
  const ALL: CaseKey[] = [...A_CASE_KEYS, "b1"];
  const tenantOf = (k: CaseKey) => (k === "b1" ? w.tB : w.tA);
  const mark = (kind: string, k: string) => `${kind}-${k}-${w.suffix}`;
  const client = {} as Record<string, string>;
  const debtor = { shared: "" };
  const intel = {} as Record<string, string>;
  const submission = {} as Record<string, string>;
  const decision = {} as Record<string, string>;
  const calendar = {} as Record<string, string>;
  const queue = {} as Record<string, string>;
  const tx = {} as Record<string, string>;
  const cnotif = {} as Record<string, string>;
  let account = "";
  const mismatch = { clientIntelStatement: "", clientIntakeSubmission: "" };
  const text = (res: request.Response) => JSON.stringify(res.body ?? {});
  const now = new Date();
  const soon = new Date(now.getTime() + 2 * 24 * 3600 * 1000);
  const past = new Date(now.getTime() - 24 * 3600 * 1000);

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    app = await buildScopeApp(() => db, [
      AiModule,
      AutomationModule,
      BankModule,
      CalendarModule,
      CaseStatusModule,
      ClientIntakeReviewModule,
      ClientIntelStatementModule,
      ClientNotificationModule,
      LegalTimeShadowModule,
      NotificationModule,
      PolicyEngineModule,
      RiskModule,
      ValidationGateModule,
    ]);
    w = await createScopeWorld(db, "misc");
    for (const tenantId of [w.tA, w.tB]) client[tenantId] = (await db.client.create({ data: { tenantId, type: "COMPANY", name: mark("MUVEKKIL", tenantId === w.tA ? "A" : "B") } as never })).id;
    // Büro satırı: bildirim özeti büro ayarlarını dört paralel okumayla çözer; satır yokken varsayılan büroyu paralel oluşturmaya
    // çalışır ve tekillik hatasıyla 500 verir (bu PR'dan önce de; bu teslimin konusu değil). Canlıda büro satırı vardır.
    await db.office.create({ data: { tenantId: w.tA, name: mark("BURO", "A") } as never });
    debtor.shared = (await db.debtor.create({ data: { tenantId: w.tA, type: "COMPANY", name: mark("BORCLU", "ortak") } as never })).id;
    const debtorB = (await db.debtor.create({ data: { tenantId: w.tB, type: "COMPANY", name: mark("BORCLU", "b") } as never })).id;
    account = (await db.bankAccount.create({ data: { tenantId: w.tA, bankCode: "0001", bankName: "Test Bankası", iban: `TR${w.suffix}`, ownerType: "OFFICE", ownerName: "Büro" } as never })).id;

    for (const k of ALL) {
      const tenantId = tenantOf(k);
      const caseId = w.c[k];
      const clientId = client[tenantId];
      await db.case.update({ where: { id: caseId }, data: { riskScore: 80, status: "ACTIVE", isAutoMode: true } as never });
      intel[k] = (
        await db.clientIntelStatement.create({ data: { tenantId, caseId, debtorId: k === "b1" ? debtorB : debtor.shared, category: "INCOME_SOURCE", value: mark("BEYAN", k), createdById: k === "b1" ? w.v.allow : w.u.admin } as never })
      ).id;
      const link = await db.clientIntakeLink.create({ data: { tenantId, caseId, clientId, tokenHash: mark("TOKEN", k), createdById: k === "b1" ? w.v.allow : w.u.admin, expiresAt: soon } as never });
      submission[k] = (await db.clientIntakeSubmission.create({ data: { tenantId, intakeLinkId: link.id, caseId, clientId } as never })).id;
      await db.decisionLog.create({ data: { caseId, decisionType: "NEXT_ACTION", decision: mark("KARAR", k), isAutomatic: true } as never });
      decision[k] = (await db.cpeDecisionLog.create({ data: { caseId, actionCode: "TEST", scope: "CASE", allowed: true, code: "OK", reason: mark("GEREKCE", k) } as never })).id;
      await db.riskReport.create({ data: { caseId, overallScore: 80 } as never });
      await db.legalTimeShadowDiff.create({ data: { tenantId, caseId, legacySource: "L", canonicalSource: "C", reasonCode: mark("FARK", k), calculationVersion: "v" } as never });
      queue[k] = (await db.notificationQueue.create({ data: { tenantId, caseId, type: "PAYMENT_ORDER", channel: "PTT", recipient: mark("ALICI", k), status: "PENDING", scheduledAt: past } as never })).id;
      await db.notificationQueue.create({ data: { tenantId, caseId, type: "PAYMENT_ORDER", channel: "PTT", recipient: mark("ALICI-SURESI", k), status: "DELIVERED", expiresAt: past } as never });
      await db.caseStatusHistory.create({ data: { caseId, toStatus: "DERDEST", reason: mark("DURUM", k) } as never });
      calendar[k] = (await db.calendarEvent.create({ data: { tenantId, caseId, title: mark("TAKVIM", k), date: soon, type: "DURUSMA", createdById: k === "b1" ? w.v.allow : w.u.admin } as never })).id;
      cnotif[k] = (await db.clientNotification.create({ data: { tenantId, clientId, caseId, channel: "EMAIL", type: "INFO", subject: mark("BILDIRIM", k), body: "x", sentById: k === "b1" ? w.v.allow : w.u.admin } as never })).id;
      if (k !== "b1") {
        tx[k] = (
          await db.bankTransaction.create({
            data: { tenantId, bankAccountId: account, transactionDate: past, amount: 100, currency: "TRY", transactionType: "CREDIT", isMatched: true, matchedCaseId: caseId, matchedCollectionId: mark("TAHSILAT", k), rawData: { ham: mark("HAM", k) }, counterpartyName: mark("KARSI", k) } as never,
          })
        ).id;
      }
    }
    // dosyasız kayıtlar
    queue.caseless = (await db.notificationQueue.create({ data: { tenantId: w.tA, type: "PAYMENT_ORDER", channel: "PTT", recipient: mark("ALICI", "dosyasiz"), status: "PENDING", scheduledAt: past } as never })).id;
    calendar.caseless = (await db.calendarEvent.create({ data: { tenantId: w.tA, title: mark("TAKVIM", "dosyasiz"), date: soon, type: "TOPLANTI", createdById: w.u.admin } as never })).id;
    cnotif.caseless = (await db.clientNotification.create({ data: { tenantId: w.tA, clientId: client[w.tA], channel: "EMAIL", type: "INFO", subject: mark("BILDIRIM", "dosyasiz"), body: "x", sentById: w.u.admin } as never })).id;
    tx.unmatched = (await db.bankTransaction.create({ data: { tenantId: w.tA, bankAccountId: account, transactionDate: past, amount: 50, currency: "TRY", transactionType: "CREDIT", rawData: { ham: mark("HAM", "eslesmemis") } } as never })).id;
    // nesne–kiracı uyuşmazlığı: satır büro A'da, dosyası büro B'de
    mismatch.clientIntelStatement = (await db.clientIntelStatement.create({ data: { tenantId: w.tA, caseId: w.c.b1, debtorId: debtor.shared, category: "INCOME_SOURCE", value: "x", createdById: w.u.admin } as never })).id;
    const mmLink = await db.clientIntakeLink.create({ data: { tenantId: w.tA, caseId: w.c.b1, clientId: client[w.tA], tokenHash: mark("TOKEN", "mm"), createdById: w.u.admin, expiresAt: soon } as never });
    mismatch.clientIntakeSubmission = (await db.clientIntakeSubmission.create({ data: { tenantId: w.tA, intakeLinkId: mmLink.id, caseId: w.c.b1, clientId: client[w.tA] } as never })).id;
  });

  afterAll(async () => {
    flag.restore();
    const caseIds = ALL.map((k) => w.c[k]);
    await w.cleanup(async (tenantIds) => {
      await db.cpeDecisionLog.deleteMany({ where: { caseId: { in: caseIds } } }).catch(() => undefined);
      await db.decisionLog.deleteMany({ where: { caseId: { in: caseIds } } }).catch(() => undefined);
      for (const tenantId of tenantIds) {
        await db.office.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.bankTransaction.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.bankAccount.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.clientNotification.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.calendarEvent.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.notificationQueue.deleteMany({ where: { OR: [{ tenantId }, { case: { tenantId } }] } }).catch(() => undefined);
        await db.legalTimeShadowDiff.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.clientIntakeSubmission.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.clientIntakeLink.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.clientIntelStatement.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.debtor.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.client.deleteMany({ where: { tenantId } }).catch(() => undefined);
      }
    });
    await app?.close();
    await db.$disconnect();
  });

  // ---------------------------------------------------------------------------------------------------------------------------
  // 1) Dosya kimlikli / kendi kimlikli okumalar: kapsam dışı = var olmayan
  // ---------------------------------------------------------------------------------------------------------------------------
  type Hidden = { statusCode: number; message: string; error: string } | { success: false; error: string };
  type Route = { name: string; call: (actor: string, k: CaseKey | "missing") => request.Test; hidden: Hidden };
  const id = (k: CaseKey | "missing") => (k === "missing" ? w.missing : w.c[k]);
  const of = (map: Record<string, string>, k: CaseKey | "missing") => (k === "missing" ? w.missing : map[k]);
  const nf = (message: string) => ({ statusCode: 404, message, error: "Not Found" });
  const get = (name: string, path: (k: CaseKey | "missing") => string, hidden: Hidden = CASE_NOT_FOUND): Route => ({ name, call: (a, k) => http.get(a, path(k)), hidden });
  const ROUTES: Route[] = [
    get("S5 GET client-intel-statements/case/:caseId", (k) => `/client-intel-statements/case/${id(k)}`),
    get("S5 GET client-intel-statements/:id", (k) => `/client-intel-statements/${of(intel, k)}`, nf("İstihbarat beyanı bulunamadı")),
    get("S5 GET client-intake-submissions?caseId", (k) => `/client-intake-submissions?caseId=${id(k)}`),
    get("S5 GET client-intake-submissions/:id", (k) => `/client-intake-submissions/${of(submission, k)}`, nf("Gönderim bulunamadı")),
    get("S6 GET ai/case/:caseId/suggest", (k) => `/ai/case/${id(k)}/suggest`),
    get("S6 GET ai/case/:caseId/predict", (k) => `/ai/case/${id(k)}/predict`),
    get("S6 GET automation/cases/:id/context", (k) => `/automation/cases/${id(k)}/context`),
    get("S6 GET automation/cases/:id/next-action", (k) => `/automation/cases/${id(k)}/next-action`),
    { name: "S6 POST policy-engine/cases/:caseId/can-perform-action", call: (a, k) => http.post(a, `/policy-engine/cases/${id(k)}/can-perform-action`, { actionCode: "TEST" }), hidden: CASE_NOT_FOUND },
    get("S6 GET policy-engine/cases/:caseId/next-actions", (k) => `/policy-engine/cases/${id(k)}/next-actions`),
    get("S6 GET policy-engine/cases/:caseId/decision-history", (k) => `/policy-engine/cases/${id(k)}/decision-history`),
    get("S6 GET policy-engine/decisions/:decisionId", (k) => `/policy-engine/decisions/${of(decision, k)}`, { success: false, error: "Decision not found" }),
    get("S6 GET risk/case/:caseId/latest", (k) => `/risk/case/${id(k)}/latest`),
    get("S6 GET risk/case/:caseId/history", (k) => `/risk/case/${id(k)}/history`),
    get("S6 GET validation-gate/:caseId/pre-haciz-intelligence", (k) => `/validation-gate/${id(k)}/pre-haciz-intelligence`),
    get("S7 GET notifications/case/:caseId", (k) => `/notifications/case/${id(k)}`),
    get("S7 GET notifications/case/:caseId/payment-deadline", (k) => `/notifications/case/${id(k)}/payment-deadline`),
    get("S7 GET case-status/:caseId/history", (k) => `/case-status/${id(k)}/history`),
  ];
  const named = ROUTES.map((r) => [r.name, r] as const);
  const base = new Map<string, number>();
  const isHidden = (r: Route, res: request.Response) => JSON.stringify(res.body) === JSON.stringify(r.hidden);
  const expectHidden = (r: Route, res: request.Response, k: CaseKey | "missing", label: string) => {
    if ("statusCode" in r.hidden) expectHiddenResponse(res, r.hidden, k === "missing" ? [] : [w.fileNo(k), mark("BEYAN", k), mark("KARAR", k), mark("GEREKCE", k), mark("DURUM", k), mark("ALICI", k)]);
    else expect([label, k, res.status, res.body]).toEqual([label, k, 200, r.hidden]);
  };

  describe("dosya kimlikli / kendi kimlikli okumalar", () => {
    afterAll(() => flag.off());

    it.each(named)("%s: taban (bayrak kapalı, ilişkisiz kullanıcı) dosyadan bağımsızdır ve kapının yanıtı değildir", async (_n, r) => {
      flag.off();
      const statuses = new Set<number>();
      for (const k of A_CASE_KEYS) {
        const res = await r.call(w.u.nobody, k);
        statuses.add(res.status);
        expect([k, isHidden(r, res)]).toEqual([k, false]);
        expect([401, 403]).not.toContain(res.status);
      }
      expect(statuses.size).toBe(1);
      base.set(r.name, [...statuses][0]);
    });

    it.each(named)("%s: görünür dosyada taban durumu; kapsam dışı dosya içerik üretmeden reddedilir", async (_n, r) => {
      flag.on();
      for (const [label, actor, visible] of w.visibility) {
        for (const k of A_CASE_KEYS) {
          const res = await r.call(actor, k);
          if ((visible as ACaseKey[]).includes(k)) expect([label, k, res.status, isHidden(r, res)]).toEqual([label, k, base.get(r.name), false]);
          else expectHidden(r, res, k, label);
        }
      }
    });

    it.each(named)("%s: var olmayan = kapsam dışı = başka büronun dosyası (aynı yanıt); iki kiracı", async (_n, r) => {
      flag.on();
      const hidden = await r.call(w.u.nobody, "c6");
      expectHidden(r, hidden, "c6", "kapsam dışı");
      for (const [label, res] of [
        ["yok", await r.call(w.u.nobody, "missing")],
        ["başka büro", await r.call(w.u.allow, "b1")],
        ["B→A", await r.call(w.v.allow, "c1")],
        ["ilişki uyuşmazlığı", await r.call(w.u.link, "b1")],
      ] as Array<[string, request.Response]>) {
        expect([label, res.status, res.body]).toEqual([label, hidden.status, hidden.body]);
      }
    });

    it("nesne–kiracı uyuşmazlığı görünürlük üretmez; kimliksiz istek 401 alır", async () => {
      flag.on();
      const scope = app.get(CaseViewScopeService);
      for (const [kind, objectId] of Object.entries(mismatch) as Array<["clientIntelStatement" | "clientIntakeSubmission", string]>) {
        await expect(scope.isCaseObjectVisible(w.tA, w.u.allow, kind, objectId)).resolves.toBe(false);
        await expect(scope.isCaseObjectVisible(w.tB, w.v.allow, kind, objectId)).resolves.toBe(false);
      }
      for (const path of [`/validation-gate/${w.c.c1}/pre-haciz-intelligence`, `/case-status/${w.c.c1}/history`, `/ai/case/${w.c.c1}/suggest`, `/client-intel-statements/${intel.c1}`]) {
        expect([path, (await http.anonymous(path)).status]).toEqual([path, 401]);
      }
    });
  });

  // ---------------------------------------------------------------------------------------------------------------------------
  // 2) Liste / kuyruk / rapor süzgeçleri
  // ---------------------------------------------------------------------------------------------------------------------------
  type ListRoute = { name: string; path: string; marks: (k: string) => string; actor?: "admin"; caseless?: string };
  const LISTS: ListRoute[] = [
    { name: "S5 GET client-intel-statements/debtor/:debtorId", path: "", marks: (k) => mark("BEYAN", k) },
    { name: "S5 GET client-intake-submissions (kuyruk)", path: `/client-intake-submissions`, marks: (k) => submission[k] },
    { name: "S6 GET automation/stats (son kararlar)", path: `/automation/stats`, marks: (k) => mark("KARAR", k) },
    { name: "S6 GET risk/high-risk", path: `/risk/high-risk?limit=50`, marks: (k) => w.c[k] },
    { name: "S6 GET legal-time-shadow/evidence-report", path: `/legal-time-shadow/evidence-report`, marks: (k) => mark("FARK", k) },
    { name: "S7 GET notifications/pending", path: `/notifications/pending`, marks: (k) => mark("ALICI", k), caseless: "ALICI" },
    { name: "S7 GET notifications/expired", path: `/notifications/expired`, marks: (k) => mark("ALICI-SURESI", k) },
    { name: "S7 GET calendar/events", path: `/calendar/events?year=${soon.getFullYear()}&month=${soon.getMonth() + 1}`, marks: (k) => mark("TAKVIM", k), caseless: "TAKVIM" },
    { name: "S7 GET calendar/upcoming", path: `/calendar/upcoming?days=7`, marks: (k) => mark("TAKVIM", k), caseless: "TAKVIM" },
  ];
  const listPath = (r: ListRoute) => r.path || `/client-intel-statements/debtor/${debtor.shared}`;

  describe("liste / kuyruk / rapor süzgeçleri — yalnız görünen dosyaların satırları; dosyasız kayıtlar kalır", () => {
    afterAll(() => flag.off());

    it.each(LISTS.map((r) => [r.name, r] as const))("%s", async (_n, r) => {
      flag.off();
      const all = await http.get(w.u.nobody, listPath(r));
      expect(all.status).toBe(200);
      for (const k of A_CASE_KEYS) expect([k, text(all).includes(r.marks(k))]).toEqual([k, true]);
      expect(text(all)).not.toContain(r.marks("b1"));
      flag.on();
      for (const [label, actor, visible] of w.visibility) {
        const res = await http.get(actor, listPath(r));
        expect([label, res.status]).toEqual([label, 200]);
        for (const k of A_CASE_KEYS) expect([label, k, text(res).includes(r.marks(k))]).toEqual([label, k, (visible as ACaseKey[]).includes(k)]);
        if (r.caseless) expect([label, "dosyasız", text(res).includes(mark(r.caseless, "dosyasiz"))]).toEqual([label, "dosyasız", true]);
        expect(text(res)).not.toContain(r.marks("b1"));
      }
      // yanıt eşitliği: bayrak kapalı ilişkisiz = bayrak açık büro geneli izinli
      const allowed = await http.get(w.u.allow, listPath(r));
      // (kiracısı büro A, dosyası büro B olan uyuşmazlık satırı bayrak kapalıyken kiracı süzgecinden geçer; bayrak açıkken dosya
      //  kiracısı belirleyicidir ve satır düşer — karşılaştırma bu satır dışında yapılır)
      const comparable = (body: unknown) => (Array.isArray(body) ? body.filter((x: { caseId?: string }) => x.caseId !== w.c.b1) : body);
      if (!/evidence-report|stats/.test(r.name)) expect(canon(comparable(allowed.body))).toEqual(canon(comparable(all.body)));
    });

    it("S6 GET automation/stats — sayaçlar da aynı süzgeçle üretilir", async () => {
      flag.off();
      const all = await http.get(w.u.nobody, `/automation/stats`);
      expect([all.body.totalAutoCases, all.body.totalAutoActions]).toEqual([A_CASE_KEYS.length, A_CASE_KEYS.length]);
      flag.on();
      for (const [label, actor, visible] of w.visibility) {
        const res = await http.get(actor, `/automation/stats`);
        expect([label, res.body.totalAutoCases, res.body.totalAutoActions, res.body.recentActions.length]).toEqual([label, visible.length, visible.length, visible.length]);
      }
    });

    it("S7 GET calendar/upcoming — süzgeç sayfa sınırından (take) ÖNCE uygulanır", async () => {
      // 10 gizli (c6) dosyalı kayıt en yakın tarihe konur: süzgeç sonradan uygulansaydı görünür kayıtlar sayfa dışında kalırdı.
      const extra = [] as string[];
      for (let i = 0; i < 10; i++) {
        extra.push((await db.calendarEvent.create({ data: { tenantId: w.tA, caseId: w.c.c6, title: mark("TAKVIM-ONCE", String(i)), date: new Date(now.getTime() + 3600 * 1000), type: "DURUSMA", createdById: w.u.admin } as never })).id);
      }
      flag.on();
      const res = await http.get(w.u.resp, `/calendar/upcoming?days=7`);
      expect([text(res).includes(mark("TAKVIM", "c1")), text(res).includes(mark("TAKVIM", "dosyasiz")), text(res).includes("TAKVIM-ONCE")]).toEqual([true, true, false]);
      await db.calendarEvent.deleteMany({ where: { id: { in: extra } } });
    });

    it("S5 GET client-notifications/overview — ADMIN yetkisi korunur; son gönderimlerde dosyalı bildirim yalnız görünen dosyayla, dosyasız bildirim kalır", async () => {
      flag.off();
      expect((await http.get(w.u.allow, `/client-notifications/overview`)).status).toBe(403);
      const all = await http.get(w.u.admin, `/client-notifications/overview`);
      expect(all.status).toBe(200);
      for (const k of [...A_CASE_KEYS, "dosyasiz"]) expect([k, text(all).includes(mark("BILDIRIM", k))]).toEqual([k, true]);
      flag.on();
      expect((await http.get(w.u.allow, `/client-notifications/overview`)).status).toBe(403); // büro geneli dosya izni ADMIN yetkisinin yerine geçmez
      const admin = await http.get(w.u.admin, `/client-notifications/overview`);
      const adminVisible = (w.visibility.find(([, actor]) => actor === w.u.admin)?.[2] ?? []) as string[];
      expect(admin.status).toBe(200);
      for (const k of A_CASE_KEYS) expect([k, text(admin).includes(mark("BILDIRIM", k))]).toEqual([k, adminVisible.includes(k)]);
      expect(text(admin)).toContain(mark("BILDIRIM", "dosyasiz"));
      expect(text(admin)).not.toContain(mark("BILDIRIM", "b1"));
    });

    it("S6 POST ai/batch-suggest — kapsam dışı dosya var olmayan dosyayla aynı satırı alır; görünür dosya etkilenmez", async () => {
      const body = { caseIds: [w.c.c1, w.c.c6, w.missing] };
      flag.off();
      const before = await http.post(w.u.nobody, `/ai/batch-suggest`, body);
      const row = (res: request.Response, caseId: string) => (res.body.data as Array<{ caseId: string; error: string | null }>).find((x) => x.caseId === caseId);
      expect(row(before, w.missing)?.error).toBe("Case not found");
      flag.on();
      const resp = await http.post(w.u.resp, `/ai/batch-suggest`, body);
      expect(row(resp, w.c.c1)).toEqual(row(before, w.c.c1));
      expect(row(resp, w.c.c6)).toEqual({ ...row(before, w.missing), caseId: w.c.c6 });
      expect(row(resp, w.missing)).toEqual(row(before, w.missing));
      const allowed = await http.post(w.u.allow, `/ai/batch-suggest`, body);
      expect(canon(allowed.body)).toEqual(canon(before.body));
    });
  });

  // ---------------------------------------------------------------------------------------------------------------------------
  // 3) Banka hareketleri
  // ---------------------------------------------------------------------------------------------------------------------------
  describe("S7 GET bank/accounts/:id/transactions — büro muhasebesi kapsamında kalır; gereksiz dosya / kişi alanları dönmez", () => {
    afterAll(() => flag.off());
    type Tx = { id: string; matchedCaseId: string | null; matchedCollectionId: string | null; rawData?: unknown; counterpartyName?: string };
    const rows = (res: request.Response) => res.body as Tx[];

    // F02 P3 K1 (owner kararı 11.11.2026): hareket okumaları yalnız ADMIN. Maskeleme ADMIN üzerinde sınanır; ADMIN olmayan roller
    // rol kapısında 403 alır (veri üretilmeden). İlişkili / büro geneli izinli ADMIN ve çapraz büro ADMIN vakaları:
    // bank/__tests__/bank-movement-reads-admin.http.db-gated.integration.spec.ts.
    const ADMIN_REQUIRED = { statusCode: 403, message: "Bu işlem için ADMIN yetkisi gerekir", error: "Forbidden" };

    it("bayrak kapalı: ADMIN bugünkü yanıtı alır (ham yük ve eşleşen dosya kimliği dahil)", async () => {
      flag.off();
      const res = await http.get(w.u.admin, `/bank/accounts/${account}/transactions`);
      expect([res.status, rows(res).length]).toEqual([200, A_CASE_KEYS.length + 1]);
      const c6 = rows(res).find((x) => x.id === tx.c6)!;
      expect([c6.matchedCaseId, c6.matchedCollectionId, JSON.stringify(c6.rawData)]).toEqual([w.c.c6, mark("TAHSILAT", "c6"), JSON.stringify({ ham: mark("HAM", "c6") })]);
    });

    it("bayrak açık: ADMIN için satırlar süzülmez (muhasebe bütünlüğü); ham yük hiç dönmez; eşleşen dosya / tahsilat kimliği yalnız dosya görünüyorsa döner; ADMIN olmayan roller 403", async () => {
      flag.on();
      for (const [label, actor, visible] of w.visibility) {
        const res = await http.get(actor, `/bank/accounts/${account}/transactions`);
        if (actor !== w.u.admin) {
          expect([label, res.status, res.body, text(res).includes("HAM-")]).toEqual([label, 403, ADMIN_REQUIRED, false]);
          continue;
        }
        expect([label, res.status, rows(res).length]).toEqual([label, 200, A_CASE_KEYS.length + 1]);
        expect([label, text(res).includes("HAM-"), rows(res).some((x) => "rawData" in x)]).toEqual([label, false, false]);
        for (const k of A_CASE_KEYS) {
          const row = rows(res).find((x) => x.id === tx[k])!;
          const sees = (visible as ACaseKey[]).includes(k);
          expect([label, k, row.matchedCaseId, row.matchedCollectionId]).toEqual([label, k, sees ? w.c[k] : null, sees ? mark("TAHSILAT", k) : null]);
          expect([label, k, row.counterpartyName]).toEqual([label, k, mark("KARSI", k)]); // muhasebe alanı: karşı taraf adı korunur
          if (!sees) expect([label, k, text(res).includes(w.c[k])]).toEqual([label, k, false]);
        }
        expect(rows(res).find((x) => x.id === tx.unmatched)?.matchedCaseId ?? null).toBeNull();
      }
    });

    it("var olmayan hesap bayraktan bağımsız (ADMIN); başka büronun ADMIN olmayan kullanıcısı rol kapısında durur", async () => {
      for (const on of [false, true]) {
        on ? flag.on() : flag.off();
        expect([on, (await http.get(w.v.allow, `/bank/accounts/${account}/transactions`)).body]).toEqual([on, ADMIN_REQUIRED]);
        expect([on, (await http.get(w.u.admin, `/bank/accounts/${w.missing}/transactions`)).body]).toEqual([on, nf("Hesap bulunamadı")]);
      }
    });
  });

  // ---------------------------------------------------------------------------------------------------------------------------
  // 4) Bayrak kapalı uyumluluğu ve yazım yolları
  // ---------------------------------------------------------------------------------------------------------------------------
  describe("bayrak kapalı uyumluluğu ve yazım yolları", () => {
    afterAll(() => flag.off());

    it("bayrak açık büro geneli izinli kullanıcı = bayrak kapalı ilişkisiz kullanıcı (durum eşitliği, bütün dosya kimlikli uçlar)", async () => {
      for (const r of ROUTES) {
        flag.off();
        const before = await r.call(w.u.nobody, "c6");
        flag.on();
        const after = await r.call(w.u.allow, "c6");
        expect([r.name, after.status, isHidden(r, after)]).toEqual([r.name, before.status, false]);
      }
    });

    it("yazım yolu kapsama bağlanmadı: POST calendar/events ilişkisiz kullanıcıda bayrakla değişmez (kapsam dışı dosyaya kayıt dahil)", async () => {
      const body = (title: string) => ({ title, date: soon.toISOString(), type: "DURUSMA", caseId: w.c.c6 });
      flag.off();
      const before = await http.post(w.u.nobody, `/calendar/events`, body(mark("YAZIM", "kapali")));
      flag.on();
      const after = await http.post(w.u.nobody, `/calendar/events`, body(mark("YAZIM", "acik")));
      expect(after.status).toBe(before.status);
    });
  });
});
