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
  });

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
