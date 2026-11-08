jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { artifactTenantMatch, TemplateEngineService } from "../../template-engine/template-engine.service";

/**
 * F02 P3 (owner kararı 08.11.2026) — aktör ↔ DocumentArtifact ↔ bağlı dosya KİRACI eşleşmesi bayraktan BAĞIMSIZ zorunlu.
 * FAIL-CLOSED envanter: template-engine servisinde DocumentArtifact OKUYAN her yol (önbellek, liste, indirme) eşleşme yardımcısını
 * kullanır; kayıt yazımı (recordDocumentArtifact) zaten aktör kiracısı + kiracıda doğrulanmış dosyayla çalışır. Yeni bir okuma yolu
 * yardımcı olmadan eklenirse bu spec kırmızı. Yardımcı kiracı bağlamı yoksa hiçbir satırla eşleşmez.
 */
const SRC = readFileSync(join(__dirname, "..", "..", "template-engine", "template-engine.service.ts"), "utf8");

describe("F02 P3 — artefakt / dosya / aktör kiracı eşleşmesi (statik + birim)", () => {
  it("yardımcı: kiracı varsa artefakt VE bağlı dosya aynı kiracıda olmalı", () => {
    expect(artifactTenantMatch("t1")).toEqual({ tenantId: "t1", case: { tenantId: "t1" } });
  });

  it("yardımcı: kiracı bağlamı yoksa hiçbir satır eşleşmez (Prisma undefined süzgeci düşürür → fail-open olmaz)", () => {
    for (const t of [undefined, ""]) expect(artifactTenantMatch(t)).toEqual({ AND: [{ id: { in: [] } }] });
  });

  it("DocumentArtifact okuyan üç yol (önbellek, liste, indirme) yardımcıyı kullanır; yardımcısız okuma yok", () => {
    for (const m of ["generateDocumentFromCase", "listDocumentArtifacts", "downloadArtifact"] as const) {
      expect([m, TemplateEngineService.prototype[m].toString().includes("artifactTenantMatch")]).toEqual([m, true]);
    }
    const reads = SRC.match(/documentArtifact\??\.(findFirst|findMany|findUnique|count)\(\{[\s\S]{0,600}?\}\)/g) ?? [];
    expect(reads).toHaveLength(3);
    for (const r of reads) expect([r.slice(0, 60), r.includes("artifactTenantMatch(")]).toEqual([r.slice(0, 60), true]);
  });

  it("kayıt yazımı aktör kiracısıyla çalışır (recordDocumentArtifact: tenantId ile arar / yazar; kiracısız kayıt yok)", () => {
    const rec = SRC.slice(SRC.indexOf("private async recordDocumentArtifact("), SRC.indexOf("private generateDataHash("));
    expect(rec).toContain("if (client?.create && input.tenantId)");
    expect((rec.match(/tenantId: input\.tenantId,/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("indirme: kişi kapsamı (bayrağa bağlı) servis okumasından ÖNCE; kiracı eşleşmesi bayraksız servis okumasında", () => {
    const dl = SRC.slice(SRC.indexOf("async downloadArtifact("));
    expect(dl.indexOf("artifactTenantMatch(tenantId)")).toBeGreaterThan(-1);
    expect(dl.indexOf("artifactTenantMatch(tenantId)")).toBeLessThan(dl.indexOf("fs.readFile"));
    expect(dl.slice(0, dl.indexOf("fs.readFile"))).not.toMatch(/isCaseViewScopeEnabled/);
  });
});
