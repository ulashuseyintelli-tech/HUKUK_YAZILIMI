// DebtorModule grafiği `pdf-poppler`'ı yükleyebilir; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CASE_OBJECT_NOT_FOUND, CASE_VIEW_SCOPE_OBJECT, CASE_VIEW_SCOPE_PARAM, CaseObjectViewScopeGuard, CaseViewScopeGuard } from "../../case/case-view-scope.guard";
import { DebtorController } from "../debtor.controller";

/**
 * F02 P3 Bulgu 3 (09.11.2026) — FAIL-CLOSED rota envanteri. DebtorController'daki her GET tam olarak bir sınıfa düşer:
 *  - dosya kimliği yolda → CaseViewScopeGuard (`caseId`);
 *  - kendi kimliğiyle okunan dosya borçlusu → CaseObjectViewScopeGuard (`caseDebtor`, parametre yolda);
 *  - genel borçlu platformu (borçlu kişi / liste / istatistik / aktörün kendi bildirimleri) → bilinçli olarak kapısız (kapsam dışı).
 * Yeni bir GET eklenirse envanter kırılır. Yazım uçları kapsam kapısı TAŞIMAZ (mevcut işlem yetkileri değişmez).
 * Web bağı: web istemcisinin GERÇEKTEN çağırdığı dosyaya bağlı borçlu okuma yolları kaynaktan okunur ve kapılı uçlara eşlenir.
 */
type Route = { key: string; method: string; scopeParam?: string; object?: { kind: string; param: string } };

function routes(): Route[] {
  const proto = DebtorController.prototype as unknown as Record<string, object>;
  return Object.getOwnPropertyNames(proto)
    .filter((n) => n !== "constructor" && typeof proto[n] === "function")
    .map((name) => {
      const h = proto[name];
      const path = Reflect.getMetadata(PATH_METADATA, h);
      if (path === undefined) return null;
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, h) as number];
      const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, h) ?? [];
      const p = String(path).replace(/^\/|\/$/g, "");
      const r: Route = { key: `${method} debtors${p ? "/" + p : ""}`, method };
      if (guards.includes(CaseViewScopeGuard)) r.scopeParam = Reflect.getMetadata(CASE_VIEW_SCOPE_PARAM, h) ?? "caseId";
      if (guards.includes(CaseObjectViewScopeGuard)) r.object = Reflect.getMetadata(CASE_VIEW_SCOPE_OBJECT, h);
      return r;
    })
    .filter((r): r is Route => r !== null);
}

const ALL = routes();
const byKey = Object.fromEntries(ALL.map((r) => [r.key, r]));
const CASE_SCOPED = ["GET debtors/case/:caseId", "GET debtors/case/:caseId/:caseDebtorId", "GET debtors/case/:caseId/:caseDebtorId/service/history"];
const OBJECT_SCOPED = "GET debtors/case-debtors/:caseDebtorId/active-process-summary";
const OUT_OF_SCOPE = ["GET debtors", "GET debtors/statistics", "GET debtors/cross-case-notifications", "GET debtors/:id", "GET debtors/:id/cross-file-alerts"];
const WEB = resolve(__dirname, "../../../../../web/src");
const web = (rel: string) => readFileSync(resolve(WEB, rel), "utf8");

