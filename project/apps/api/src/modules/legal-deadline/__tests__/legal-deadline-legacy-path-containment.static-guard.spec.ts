/**
 * DEBTOR-LEGAL-DEADLINE-LEGACY-PATH-DISPOSITION-P1-I07 (eski roadmap TASK 06)
 *
 * Legacy snapshot yazıcısı `LegalDeadlineService.calculateDeadline` ile kanonik
 * successor `ServiceOccurrenceDeadlineCalculationService.calculateForOccurrence`
 * arasındaki sınırı KİLİTLER.
 *
 * Bu guard SALT STRING ARAMASI DEĞİLDİR: repo'daki her `.ts` dosyası için
 *   (import yüzeyi) × (çağrı yüzeyi) × (dosya sınıfı: üretim / test / tooling)
 * korelasyonundan bir CALLER ENVANTERİ kurar ve envanteri exact beklentiyle
 * karşılaştırır. Yeni bir üretim çağıranı eklemek, successor delegasyonunu
 * kaldırmak, allowlist'i şişirmek veya deprecated sınırını silmek testi KIRMIZIYA
 * çevirir.
 *
 * Bu görevde hukuki süre semantiği DEĞİŞTİRİLMEDİ — her iki yol da tarih kararını
 * aynı çekirdeğe (`resolveLegalServiceDate`) delege eder; guard bunu da doğrular.
 */

import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";

const SRC_ROOT = path.resolve(__dirname, "..", "..", "..");
const LEGACY_SERVICE_REL = "modules/legal-deadline/legal-deadline.service.ts";
const LEGACY_METHOD = "calculateDeadline";

/**
 * Legacy metodun ÜRETİM çağıranı olmasına izin verilen dosyalar (src-göreli).
 * Bugün BOŞ olmalıdır. Buraya bir dosya eklenirse:
 *   - dosya gerçekten legacy çağrı içermiyorsa "stale allowlist" testi kırmızı olur,
 *   - içeriyorsa bu, owner kararı gerektiren bilinçli bir kapsam genişlemesidir.
 */
const PRODUCTION_CALLER_ALLOWLIST: string[] = [];

/**
 * Legacy metodun davranışını doğrulayan, KORUNMASI amaçlanan test dosyaları
 * (src-göreli). Bunlar üretim çağıranı DEĞİLDİR; legacy yolun sözleşmesi
 * silinmediği için testleri de silinmemiştir.
 */
const EXPECTED_TEST_CALLERS = [
  "modules/legal-deadline/__tests__/legal-deadline.db-gated.integration.spec.ts",
  "modules/legal-deadline/__tests__/legal-deadline.service.spec.ts",
];

type FileClass = "production" | "test" | "self";

interface CallerRecord {
  rel: string;
  cls: FileClass;
  importsLegacyService: boolean;
  callSiteCount: number;
}

function listTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      listTsFiles(full, acc);
    } else if (entry.name.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

function classify(rel: string): FileClass {
  if (rel === LEGACY_SERVICE_REL) return "self";
  if (/(^|\/)__tests__\//.test(rel) || /\.spec\.ts$/.test(rel)) return "test";
  return "production";
}

/**
 * Yorum ve blok yorumlarını çıkarır — JSDoc içindeki `calculateDeadline` atıfları
 * (bu dosyanın kendisindeki @deprecated notu dahil) ÇAĞRI SAYILMAZ.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");
}

function buildInventory(): CallerRecord[] {
  const records: CallerRecord[] = [];
  for (const full of listTsFiles(SRC_ROOT)) {
    const rel = path.relative(SRC_ROOT, full).split(path.sep).join("/");
    const raw = fs.readFileSync(full, "utf8");
    const code = stripComments(raw);

    // Çağrı yüzeyi: `<expr>.calculateDeadline(` — `calculateDeadlineStatus` gibi
    // isim-benzeri metotlar `\(` sınırı sayesinde eşleşmez.
    const callSites = code.match(new RegExp(`\\.${LEGACY_METHOD}\\s*\\(`, "g")) ?? [];
    // Import yüzeyi: legacy servis tipini/sınıfını gerçekten getiren dosyalar.
    const importsLegacyService =
      /from\s+["'][^"']*legal-deadline\.service["']/.test(code) ||
      /require\(\s*["'][^"']*legal-deadline\.service["']\s*\)/.test(code);

    if (callSites.length > 0 || importsLegacyService) {
      records.push({
        rel,
        cls: classify(rel),
        importsLegacyService,
        callSiteCount: callSites.length,
      });
    }
  }
  return records;
}

const INVENTORY = buildInventory();
const CALLERS = INVENTORY.filter((r) => r.callSiteCount > 0);

describe("I07 · legacy deadline yolu — caller envanteri", () => {
  it("envanter boş değil (tarayıcı gerçekten dosya okuyor)", () => {
    // Guard'ın kendisinin sessizce boşa düşmesini engeller.
    expect(INVENTORY.length).toBeGreaterThan(2);
    expect(CALLERS.length).toBeGreaterThan(0);
  });

  it("ÜRETİM çağıranı allowlist ile birebir aynı (bugün: 0)", () => {
    const productionCallers = CALLERS.filter((r) => r.cls === "production")
      .map((r) => r.rel)
      .sort();
    expect(productionCallers).toEqual([...PRODUCTION_CALLER_ALLOWLIST].sort());
  });

  it("allowlist STALE değil (allowlist'teki her dosya gerçekten legacy çağrı içerir)", () => {
    for (const allowed of PRODUCTION_CALLER_ALLOWLIST) {
      const record = CALLERS.find((r) => r.rel === allowed);
      expect(record).toBeDefined();
      expect(record!.callSiteCount).toBeGreaterThan(0);
    }
  });

  it("test-only çağıranlar exact bilinen listedir", () => {
    const testCallers = CALLERS.filter((r) => r.cls === "test")
      .map((r) => r.rel)
      .sort();
    expect(testCallers).toEqual([...EXPECTED_TEST_CALLERS].sort());
  });

  it("legacy servisi enjekte eden üretim dosyaları legacy metodu ÇAĞIRMAZ (yalnız read-only metot)", () => {
    const injectors = INVENTORY.filter(
      (r) => r.cls === "production" && r.importsLegacyService && r.rel !== LEGACY_SERVICE_REL,
    );
    // Bugün: legal-period-calculation + legal-time-shadow (+ modül kaydı).
    expect(injectors.length).toBeGreaterThan(0);
    for (const injector of injectors) {
      expect(injector.callSiteCount).toBe(0);
      const source = fs.readFileSync(path.join(SRC_ROOT, injector.rel), "utf8");
      const code = stripComments(source);
      if (/legalDeadlineService\./.test(code)) {
        // Enjekte edip kullanan üretim dosyası YALNIZ read-only metodu çağırabilir.
        expect(code).toMatch(/legalDeadlineService\.resolveLegalServiceDateForTebligat\(/);
      }
    }
  });
});

describe("I07 · canonical successor bağlantısı", () => {
  const consumerModulePath = "../../tebligat/service-occurrence/service-occurrence-recorded.consumer";
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ServiceOccurrenceRecordedConsumerService } = require(consumerModulePath);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ServiceOccurrenceDeadlineCalculationService } = require("../service-occurrence-deadline-calculation.service");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { LegalDeadlineService } = require("../legal-deadline.service");

  const paramTypes: any[] =
    Reflect.getMetadata("design:paramtypes", ServiceOccurrenceRecordedConsumerService) || [];

  it("üretim consumer'ı successor servisini DI ile alır", () => {
    expect(paramTypes).toContain(ServiceOccurrenceDeadlineCalculationService);
  });

  it("üretim consumer'ı legacy servisi ALMAZ (delegasyon successor'da)", () => {
    expect(paramTypes).not.toContain(LegalDeadlineService);
  });

  it("consumer gerçekten calculateForOccurrence'a delege eder", () => {
    const consumerSrc = fs.readFileSync(
      path.join(SRC_ROOT, "modules/tebligat/service-occurrence/service-occurrence-recorded.consumer.ts"),
      "utf8",
    );
    const code = stripComments(consumerSrc);
    expect(code).toMatch(/\.calculateForOccurrence\(/);
    expect(code).not.toMatch(/\.calculateDeadline\s*\(/);
  });

  it("successor snapshot yazıcısı advisory lock altında yürür (legacy KODUNDA yok)", () => {
    // İddia KOD hakkındadır: legacy dosyanın @deprecated notu successor'ın lock'undan
    // söz eder, bu bir çalıştırma değildir — bu yüzden yorumlar arındırılır.
    const successorCode = stripComments(
      fs.readFileSync(
        path.join(SRC_ROOT, "modules/legal-deadline/service-occurrence-deadline-calculation.service.ts"),
        "utf8",
      ),
    );
    expect(successorCode).toMatch(/pg_advisory_xact_lock/);
    const legacyCode = stripComments(fs.readFileSync(path.join(SRC_ROOT, LEGACY_SERVICE_REL), "utf8"));
    expect(legacyCode).not.toMatch(/pg_advisory_xact_lock/);
  });
});

describe("I07 · deprecated sınırı ve semantik ortaklığı", () => {
  const legacySrc = fs.readFileSync(path.join(SRC_ROOT, LEGACY_SERVICE_REL), "utf8");

  it("legacy metot @deprecated ve canonical successor işaretini taşır", () => {
    expect(legacySrc).toMatch(/@deprecated/);
    expect(legacySrc).toMatch(/CANONICAL SUCCESSOR/);
    expect(legacySrc).toMatch(/calculateForOccurrence/);
    // İşaret metodun KENDİ JSDoc'unda olmalı (dosyanın herhangi bir yerinde değil).
    const methodIndex = legacySrc.indexOf(`async ${LEGACY_METHOD}(`);
    expect(methodIndex).toBeGreaterThan(0);
    const docBlockStart = legacySrc.lastIndexOf("/**", methodIndex);
    expect(legacySrc.slice(docBlockStart, methodIndex)).toMatch(/@deprecated/);
  });

  it("her iki yol da hukuki tarih kararını AYNI çekirdeğe delege eder (semantik değişmedi)", () => {
    expect(legacySrc).toMatch(/from "\.\/legal-service-date-rule-core"/);
    expect(legacySrc).toMatch(/resolveLegalServiceDate\(/);
    const occurrenceRuleSrc = fs.readFileSync(
      path.join(SRC_ROOT, "modules/legal-deadline/service-occurrence-deadline-rule.ts"),
      "utf8",
    );
    expect(occurrenceRuleSrc).toMatch(/from "\.\/legal-service-date-rule-core"/);
    expect(occurrenceRuleSrc).toMatch(/resolveLegalServiceDate\(/);
  });

  it("legacy metot hâlâ mevcut ve davranış spec'i tarafından çağrılabilir (gereksiz silme yok)", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { LegalDeadlineService } = require("../legal-deadline.service");
    expect(typeof LegalDeadlineService.prototype.calculateDeadline).toBe("function");
    expect(typeof LegalDeadlineService.prototype.resolveLegalServiceDateForTebligat).toBe(
      "function",
    );
  });
});
