/**
 * PR-EA-3A — statik saflık guard'ı: classifier + profiler kaynak dosyalarında hiçbir Prisma
 * mutation çağrısı veya yazma bayrağı (--confirm/--apply/--write/--execute/--commit) OLMADIĞINI
 * kalıcı olarak kilitler. Bu iki dosya salt-okuma tasarımı gereği hiçbir zaman yazma yolu
 * içermeyecektir (owner talimatı D1/D2) — GEVŞETİLMEZ (W0.1/PR-2A/PR-2B emsali).
 */
import * as fs from "fs";
import * as path from "path";

const CLASSIFIER_PATH = path.join(__dirname, "..", "enforcement-action-backfill-classifier.ts");
const PROFILER_PATH = path.join(__dirname, "..", "enforcement-action-backfill-profiler.ts");

const MUTATION_PATTERNS: RegExp[] = [
  /\.create\(/,
  /\.createMany\(/,
  /\.update\(/,
  /\.updateMany\(/,
  /\.upsert\(/,
  /\.delete\(/,
  /\.deleteMany\(/,
  /\$executeRaw/,
];

const WRITE_FLAG_PATTERNS: RegExp[] = [
  /--confirm/,
  /--apply/,
  /--write/,
  /--execute/,
  /--commit/,
];

describe("PR-EA-3A statik saflık guard'ı", () => {
  const classifierSource = fs.readFileSync(CLASSIFIER_PATH, "utf8");
  const profilerSource = fs.readFileSync(PROFILER_PATH, "utf8");

  it("classifier hiçbir Prisma mutation çağrısı içermez", () => {
    for (const pattern of MUTATION_PATTERNS) {
      expect(classifierSource).not.toMatch(pattern);
    }
  });

  it("profiler hiçbir Prisma mutation çağrısı içermez", () => {
    for (const pattern of MUTATION_PATTERNS) {
      expect(profilerSource).not.toMatch(pattern);
    }
  });

  it("profiler hiçbir yazma bayrağı (--confirm/--apply/--write/--execute/--commit) tanımlamaz", () => {
    for (const pattern of WRITE_FLAG_PATTERNS) {
      expect(profilerSource).not.toMatch(pattern);
    }
  });

  it("classifier Prisma veya NestJS import etmez (saf, DB'siz çekirdek)", () => {
    expect(classifierSource).not.toMatch(/@prisma\/client/);
    expect(classifierSource).not.toMatch(/@nestjs/);
  });

  it("classifier sistem saati veya dosya sistemi kullanmaz", () => {
    expect(classifierSource).not.toMatch(/Date\.now\(\)/);
    expect(classifierSource).not.toMatch(/new Date\(\)/);
    expect(classifierSource).not.toMatch(/from ["']fs["']/);
  });
});
