/**
 * MPB-028(a) PR-3C — statik saflık guard'ı.
 *
 * Owner Decision: "CaseType, subType, ExecutionPath üzerinden gizli fallback kurma." Bu
 * test, ProceedingClassificationService ve LegalPeriodCalculationService kaynak dosyalarının
 * bu alanlara GERÇEK ERİŞİM (property access / obje-key) yapmadığını, ya da mevcut ölü-kod
 * modüllerindeki 'ILAMSIZ'/'ILAMLI'/'KAMBIYO_CEK' gibi string-karşılaştırma desenini hiç
 * TEKRARLAMADIĞINI doğrular — regresyon önleyici, davranışsal değil statik bir kilit.
 *
 * Not: desenler bilinçli olarak property-access/obje-key seviyesinde (`.subType`,
 * `subType:`) tanımlanmıştır, salt kelime araması DEĞİLDİR — dosyalardaki kendi
 * `subTypeCode` alanımız veya açıklayıcı yorum/log metinleri ("CaseType/subType/...
 * üzerinden fallback kurmaz" gibi) bu deseni YANLIŞLIKLA tetiklememelidir.
 */
import * as fs from "fs";
import * as path from "path";

const FORBIDDEN_PATTERNS: RegExp[] = [
  /\.caseType\b/,
  /\bcaseType\s*:/,
  /\.subType\b/,
  /\bsubType\s*:/,
  /\.subCategory\b/,
  /\bsubCategory\s*:/,
  /\.executionPath\b/,
  /\bexecutionPath\s*:/,
  /'ILAMSIZ'/,
  /'ILAMLI'/,
  /'KAMBIYO/,
];

const GUARDED_FILES = [
  "../proceeding-classification.service.ts",
  "../legal-period-calculation.service.ts",
  "../legal-period-rule-matrix.ts",
];

describe("PR-3C static purity — CaseType/subType/executionPath fallback yasağı", () => {
  it.each(GUARDED_FILES)("%s hiçbir yasaklı alan/legacy string desenini içermez", (relativePath) => {
    const fullPath = path.join(__dirname, relativePath);
    const source = fs.readFileSync(fullPath, "utf-8");

    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }
  });
});
