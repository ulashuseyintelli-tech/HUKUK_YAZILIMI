// TebligatModule grafiği `pdf-poppler`'ı yükleyebilir; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { CASE_VIEW_SCOPE_OBJECT, CASE_VIEW_SCOPE_PARAM, CaseObjectViewScopeGuard, CaseViewScopeGuard } from "../../case/case-view-scope.guard";
import { CaseViewScopeModule } from "../../case/case-view-scope.module";
import { TebligatController } from "../tebligat.controller";
import { TebligatModule } from "../tebligat.module";

/**
 * F02 P3 Tebligat (R12 Kabul A sonrası, 09.11.2026) — FAIL-CLOSED rota envanteri. TebligatController'daki her GET tam olarak
 * bir sınıfa düşer:
 *  - dosya kimliği yolda → CaseViewScopeGuard (`caseId`);
 *  - kendi kimliğiyle okunan → CaseObjectViewScopeGuard (tür + parametre yolda var);
 *  - `summary` → kapı handler içinde (sorgu parametresi `caseId`; DB spec'i davranışı ölçer);
 *  - dış sistem sorguları (DB okumaz) ve gölgedeki `pending-actions` → bilinçli olarak kapısız.
 * Yeni bir GET eklenirse bu envanter kırılır (sınıflandırılmadan geçmez). Yazım uçları kapsam kapısı TAŞIMAZ.
 */
type Route = { key: string; method: string; scopeParam?: string; object?: { kind: string; param: string } };

function routes(): Route[] {
  const proto = TebligatController.prototype as unknown as Record<string, object>;
  return Object.getOwnPropertyNames(proto)
    .filter((n) => n !== "constructor" && typeof proto[n] === "function")
    .map((name) => {
      const h = proto[name];
      const path = Reflect.getMetadata(PATH_METADATA, h);
      if (path === undefined) return null;
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, h) as number];
      const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, h) ?? [];
      const r: Route = { key: `${method} tebligat/${String(path).replace(/^\/|\/$/g, "")}`.replace(/\/$/, ""), method };
      if (guards.includes(CaseViewScopeGuard)) r.scopeParam = Reflect.getMetadata(CASE_VIEW_SCOPE_PARAM, h) ?? "caseId";
      if (guards.includes(CaseObjectViewScopeGuard)) r.object = Reflect.getMetadata(CASE_VIEW_SCOPE_OBJECT, h);
      return r;
    })
    .filter((r): r is Route => r !== null);
}

const ALL = routes();
const byKey = Object.fromEntries(ALL.map((r) => [r.key, r]));

describe("F02 P3 Tebligat — dosyaya bağlı okuma rota envanteri (fail-closed)", () => {
  it("envanter dolu: denetleyicinin tüm uçları okundu (10 GET + 9 yazım)", () => {
    expect(ALL.filter((r) => r.method === "GET")).toHaveLength(10);
    expect(ALL.filter((r) => r.method !== "GET")).toHaveLength(9);
  });

  it("dosya kimliği yolda olan okumalar CaseViewScopeGuard taşır (parametre caseId)", () => {
    for (const k of ["GET tebligat/case/:caseId", "GET tebligat/check-priority/:caseId"]) {
      expect([k, byKey[k]?.scopeParam, byKey[k]?.object]).toEqual([k, "caseId", undefined]);
    }
  });

  it("kendi kimliğiyle okunanlar nesne kapısı taşır; dosya satırdan çözülür ve parametre yolda var", () => {
    expect(byKey["GET tebligat/:id"]?.object).toEqual({ kind: "tebligat", param: "id" });
    expect(byKey["GET tebligat/case-debtor/:caseDebtorId"]?.object).toEqual({ kind: "caseDebtor", param: "caseDebtorId" });
    for (const r of ALL.filter((x) => x.object)) expect([r.key, r.key.includes(`:${r.object!.param}`)]).toEqual([r.key, true]);
    expect(ALL.filter((r) => r.scopeParam && r.object).map((r) => r.key)).toEqual([]);
  });

  it("kapısız GET'ler yalnız bilinen sınıflar: summary (handler içi), gölgedeki pending-actions, DB okumayan dış sorgular", () => {
    const open = ALL.filter((r) => r.method === "GET" && !r.scopeParam && !r.object).map((r) => r.key).sort();
    expect(open).toEqual(
      [
        "GET tebligat/summary",
        "GET tebligat/pending-actions",
        "GET tebligat/ptt-track/:barcodeNo",
        "GET tebligat/uets-check/:tcVkn",
        "GET tebligat/uets-status/:uetsNo",
        "GET tebligat/electronic-channel/:tcVkn",
      ].sort(),
    );
  });

  it("#3165 korunur: summary ve pending-actions ':id'den önce/sonra sırası değişmedi", () => {
    const order = ALL.filter((r) => r.method === "GET").map((r) => r.key);
    expect(order.indexOf("GET tebligat/summary")).toBeLessThan(order.indexOf("GET tebligat/:id"));
    expect(order.indexOf("GET tebligat/pending-actions")).toBeGreaterThan(order.indexOf("GET tebligat/:id"));
  });

  it("yazım uçları kapsam kapısı taşımaz; sınıf kapıları (JWT + VIEWER yazma reddi) aynı", () => {
    expect(ALL.filter((r) => r.method !== "GET" && (r.scopeParam || r.object)).map((r) => r.key)).toEqual([]);
    const cls: unknown[] = Reflect.getMetadata(GUARDS_METADATA, TebligatController) ?? [];
    expect(cls.map((g) => (g as { name?: string }).name)).toEqual(["JwtAuthGuard", "ViewerWriteDenyGuard"]);
  });

  it("TebligatModule CaseViewScopeModule'ü içe aktarır (yoksa kapı bayrak açıkken 403 ile kapanır)", () => {
    const imports: unknown[] = Reflect.getMetadata(MODULE_METADATA.IMPORTS, TebligatModule) ?? [];
    expect(imports.includes(CaseViewScopeModule)).toBe(true);
  });
});
