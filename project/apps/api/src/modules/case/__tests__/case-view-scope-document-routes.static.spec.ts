jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { DocumentController } from "../../document/document.controller";
import { PdfController } from "../../pdf/pdf.controller";
import { TemplateEngineController } from "../../template-engine/template-engine.controller";
import { TemplateEngineService } from "../../template-engine/template-engine.service";
import { CaseViewScopeGuard } from "../case-view-scope.guard";

/**
 * F02 P3-D2 (owner kararı 08.11.2026) — FAIL-CLOSED rota envanteri: dosya kimliği YOLDA (`:caseId`) olan her belge okuma
 * ucu CaseViewScopeGuard taşır. Dışarıda kalan TEK uç kalıcı belge yazan `POST template-engine/cases/:caseId/documents/:format`
 * (DocumentArtifact oluşturur → owner: kalıcı belge oluşturan işlemler bu dilime girmez; D2b). Artefakt indirmede dosya
 * artefakt satırından çözülür (handler içinde, servis çağrısından ÖNCE). Yeni bir `:caseId` ucu kapısız eklenirse bu spec kırmızı.
 */
type Route = { ctrl: string; name: string; method: string; path: string; guarded: boolean };

function routes(ctrl: { prototype: object }): Route[] {
  const base = String(Reflect.getMetadata(PATH_METADATA, ctrl));
  const proto = ctrl.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto)
    .filter((n) => n !== "constructor" && typeof proto[n] === "function")
    .map((name) => {
      const h = proto[name] as object;
      const path = Reflect.getMetadata(PATH_METADATA, h);
      if (path === undefined) return null;
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, h) as number];
      const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, h) ?? [];
      return { ctrl: base, name, method, path: String(path), guarded: guards.includes(CaseViewScopeGuard) };
    })
    .filter((r): r is Route => r !== null);
}

const ALL = [...routes(DocumentController), ...routes(TemplateEngineController), ...routes(PdfController)];
const key = (r: Route) => `${r.method} ${r.ctrl}/${r.path}`;
const PERSISTING_EXCLUSION = "POST template-engine/cases/:caseId/documents/:format";

describe("F02 P3-D2 — belge okuma rota envanteri (fail-closed)", () => {
  it("envanter boş değil: üç controller'ın rotaları okundu", () => {
    expect(ALL.length).toBeGreaterThan(40);
    expect(new Set(ALL.map((r) => r.ctrl))).toEqual(new Set(["documents", "template-engine", "pdf"]));
  });

  it("yolunda :caseId olan HER uç kapılı; tek istisna kalıcı belge yazan uç", () => {
    const caseKeyed = ALL.filter((r) => r.path.includes(":caseId"));
    const unguarded = caseKeyed.filter((r) => !r.guarded).map(key);
    expect(unguarded).toEqual([PERSISTING_EXCLUSION]);
  });

  it("kapılı uç sayıları: documents 11 (5 GET + 6 yazımsız POST üretimi), template-engine 22 GET, pdf 1 GET = 34", () => {
    const g = ALL.filter((r) => r.guarded);
    const count = (ctrl: string) => g.filter((r) => r.ctrl === ctrl).length;
    expect([count("documents"), count("template-engine"), count("pdf")]).toEqual([11, 22, 1]);
    expect(g.filter((r) => r.ctrl === "template-engine").every((r) => r.method === "GET")).toBe(true);
  });

  it("kapı :caseId taşımayan bir uca uygulanmamış (gövdeden üretim, şablon listesi vb. değişmez)", () => {
    expect(ALL.filter((r) => r.guarded && !r.path.includes(":caseId")).map(key)).toEqual([]);
  });

  it("artefakt indirme: tek :artifactId ucu; kapsam / eşleşme denetimi servis çağrısından ÖNCE", () => {
    expect(ALL.filter((r) => r.path.includes(":artifactId")).map(key)).toEqual(["GET template-engine/documents/:artifactId/download"]);
    const src = TemplateEngineController.prototype.downloadArtifact.toString();
    const gate = src.indexOf("isArtifactVisible");
    const read = src.indexOf("templateEngineService.downloadArtifact");
    expect(gate).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(gate);
  });

  it("dışarıda kalan uç gerçekten kalıcı belge yazıyor (istisnanın gerekçesi sürüyor)", () => {
    expect(TemplateEngineService.prototype.generateDocumentFromCase.toString()).toContain("recordDocumentArtifact");
  });
});
