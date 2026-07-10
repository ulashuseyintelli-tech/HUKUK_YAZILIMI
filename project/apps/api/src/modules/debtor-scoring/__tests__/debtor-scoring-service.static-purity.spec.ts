import { readFileSync } from "fs";
import { join } from "path";

/**
 * DEBTOR-SCORING PR-2C — orkestrasyon-düzeyi statik guard (PR-2A/PR-2B saflık
 * guard'larının orkestrasyon varyantı). `@nestjs/common` (`@Injectable`) izinli
 * — ama icrabot/F3, NotificationQueue, manuel riskLevel/LookupRisk ve sistem
 * saati okuması kalıcı olarak YASAK; `asOf` her zaman parametre olarak kalır.
 */
describe("debtor-scoring.service.ts — orkestrasyon saflık guard'ı (PR-2C)", () => {
  const filePath = join(__dirname, "..", "debtor-scoring.service.ts");

  const FORBIDDEN: Array<{ name: string; pattern: RegExp }> = [
    { name: "icrabot/risk-scoring (F3) import", pattern: /icrabot|risk-scoring\.config/ },
    { name: "NotificationQueue referansı", pattern: /NotificationQueue|notificationQueue/ },
    { name: "manuel riskLevel/LookupRisk referansı", pattern: /riskLevel|LookupRisk/ },
    { name: "Date.now()", pattern: /Date\.now\s*\(/ },
    { name: "argümansız new Date()", pattern: /new Date\(\s*\)/ },
    { name: "process.env erişimi", pattern: /process\.env/ },
    { name: "doğrudan Prisma import (yalnız adaptörler Prisma kullanır)", pattern: /@prisma\/client|PrismaService/ },
  ];

  it("yasaklı desen içermez", () => {
    const content = readFileSync(filePath, "utf8");
    for (const rule of FORBIDDEN) {
      expect({ rule: rule.name, found: rule.pattern.test(content) }).toEqual({
        rule: rule.name,
        found: false,
      });
    }
  });
});
