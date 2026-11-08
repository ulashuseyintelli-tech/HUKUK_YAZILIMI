jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { CaseCollateralController } from "../../case-collateral/case-collateral.controller";
import { CaseCollateralModule } from "../../case-collateral/case-collateral.module";
import { CaseInstrumentController } from "../../case-instrument/case-instrument.controller";
import { CaseInstrumentModule } from "../../case-instrument/case-instrument.module";
import { CaseJudgmentController } from "../../case-judgment/case-judgment.controller";
import { CaseJudgmentModule } from "../../case-judgment/case-judgment.module";
import { CaseLeaseController } from "../../case-lease/case-lease.controller";
import { CaseLeaseModule } from "../../case-lease/case-lease.module";
import { CASE_VIEW_SCOPE_PARAM, CaseViewScopeGuard } from "../case-view-scope.guard";
import { CaseViewScopeModule } from "../case-view-scope.module";

/**
 * F02 P3-D3b-1 (owner kararı 08.11.2026) — FAIL-CLOSED rota envanteri: dosya kayıtlarının (teminat, çek/senet, ilam, kira)
 * dosya kimliği YOLDA (`:caseId`) olan her OKUMA (GET) ucu CaseViewScopeGuard taşır ve kapı `caseId` parametresini okur.
 * Yazım uçları (POST / PUT / DELETE) ve kendi kimliğiyle erişilen `:id` uçları (D3b-2; ayrı dilim, AÇIK) kapı TAŞIMAZ.
 * Dosya kimlikli yeni bir GET kapısız eklenirse ya da modül kapsam servisini içe aktarmazsa bu spec kırmızı.
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
      return { ctrl: base, name, method, full, guarded: guards.includes(CaseViewScopeGuard), param: Reflect.getMetadata(CASE_VIEW_SCOPE_PARAM, h) };
    })
    .filter((r): r is Route => r !== null);
}

const ALL = [
  ...routes(CaseCollateralController),
  ...routes(CaseInstrumentController),
  ...routes(CaseJudgmentController),
  ...routes(CaseLeaseController),
];
const key = (r: Route) => `${r.method} ${r.full}`;
const caseKeyed = (r: Route) => /(^|\/):caseId(\/|$)/.test(r.full);

describe("F02 P3-D3b-1 — dosya kayıtlarının dosya kimlikli okuma rota envanteri (fail-closed)", () => {
  it("envanter boş değil: dört controller okundu (6 + 7 + 6 + 6 uç)", () => {
    expect(ALL.length).toBe(25);
    expect(new Set(ALL.map((r) => r.ctrl))).toEqual(new Set(["case-collaterals", "case-instruments", "case-judgments", "case-leases"]));
  });

  it("dosya kimlikli HER GET kapılı; kapılı uçlar tam olarak talimattaki 8 GET", () => {
    expect(ALL.filter((r) => r.method === "GET" && caseKeyed(r) && !r.guarded).map(key)).toEqual([]);
    expect(ALL.filter((r) => r.guarded).map(key).sort()).toEqual(
      [
        "GET case-collaterals/case/:caseId",
        "GET case-collaterals/case/:caseId/total",
        "GET case-instruments/case/:caseId",
        "GET case-instruments/case/:caseId/total",
        "GET case-judgments/case/:caseId",
        "GET case-judgments/case/:caseId/total",
        "GET case-leases/case/:caseId",
        "GET case-leases/case/:caseId/debt",
      ].sort(),
    );
  });

  it("kapının okuduğu parametre `caseId` ve yolda var", () => {
    for (const r of ALL.filter((x) => x.guarded)) {
      const param = r.param ?? "caseId";
      expect([key(r), param, r.full.includes(`:${param}`)]).toEqual([key(r), "caseId", true]);
    }
  });

  it("yazım uçları ve kendi kimlikli `:id` okumaları kapı taşımaz (D3b-1 dışı; D3b-2 AÇIK)", () => {
    expect(ALL.filter((r) => r.guarded && r.method !== "GET").map(key)).toEqual([]);
    expect(ALL.filter((r) => r.method === "GET" && !r.guarded).map(key).sort()).toEqual(
      ["GET case-collaterals/:id", "GET case-instruments/:id", "GET case-judgments/:id", "GET case-leases/:id"].sort(),
    );
    expect(ALL.some((r) => r.method === "POST" && r.full === "case-instruments/chain/analyze" && !r.guarded)).toBe(true);
  });

  it("dört modül de CaseViewScopeModule'ü içe aktarır (kapının servisi; yoksa kapı 403 ile kapanır)", () => {
    for (const mod of [CaseCollateralModule, CaseInstrumentModule, CaseJudgmentModule, CaseLeaseModule]) {
      const imports: unknown[] = Reflect.getMetadata(MODULE_METADATA.IMPORTS, mod) ?? [];
      expect([mod.name, imports.includes(CaseViewScopeModule)]).toEqual([mod.name, true]);
    }
  });
});
