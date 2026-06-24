import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(testDir, "..");
const passiveRequestPattern = /includePassive\s*:\s*true|\?includePassive=true/;

function toRepoPath(filePath: string) {
  return path.relative(srcDir, filePath).replace(/\\/g, "/");
}

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(srcDir, relativePath), "utf8");
}

function collectSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") return [];
      return collectSourceFiles(fullPath);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe("PR-R1 includePassive confinement", () => {
  // CI-1 (reliability): Bu, app/ + components/ altındaki tüm .ts/.tsx (~313 dosya / ~4.4MB)
  // içeriğini tarayan bir guard testidir. Tarama algoritmik olarak HIZLI (izolede ~400ms);
  // darboğaz değil. Sorun yalnız TIMEOUT HEADROOM: yüklü makinede (paralel vitest worker'ları +
  // disk/CPU contention) worker descheduled olup senkron tarama default 5000ms'i aşabiliyor
  // (gözlenen: yük altında ~14.6s; CI temiz runner'da sorunsuz geçer = ürün bug'ı değil).
  // Fix: kapsamı daraltmadan (guard'ı zayıflatmadan) ölçüme dayalı açık timeout = 20000ms,
  // gözlenen worst-case'in (~14.6s) güvenli üstü ve SINIRLI (test bounded; hang edemez).
  it("allows includePassive=true only on case detail/history surfaces", () => {
    const files = [
      ...collectSourceFiles(path.join(srcDir, "app")),
      ...collectSourceFiles(path.join(srcDir, "components")),
    ];

    const includePassiveCallers = files
      .filter((filePath) => passiveRequestPattern.test(readSource(toRepoPath(filePath))))
      .map(toRepoPath)
      .sort();

    expect(includePassiveCallers).toEqual([
      "app/(dashboard)/cases/[id]/page-v2.tsx",
      "app/(dashboard)/cases/[id]/page.tsx",
      "app/(dashboard)/cases/[id]/v2/page.tsx",
    ]);
  }, 20000);

  it("keeps intake promote debtor lookup ACTIVE-only", () => {
    const source = readSource("app/(dashboard)/client-intake/[id]/promote/page.tsx");

    expect(source).toContain("api.getCaseDebtors(d.caseId)");
    expect(source).not.toMatch(/includePassive\s*:/);
    expect(source).not.toContain("?includePassive=true");
  });

  it("keeps selector/search flows from requesting passive case debtors", () => {
    const selectorSearchFiles = [
      "app/(dashboard)/cases/new/page.tsx",
      "app/(dashboard)/debtors/page.tsx",
      "components/debtor/DebtorStep.tsx",
      "components/debtor/SelectedDebtorCard.tsx",
    ];

    for (const relativePath of selectorSearchFiles) {
      const source = readSource(relativePath);

      expect(source, relativePath).not.toMatch(passiveRequestPattern);
    }
  });
});
