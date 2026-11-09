jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { ExecutionContext, RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { CaseCollateralController } from "../../case-collateral/case-collateral.controller";
import { CaseInstrumentController } from "../../case-instrument/case-instrument.controller";
import { CaseJudgmentController } from "../../case-judgment/case-judgment.controller";
import { CaseLeaseController } from "../../case-lease/case-lease.controller";
import { CaseFeeAgreementController } from "../../client-settlement/case-fee-agreement.controller";
import { ClientSettlementModule } from "../../client-settlement/client-settlement.module";
import {
  CASE_OBJECT_NOT_FOUND,
  CASE_VIEW_SCOPE_OBJECT,
  CaseObjectViewScopeGuard,
  CaseViewScopeGuard,
  CaseViewScopeObjectMeta,
} from "../case-view-scope.guard";
import { CaseViewScopeModule } from "../case-view-scope.module";
import { CASE_VIEW_SCOPE_FLAG } from "../case-view-scope";

/**
 * F02 P3-D3b-2 (owner kararı 08.11.2026) — FAIL-CLOSED rota envanteri: KENDİ kimliğiyle okunan dosya nesnelerinin her OKUMA (GET)
 * ucu CaseObjectViewScopeGuard taşır; kapının okuduğu nesne türü ve parametre yolda gerçekten bulunur. Bu beş controller'da
 * kapısız GET kalmaz (dosya kimlikli olanlar D3b-1 kapısını taşır). Yazım uçları (POST / PUT / DELETE; sözleşme update /
 * terminate dahil) kapı TAŞIMAZ. Kapı, nesnenin kendi servisinin "bulunamadı" mesajını kullanır (var olmayanla aynı gövde).
 */
type Route = { ctrl: string; method: string; full: string; scope: boolean; object: CaseViewScopeObjectMeta | undefined };

function routes(ctrl: { prototype: object }): Route[] {
  const base = String(Reflect.getMetadata(PATH_METADATA, ctrl) ?? "").replace(/^\/|\/$/g, "");
  const proto = ctrl.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto)
    .filter((n) => n !== "constructor" && typeof proto[n] === "function")
    .map((name) => {
      const h = proto[name] as object;
      const path = Reflect.getMetadata(PATH_METADATA, h);
      if (path === undefined) return null;
      const full = [base, String(path).replace(/^\/|\/$/g, "")].filter(Boolean).join("/");
      const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, h) ?? [];
      const object = guards.includes(CaseObjectViewScopeGuard) ? Reflect.getMetadata(CASE_VIEW_SCOPE_OBJECT, h) : undefined;
      return { ctrl: base, method: RequestMethod[Reflect.getMetadata(METHOD_METADATA, h) as number], full, scope: guards.includes(CaseViewScopeGuard), object };
    })
    .filter((r): r is Route => r !== null);
}

const ALL = [CaseCollateralController, CaseInstrumentController, CaseJudgmentController, CaseLeaseController, CaseFeeAgreementController].flatMap(routes);
const key = (r: Route) => `${r.method} ${r.full}`;

const EXPECTED: Record<string, CaseViewScopeObjectMeta> = {
  "GET case-collaterals/:id": { kind: "caseCollateral", param: "id" },
  "GET case-instruments/:id": { kind: "caseInstrument", param: "id" },
  "GET case-judgments/:id": { kind: "caseJudgment", param: "id" },
  "GET case-leases/:id": { kind: "caseLease", param: "id" },
  "GET case-fee-agreements/case-client/:caseClientId": { kind: "caseClient", param: "caseClientId" },
  "GET case-fee-agreements/case-client/:caseClientId/active": { kind: "caseClient", param: "caseClientId" },
  "GET case-fee-agreements/:agreementId": { kind: "caseFeeAgreement", param: "agreementId" },
};

