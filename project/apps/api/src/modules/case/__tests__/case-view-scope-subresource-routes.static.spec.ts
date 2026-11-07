jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { CaseBalanceController } from "../../case-balance/case-balance.controller";
import { CaseDebtorController } from "../../debtor/case-debtor.controller";
import { CaseGroupController } from "../../group/group.controller";
import { CaseController } from "../case.controller";
import { CASE_VIEW_SCOPE_PARAM, CaseViewScopeGuard } from "../case-view-scope.guard";

/**
 * F02 P3-D3 (owner kararı 08.11.2026) — FAIL-CLOSED rota envanteri: dosya kimliği YOLDA olan her dosya alt kaynağı OKUMA (GET)
 * ucu CaseViewScopeGuard taşır ve kapının okuduğu parametre adı yolda gerçekten bulunur (case.controller `:id`, diğerleri
 * `:caseId`). Yazım uçları (POST / PUT / PATCH / DELETE; D3 dışı) ve D1 detayı (`GET cases/:id`, servis düzeyinde
 * findOneVisible) kapı TAŞIMAZ. Dosya kimlikli yeni bir GET kapısız eklenirse bu spec kırmızı.
 */
type Route = { ctrl: string; name: string; method: string; full: string; guarded: boolean; param: string | undefined };

function routes(ctrl: { prototype: object }): Route[] {
  const base = String(Reflect.getMetadata(PATH_METADATA, ctrl) ?? "").replace(/^\/|\/$/g, "");
  const proto = ctrl.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto)
    .filter((n) => n !== "constructor" && typeof proto[n] === "function")
    .map((name) => {
      const h = proto[name] as object;
      const path = Reflect.getMetadata(PATH_METADATA, h);
      if (path === undefined) return null;
      const sub = String(path).replace(/^\/|\/$/g, "");
      const full = [base, sub].filter(Boolean).join("/");
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, h) as number];
      const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, h) ?? [];
      return { ctrl: base || "(kök)", name, method, full, guarded: guards.includes(CaseViewScopeGuard), param: Reflect.getMetadata(CASE_VIEW_SCOPE_PARAM, h) };
    })
    .filter((r): r is Route => r !== null);
}

const ALL = [...routes(CaseController), ...routes(CaseBalanceController), ...routes(CaseGroupController), ...routes(CaseDebtorController)];
const key = (r: Route) => `${r.method} ${r.full}`;
const caseKeyed = (r: Route) => /(^|\/)cases\/:(id|caseId)(\/|$)/.test(r.full);

describe("F02 P3-D3 — dosya alt kaynağı okuma rota envanteri (fail-closed)", () => {
  it("envanter boş değil: dört controller okundu", () => {
    expect(ALL.length).toBeGreaterThan(40);
    expect(ALL.some((r) => r.full === "cases/:id/notes")).toBe(true);
  });

  it("dosya kimlikli HER GET kapılı; tek istisna D1 detayı (GET cases/:id, servis düzeyinde)", () => {
    const unguarded = ALL.filter((r) => r.method === "GET" && caseKeyed(r) && !r.guarded).map(key);
    expect(unguarded).toEqual(["GET cases/:id"]);
    expect(CaseController.prototype.findOne.toString()).toContain("findOneVisible");
  });

  it("kapının okuduğu parametre yolda var (case.controller 'id', diğerleri 'caseId')", () => {
    for (const r of ALL.filter((x) => x.guarded)) {
      const param = r.param ?? "caseId";
      expect([key(r), r.full.includes(`:${param}`)]).toEqual([key(r), true]);
    }
    expect(ALL.filter((r) => r.guarded && r.ctrl === "cases").every((r) => r.param === "id")).toBe(true);
  });

  it("kapılı uç sayıları: cases 13, balance 2, groups 1, case-debtor 2 = 18; hepsi GET", () => {
    const g = ALL.filter((r) => r.guarded);
    expect(g.every((r) => r.method === "GET")).toBe(true);
    const count = (ctrl: string) => g.filter((r) => r.ctrl === ctrl).length;
    expect([count("cases"), count("cases/:caseId/balance"), count("cases/:caseId/groups"), count("(kök)")]).toEqual([13, 2, 1, 2]);
  });

  it("yazım uçları ve dosya kimliksiz uçlar kapı taşımaz (D3 dışı; D3b kendi kimlikli kayıtlar ayrı)", () => {
    expect(ALL.filter((r) => r.guarded && (r.method !== "GET" || !caseKeyed(r))).map(key)).toEqual([]);
    expect(ALL.some((r) => r.method === "PUT" && r.full === "case-debtors/:id" && !r.guarded)).toBe(true);
  });
});
