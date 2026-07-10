import { readFileSync } from "fs";
import { join } from "path";

/**
 * DEBTOR-SCORING PR-2B — adaptör-düzeyi statik guard (PR-2A saflık guard'ının
 * adaptör varyantı). Adaptörler Prisma/@nestjs KULLANIR (bu ikisi yasaklı
 * DEĞİL) — ama F3/icrabot, NotificationQueue, manuel riskLevel/LookupRisk ve
 * sistem-saati okuması motordaki gibi kalıcı olarak YASAKTIR (asOf her zaman
 * parametre; adaptörler de Date.now()/new Date() KULLANMAZ, determinizm
 * disiplini uçtan uca korunur).
 */
describe("debtor-scoring/inputs — adaptör saflık guard'ı (PR-2B)", () => {
  const moduleDir = join(__dirname, "..");
  const files = ["financial-input.adapter.ts", "case-signal-input.adapter.ts"];

  const FORBIDDEN: Array<{ name: string; pattern: RegExp }> = [
    { name: "icrabot/risk-scoring (F3) import", pattern: /icrabot|risk-scoring\.config/ },
    { name: "NotificationQueue referansı", pattern: /NotificationQueue|notificationQueue/ },
    { name: "manuel riskLevel/LookupRisk referansı", pattern: /riskLevel|LookupRisk/ },
    { name: "Date.now()", pattern: /Date\.now\s*\(/ },
    { name: "argümansız new Date()", pattern: /new Date\(\s*\)/ },
    { name: "process.env erişimi", pattern: /process\.env/ },
  ];

  it.each(files)("%s yasaklı desen içermez", (file) => {
    const content = readFileSync(join(moduleDir, file), "utf8");
    for (const rule of FORBIDDEN) {
      expect({ file, rule: rule.name, found: rule.pattern.test(content) }).toEqual({
        file,
        rule: rule.name,
        found: false,
      });
    }
  });
});