/** Web istemci yöntemi gövdesindeki yolu (template literal) Nest rota anahtarına çevirir; yöntem `method:` içermemeli (GET). */
function webGet(src: string, fn: string): string {
  const m = new RegExp(`async ${fn}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n  \\}`).exec(src);
  if (!m) throw new Error(`web istemci yöntemi bulunamadı: ${fn}`);
  if (/method\s*:/.test(m[1])) throw new Error(`${fn} GET değil`);
  const lit = /`(\/debtors\/[^`]+)`/.exec(m[1]);
  if (!lit) throw new Error(`${fn}: /debtors yolu yok`);
  return "GET " + lit[1].slice(1).replace(/\$\{query\}$/, "").replace(/\$\{(\w+)\}/g, ":$1");
}

describe("F02 P3 Bulgu 3 — dosyaya bağlı borçlu okuma rota envanteri (fail-closed)", () => {
  it("envanter dolu: denetleyicinin tüm uçları okundu (9 GET + 14 yazım)", () => {
    expect(ALL.filter((r) => r.method === "GET")).toHaveLength(9);
    expect(ALL.filter((r) => r.method !== "GET")).toHaveLength(14);
  });

  it("dosya kimliği yolda olan okumalar CaseViewScopeGuard taşır (parametre caseId)", () => {
    for (const k of CASE_SCOPED) expect([k, byKey[k]?.scopeParam, byKey[k]?.object]).toEqual([k, "caseId", undefined]);
  });

  it("kendi kimliğiyle okunan dosya borçlusu nesne kapısı taşır; dosya CaseDebtor satırından çözülür, 404 gövdesi dosya ile aynı", () => {
    expect([byKey[OBJECT_SCOPED]?.object, byKey[OBJECT_SCOPED]?.scopeParam]).toEqual([{ kind: "caseDebtor", param: "caseDebtorId" }, undefined]);
    expect(OBJECT_SCOPED).toContain(":caseDebtorId");
    expect(CASE_OBJECT_NOT_FOUND.caseDebtor).toBe("Dosya bulunamadı");
  });

  it("her GET sınıflandırılmış: kapılı 4 + bilinçli kapsam dışı (genel borçlu platformu) 5", () => {
    const gets = ALL.filter((r) => r.method === "GET").map((r) => r.key).sort();
    expect(gets).toEqual([...CASE_SCOPED, OBJECT_SCOPED, ...OUT_OF_SCOPE].sort());
    for (const k of OUT_OF_SCOPE) expect([k, byKey[k]?.scopeParam, byKey[k]?.object]).toEqual([k, undefined, undefined]);
  });

  it("yazım uçları kapsam kapısı taşımaz (mevcut işlem yetkileri değişmez)", () => {
    for (const r of ALL.filter((x) => x.method !== "GET")) expect([r.key, r.scopeParam, r.object]).toEqual([r.key, undefined, undefined]);
  });

  it("sınıf kapıları değişmedi: JwtAuthGuard + ViewerWriteDenyGuard", () => {
    const g = (Reflect.getMetadata(GUARDS_METADATA, DebtorController) ?? []).map((x: { name: string }) => x.name);
    expect(g).toEqual(["JwtAuthGuard", "ViewerWriteDenyGuard"]);
  });

  it("web bağı: web istemcisinin dosyaya bağlı borçlu okuma yolları kapılı uçlara düşer", () => {
    const api = web("lib/api.ts");
    const dapi = web("lib/api/debtors.ts");
    const yollar = [webGet(api, "getCaseDebtors"), webGet(api, "getCaseDebtorDetail"), webGet(api, "getServiceHistory"), webGet(dapi, "getCaseDebtors")];
    expect(yollar).toEqual(["GET debtors/case/:caseId", "GET debtors/case/:caseId/:caseDebtorId", "GET debtors/case/:caseId/:caseDebtorId/service/history", "GET debtors/case/:caseId"]);
    for (const k of yollar) expect([k, byKey[k]?.scopeParam]).toEqual([k, "caseId"]);
  });

  it("web bağı: gerçek ekranlar bu istemci yöntemlerini çağırır (Borçlular kartı, borçlu detay çekmecesi)", () => {
    expect(web("app/(dashboard)/cases/[id]/page.tsx")).toMatch(/\bapi\.getCaseDebtors\(/);
    const drawer = web("components/debtor/DebtorDetailDrawer.tsx");
    expect(drawer).toMatch(/\bgetCaseDebtorDetail\(/);
    expect(drawer).toMatch(/\bgetServiceHistory\(/);
  });
});
