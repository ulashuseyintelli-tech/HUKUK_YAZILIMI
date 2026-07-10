import { readFileSync } from "fs";
import { join } from "path";

/**
 * DEBTOR-SCORING PR-2A — kalıcı saflık guard'ı (ADR-014 W0.1 emsali).
 *
 * Motor ve kontrat dosyaları persistence/IO/saat-bağımsız kalmak ZORUNDADIR:
 * - Prisma/Nest/dış servis import'u yasak (F3/icrabot dahil — ters polarite sızamaz)
 * - Date.now() / argümansız new Date() yasak (determinizm: zaman input.asOf'tan gelir)
 * - process.env erişimi yasak
 * - Yalnız './debtor-scoring.types' gibi modül-içi göreli import'lara izin verilir
 */
describe("debtor-scoring — statik saflık guard'ı (PR-2A)", () => {
  const moduleDir = join(__dirname, "..");
  const files = ["debtor-scoring.types.ts", "scoring-engine.ts"];

  const FORBIDDEN: Array<{ name: string; pattern: RegExp }> = [
    { name: "@prisma/client import", pattern: /@prisma\/client/ },
    { name: "PrismaService referansı", pattern: /PrismaService|prisma\./ },
    { name: "@nestjs import", pattern: /@nestjs\// },
    { name: "icrabot/risk-scoring (F3) import", pattern: /icrabot|risk-scoring\.config/ },
    { name: "NotificationQueue referansı", pattern: /NotificationQueue|notificationQueue/ },
    { name: "manuel riskLevel/LookupRisk referansı", pattern: /riskLevel|LookupRisk/ },
    { name: "Date.now()", pattern: /Date\.now\s*\(/ },
    { name: "argümansız new Date()", pattern: /new Date\(\s*\)/ },
    { name: "process.env erişimi", pattern: /process\.env/ },
    { name: "fs/http/axios IO import'u", pattern: /from ["'](fs|node:fs|http|https|axios)/ },
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

  it.each(files)("%s yalnız modül-içi göreli import kullanır", (file) => {
    const content = readFileSync(join(moduleDir, file), "utf8");
    const imports = [...content.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const spec of imports) {
      expect({ file, importSpec: spec, isRelativeLocal: spec.startsWith("./") }).toEqual({
        file,
        importSpec: spec,
        isRelativeLocal: true,
      });
    }
  });
});