describe("F02 P3-D3b-2 — kendi kimlikli dosya nesnesi okuma rota envanteri (fail-closed)", () => {
  it("envanter boş değil: beş controller okundu (25 + 6 uç)", () => {
    expect(ALL.length).toBe(31);
    expect(ALL.filter((r) => r.ctrl === "case-fee-agreements")).toHaveLength(6);
  });

  it("nesne kapısı tam olarak talimattaki 7 GET'te; tür ve parametre doğru, parametre yolda var", () => {
    const got = Object.fromEntries(ALL.filter((r) => r.object).map((r) => [key(r), r.object]));
    expect(got).toEqual(EXPECTED);
    for (const r of ALL.filter((x) => x.object)) expect([key(r), r.full.includes(`:${r.object!.param}`)]).toEqual([key(r), true]);
  });

  it("bu controller'larda kapısız GET yok: her GET ya D3b-1 dosya kapısını ya D3b-2 nesne kapısını taşır (ikisini birden değil)", () => {
    const gets = ALL.filter((r) => r.method === "GET");
    expect(gets.filter((r) => !r.scope && !r.object).map(key)).toEqual([]);
    expect(gets.filter((r) => r.scope && r.object).map(key)).toEqual([]);
  });

  it("yazım uçları kapı taşımaz (D3b-2 dışı; sözleşme update / terminate dahil)", () => {
    const writes = ALL.filter((r) => r.method !== "GET");
    expect(writes.filter((r) => r.scope || r.object).map(key)).toEqual([]);
    expect(writes.map(key)).toEqual(expect.arrayContaining(["POST case-fee-agreements/:agreementId", "POST case-fee-agreements/:agreementId/terminate"]));
  });

  it("404 mesajları nesnenin kendi servisinin 'bulunamadı' mesajıdır; dosya–müvekkil bağı D3b-1 ile aynı", () => {
    expect(CASE_OBJECT_NOT_FOUND).toEqual({
      caseCollateral: "Teminat bulunamadi",
      caseInstrument: "Kambiyo senedi bulunamadi",
      caseJudgment: "Ilam bulunamadi",
      caseLease: "Kira sozlesmesi bulunamadi",
      caseFeeAgreement: "Ücret sözleşmesi bulunamadı",
      caseClient: "Dosya bulunamadı",
      tebligat: "Tebligat bulunamadı", // P3 Tebligat (09.11.2026); envanteri tebligat-case-view-scope-routes.static.spec.ts
      caseDebtor: "Dosya bulunamadı",
      precautionaryOrder: "İhtiyati haciz kararı bulunamadı", // P3 tarama S9 (10.11.2026); davranışı case-view-scope-alt-routes HTTP + DB spec'i ölçer
      // P3 tarama S4 (10.11.2026); davranışı debtor-side-case-view-scope HTTP + DB spec'i ölçer
      clientInfoRequest: "Bilgi talebi bulunamadı",
      uyapQuery: "Sorgu bulunamadı",
      institutionLetter: "Yazı bulunamadı",
      assetQuery: "Sorgu bulunamadı",
      claimItem: "Alacak kalemi bulunamadı",
      collection: "Tahsilat bulunamadı",
    });
  });

  it("ClientSettlementModule CaseViewScopeModule'ü içe aktarır (kapının servisi; yoksa kapı 403 ile kapanır)", () => {
    const imports: unknown[] = Reflect.getMetadata(MODULE_METADATA.IMPORTS, ClientSettlementModule) ?? [];
    expect(imports.includes(CaseViewScopeModule)).toBe(true);
  });
});

describe("F02 P3-D3b-2 — CaseObjectViewScopeGuard sözleşmesi (birim)", () => {
  const original = process.env[CASE_VIEW_SCOPE_FLAG];
  afterEach(() => {
    if (original === undefined) delete process.env[CASE_VIEW_SCOPE_FLAG];
    else process.env[CASE_VIEW_SCOPE_FLAG] = original;
  });
  const ctx = (params: Record<string, string>) =>
    ({
      getHandler: () => CaseFeeAgreementController.prototype.getById,
      switchToHttp: () => ({ getRequest: () => ({ user: { tenantId: "t1", id: "u1" }, params }) }),
    }) as unknown as ExecutionContext;
  const reflector = (meta: unknown) => ({ get: () => meta }) as unknown as Reflector;
  const meta: CaseViewScopeObjectMeta = { kind: "caseFeeAgreement", param: "agreementId" };

  it("bayrak kapalı → servis çağrılmadan geçer (ek sorgu yok)", async () => {
    delete process.env[CASE_VIEW_SCOPE_FLAG];
    const scope = { isCaseObjectVisible: jest.fn() };
    await expect(new CaseObjectViewScopeGuard(scope as never, reflector(meta)).canActivate(ctx({ agreementId: "a1" }))).resolves.toBe(true);
    expect(scope.isCaseObjectVisible).not.toHaveBeenCalled();
  });

  it("bayrak açık + servis yok / nesne meta verisi yok / bilinmeyen tür → 403 UNRESOLVED (fail-closed)", async () => {
    process.env[CASE_VIEW_SCOPE_FLAG] = "true";
    const scope = { isCaseObjectVisible: jest.fn().mockResolvedValue(true) };
    for (const guard of [
      new CaseObjectViewScopeGuard(undefined, reflector(meta)),
      new CaseObjectViewScopeGuard(scope as never, reflector(undefined)),
      new CaseObjectViewScopeGuard(scope as never, undefined),
      new CaseObjectViewScopeGuard(scope as never, reflector({ kind: "bilinmeyen", param: "agreementId" })),
    ]) {
      await expect(guard.canActivate(ctx({ agreementId: "a1" }))).rejects.toMatchObject({ status: 403, response: { code: "CASE_VIEW_SCOPE_UNRESOLVED" } });
    }
    expect(scope.isCaseObjectVisible).not.toHaveBeenCalled();
  });

  it("bayrak açık: görünmez → nesnenin kendi 404 mesajı; görünür → geçer; kiracı / aktör kimlikten, nesne kimliği yoldan", async () => {
    process.env[CASE_VIEW_SCOPE_FLAG] = "true";
    const scope = { isCaseObjectVisible: jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true) };
    const guard = new CaseObjectViewScopeGuard(scope as never, reflector(meta));
    await expect(guard.canActivate(ctx({ agreementId: "a1" }))).rejects.toMatchObject({ status: 404, message: "Ücret sözleşmesi bulunamadı" });
    await expect(guard.canActivate(ctx({ agreementId: "a2" }))).resolves.toBe(true);
    expect(scope.isCaseObjectVisible.mock.calls).toEqual([
      ["t1", "u1", "caseFeeAgreement", "a1"],
      ["t1", "u1", "caseFeeAgreement", "a2"],
    ]);
  });
});
