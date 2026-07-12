/**
 * PR-EA-4 — Guarded Write Path statik guard'ı.
 *
 * `WorkflowEngine.createEnforcementAction()` metodunun kaynak metnini doğrudan tarar ve şunları
 * kalıcı olarak kilitler:
 * - create data'sı tenantId taşır (schema nullable olsa da, write-path bunu asla atlamaz)
 * - Case lookup composite'tir (yalnız id DEĞİL, tenantId de aynı where içinde)
 * - CaseDebtor lookup composite'tir (id + caseId aynı where içinde)
 * - eski, tenantId'siz unguarded create deseni (yalnız caseId+type) artık AKTİF DEĞİL
 *
 * Bu dosya method gövdesini, dosyadaki bir sonraki metodun başlangıcına kadar (`calculateNextActionTime`)
 * bir alt-string olarak izole eder — böylece dosyanın başka yerlerindeki tesadüfi eşleşmeler testi
 * yanlış geçirmez.
 */
import * as fs from "fs";
import * as path from "path";

const WORKFLOW_ENGINE_PATH = path.join(__dirname, "..", "workflow-engine.service.ts");
const source = fs.readFileSync(WORKFLOW_ENGINE_PATH, "utf8");

function extractMethodBody(src: string, startMarker: string, endMarker: string): string {
  const startIdx = src.indexOf(startMarker);
  const endIdx = src.indexOf(endMarker, startIdx);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(
      `PR-EA-4 statik guard: method sınırları bulunamadı (start="${startMarker}", end="${endMarker}") — dosya yapısı değişmiş olabilir, guard'ı güncelle.`,
    );
  }
  return src.slice(startIdx, endIdx);
}

describe("PR-EA-4 Guarded Write Path statik guard'ı", () => {
  const methodBody = extractMethodBody(
    source,
    "async createEnforcementAction(",
    "// Sonraki işlem zamanını hesapla",
  );

  it("create data'sı tenantId taşır", () => {
    expect(methodBody).toMatch(/data:\s*\{[^}]*tenantId/s);
  });

  it("Case lookup composite'tir: aynı where içinde hem id hem tenantId", () => {
    expect(methodBody).toMatch(/tx\.case\.findFirst\(\{\s*where:\s*\{\s*id:\s*caseId,\s*tenantId/);
  });

  it("CaseDebtor lookup composite'tir: aynı where içinde hem id hem caseId", () => {
    expect(methodBody).toMatch(/tx\.caseDebtor\.findFirst\(\{\s*where:\s*\{\s*id:\s*caseDebtorId,\s*caseId/);
  });

  it("duplicate guard (enforcementAction.findFirst) tenantId taşır", () => {
    expect(methodBody).toMatch(/tx\.enforcementAction\.findFirst\(\{\s*where:\s*\{\s*tenantId/);
  });

  it("tüm doğrulama + create tek $transaction içindedir", () => {
    expect(methodBody).toMatch(/this\.prisma\.\$transaction\(async\s*\(tx\)\s*=>/);
  });

  it("eski, tenantId'siz unguarded create deseni (yalnız caseId+type ile başlayan data) artık AKTİF DEĞİL", () => {
    // Eski desen: data: { caseId, type, status: ..., requestDate: ... } — tenantId YOK.
    // Bunu tespit etmek için: create data bloğunun caseId ile başlayıp tenantId hiç içermediği
    // eski şekli artık yok; yeni create çağrısında tenantId, caseId'den ÖNCE gelir.
    const createDataMatch = methodBody.match(/tx\.enforcementAction\.create\(\{\s*data:\s*\{([^}]*)\}/s);
    expect(createDataMatch).not.toBeNull();
    const dataBlock = createDataMatch![1];
    expect(dataBlock).toMatch(/tenantId/);
    // caseDebtorId de artık her zaman create data'sında (null-compatible) bulunmalı
    expect(dataBlock).toMatch(/caseDebtorId/);
  });

  it("CreateEnforcementActionInput contract'ı export edilir ve tenantId zorunlu (opsiyonel değil)", () => {
    const interfaceMatch = source.match(/export interface CreateEnforcementActionInput \{([^}]*)\}/s);
    expect(interfaceMatch).not.toBeNull();
    const body = interfaceMatch![1];
    expect(body).toMatch(/tenantId:\s*string;/);
    expect(body).not.toMatch(/tenantId\?:/);
    expect(body).toMatch(/caseDebtorId\?:/);
  });
});
