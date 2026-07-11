/**
 * PR-EA-3A — EnforcementAction.tenantId/caseDebtorId backfill: SALT-OKUMA profiler.
 * Tasarım: docs/design/enforcement-action-tenant-case-debtor-migration.md (PR-EA-3A, Bölüm 16).
 *
 * Ne yapar: TÜM EnforcementAction kayıtlarını profilE eder (tenant + caseDebtor + targetDetails
 * gözlemi), saf sınıflandırıcıyı (enforcement-action-backfill-classifier.ts) çağırır, özet + CSV
 * raporları yazar. DB'ye YALNIZ SELECT atar — hiçbir create/update/upsert/delete/executeRaw
 * mutation İÇERMEZ (statik guard: enforcement-action-backfill-profiler.static-purity.spec.ts).
 *
 * Onay/apply/write/execute/commit anlamına gelen HİÇBİR CLI bayrağı yoktur ve tasarım gereği
 * eklenmeyecektir — gerçek backfill APPLY = ayrı, owner-GO'lu bir sonraki task (PR-EA-3B).
 *
 * DB-okuma + sınıflandırma + toplama mantığı test edilebilir olsun diye ayrı bir fonksiyonda
 * (computeEnforcementActionBackfillProfile) tutulur; main() yalnız bunu çağırıp konsol/dosya
 * çıktısı üretir (mimari ilke: saf sınıflandırıcı ile DB erişimi ayrı, profiler'ın kendi DB-okuma
 * katmanı da CLI/IO katmanından ayrı).
 *
 * Kullanım (project/apps/api altından):
 *   npx tsx src/scripts/enforcement-action-backfill-profiler.ts [--out <dir>]
 *
 * Bu PR'ın merge edilmesi production DB'ye karşı otomatik çalıştırma yetkisi vermez; gerçek/prod-
 * benzeri ortamda çalıştırma ayrı owner execution authorization gerektirir.
 *
 * Çağrıldığı yerler: ELLE çalıştırılan operasyonel script (CI/otomatik deploy DEĞİL).
 */

import { NestFactory } from "@nestjs/core";
import * as fs from "fs";
import * as path from "path";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import {
  classifyEnforcementAction,
  observeTargetDetails,
  CaseDebtorLifecycleSignal,
  TenantBucket,
  CaseDebtorBucket,
  TargetDetailsObservation,
} from "./enforcement-action-backfill-classifier";

export const SAMPLE_LIMIT = 20;

export interface RecordRow {
  id: string;
  caseId: string;
  tenantBucket: TenantBucket;
  tenantReason: string;
  candidateTenantId: string | null;
  caseDebtorBucket: CaseDebtorBucket;
  caseDebtorReason: string;
  candidateCaseDebtorId: string | null;
  targetDetailsObservation: TargetDetailsObservation;
}

export interface BucketStat {
  count: number;
  percentage: string;
  sampleIds: string[];
}

export interface EnforcementActionBackfillSummary {
  totalEnforcementActions: number;
  tenantId: Record<TenantBucket, BucketStat>;
  caseDebtorId: Record<CaseDebtorBucket, BucketStat>;
  targetDetails: Record<TargetDetailsObservation, BucketStat>;
}

export interface EnforcementActionBackfillProfile {
  records: RecordRow[];
  summary: EnforcementActionBackfillSummary;
}

/** Bir ondalık basamaklı yüzde string'i üretir. toFixed() kasıtlı olarak KULLANILMAZ (repo eslint
 *  kuralı: no-restricted-syntax, "parasal yuvarlama için Money.round() kullanın"); bu bir para
 *  değeri değil, saf bir dağılım yüzdesidir — kural yine de sözdizimsel olarak tetiklendiğinden
 *  toFixed() hiç çağrılmaz. */
function pct(n: number, total: number): string {
  if (!total) return "0.0";
  const tenths = Math.round((n / total) * 1000);
  const whole = Math.floor(tenths / 10);
  const decimal = tenths % 10;
  return `${whole}.${decimal}`;
}

/**
 * DB-okuma + sınıflandırma + toplama — YALNIZ SELECT (findMany). Hiçbir create/update/upsert/
 * delete/executeRaw mutation çağrısı içermez (bkz. dosya başlığındaki statik guard referansı).
 */
export async function computeEnforcementActionBackfillProfile(
  prisma: PrismaService,
): Promise<EnforcementActionBackfillProfile> {
  const actions = await prisma.enforcementAction.findMany({
    select: {
      id: true,
      caseId: true,
      tenantId: true,
      caseDebtorId: true,
      targetDetails: true,
      case: { select: { id: true, tenantId: true } },
    },
  });

  const total = actions.length;

  const caseIds = [...new Set(actions.map((a) => a.caseId))];
  const allCaseDebtorsForCases = caseIds.length
    ? await prisma.caseDebtor.findMany({
        where: { caseId: { in: caseIds } },
        select: { id: true, caseId: true, lifecycleStatus: true, role: true },
      })
    : [];
  const caseDebtorsByCase = new Map<string, CaseDebtorLifecycleSignal[]>();
  for (const cd of allCaseDebtorsForCases) {
    const list = caseDebtorsByCase.get(cd.caseId) ?? [];
    list.push({ id: cd.id, lifecycleStatus: cd.lifecycleStatus, role: cd.role });
    caseDebtorsByCase.set(cd.caseId, list);
  }

  // Referans edilen caseDebtorId'ler AYRI (Case filtresi olmadan) sorgulanır — cross-case/cross-tenant
  // tespiti bu ayrım olmadan yapılamaz (yanlış Case'e ait bir CaseDebtor ilk sorguda görünmeyebilir).
  const referencedIds = [...new Set(actions.filter((a) => a.caseDebtorId).map((a) => a.caseDebtorId as string))];
  const referencedCaseDebtors = referencedIds.length
    ? await prisma.caseDebtor.findMany({ where: { id: { in: referencedIds } }, select: { id: true, caseId: true } })
    : [];
  const referencedCaseDebtorById = new Map(referencedCaseDebtors.map((cd) => [cd.id, cd]));

  const records: RecordRow[] = actions.map((action) => {
    const referencedCaseDebtor = action.caseDebtorId ? referencedCaseDebtorById.get(action.caseDebtorId) ?? null : null;
    const classification = classifyEnforcementAction({
      caseId: action.caseId,
      tenantId: action.tenantId,
      caseDebtorId: action.caseDebtorId,
      parentCase: action.case ? { id: action.case.id, tenantId: action.case.tenantId } : null,
      caseDebtors: caseDebtorsByCase.get(action.caseId) ?? [],
      referencedCaseDebtor: referencedCaseDebtor ? { id: referencedCaseDebtor.id, caseId: referencedCaseDebtor.caseId } : null,
    });
    return {
      id: action.id,
      caseId: action.caseId,
      tenantBucket: classification.tenant.bucket,
      tenantReason: classification.tenant.reason,
      candidateTenantId: classification.tenant.candidateTenantId,
      caseDebtorBucket: classification.caseDebtor.bucket,
      caseDebtorReason: classification.caseDebtor.reason,
      candidateCaseDebtorId: classification.caseDebtor.candidateCaseDebtorId,
      targetDetailsObservation: observeTargetDetails(action.targetDetails),
    };
  });

  const tenantCounts: Record<TenantBucket, number> = {
    ALREADY_POPULATED: 0,
    TENANT_DETERMINISTIC: 0,
    INTEGRITY_FAILURE: 0,
  };
  const caseDebtorCounts: Record<CaseDebtorBucket, number> = {
    ALREADY_POPULATED: 0,
    CASE_DEBTOR_DETERMINISTIC: 0,
    INFERABLE_SINGLE_ACTIVE: 0,
    INFERABLE_SINGLE_PRIMARY: 0,
    AMBIGUOUS: 0,
    ORPHAN: 0,
    INTEGRITY_FAILURE: 0,
  };
  const targetDetailsCounts: Record<TargetDetailsObservation, number> = {
    NULL: 0,
    RECOGNIZED_DEBTOR_IDENTIFIER: 0,
    UNRECOGNIZED_STRUCTURE: 0,
  };
  for (const r of records) {
    tenantCounts[r.tenantBucket]++;
    caseDebtorCounts[r.caseDebtorBucket]++;
    targetDetailsCounts[r.targetDetailsObservation]++;
  }

  const sampleIds = (predicate: (r: RecordRow) => boolean) =>
    records.filter(predicate).slice(0, SAMPLE_LIMIT).map((r) => r.id);

  const tenantId = Object.fromEntries(
    (Object.keys(tenantCounts) as TenantBucket[]).map((bucket) => [
      bucket,
      { count: tenantCounts[bucket], percentage: pct(tenantCounts[bucket], total), sampleIds: sampleIds((r) => r.tenantBucket === bucket) },
    ]),
  ) as Record<TenantBucket, BucketStat>;

  const caseDebtorId = Object.fromEntries(
    (Object.keys(caseDebtorCounts) as CaseDebtorBucket[]).map((bucket) => [
      bucket,
      {
        count: caseDebtorCounts[bucket],
        percentage: pct(caseDebtorCounts[bucket], total),
        sampleIds: sampleIds((r) => r.caseDebtorBucket === bucket),
      },
    ]),
  ) as Record<CaseDebtorBucket, BucketStat>;

  const targetDetails = Object.fromEntries(
    (Object.keys(targetDetailsCounts) as TargetDetailsObservation[]).map((obs) => [
      obs,
      {
        count: targetDetailsCounts[obs],
        percentage: pct(targetDetailsCounts[obs], total),
        sampleIds: sampleIds((r) => r.targetDetailsObservation === obs),
      },
    ]),
  ) as Record<TargetDetailsObservation, BucketStat>;

  return {
    records,
    summary: { totalEnforcementActions: total, tenantId, caseDebtorId, targetDetails },
  };
}

function parseArgs(argv: string[]) {
  const val = (f: string) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return { out: val("--out") };
}

/** DATABASE_URL'den yalnız host+db adını (credential OLMADAN) çıkarır — güvenli konsol banner'ı için. */
function describeTargetDatabase(databaseUrl: string | undefined): string {
  if (!databaseUrl) return "(DATABASE_URL tanımsız)";
  try {
    const parsed = new URL(databaseUrl);
    return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    return "(DATABASE_URL ayrıştırılamadı)";
  }
}

function writeCsv(filePath: string, header: string[], rows: Array<Array<string | number | null>>) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [header.join(","), ...rows.map((r) => r.map(esc).join(","))];
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

const RECORD_HEADER = [
  "id",
  "caseId",
  "tenantBucket",
  "tenantReason",
  "candidateTenantId",
  "caseDebtorBucket",
  "caseDebtorReason",
  "candidateCaseDebtorId",
  "targetDetailsObservation",
];

function toRow(r: RecordRow) {
  return [
    r.id,
    r.caseId,
    r.tenantBucket,
    r.tenantReason,
    r.candidateTenantId,
    r.caseDebtorBucket,
    r.caseDebtorReason,
    r.candidateCaseDebtorId,
    r.targetDetailsObservation,
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log("=== PR-EA-3A EnforcementAction Backfill Profiler — SALT-OKUMA ===");
  console.log(`Hedef DB: ${describeTargetDatabase(process.env.DATABASE_URL)}`);
  console.log(`Ortam (NODE_ENV): ${process.env.NODE_ENV ?? "(tanımsız)"}`);
  console.log("Mod: READ-ONLY (yazma bayrağı yok, yalnız SELECT atılır)\n");

  const app = await NestFactory.createApplicationContext(PrismaModule, { logger: ["error", "warn"] });
  const prisma = app.get(PrismaService);

  try {
    const { records, summary } = await computeEnforcementActionBackfillProfile(prisma);
    const total = summary.totalEnforcementActions;
    if (total === 0) {
      console.log("Hiç EnforcementAction kaydı yok. Rapor boş üretilecek.");
    }

    console.log(`Toplam EnforcementAction: ${total}`);
    console.log("tenantId dağılımı:");
    for (const bucket of Object.keys(summary.tenantId) as TenantBucket[]) {
      const s = summary.tenantId[bucket];
      console.log(`  ${bucket.padEnd(20)} : ${String(s.count).padStart(6)}  (%${s.percentage})`);
    }
    console.log("caseDebtorId dağılımı:");
    for (const bucket of Object.keys(summary.caseDebtorId) as CaseDebtorBucket[]) {
      const s = summary.caseDebtorId[bucket];
      console.log(`  ${bucket.padEnd(26)} : ${String(s.count).padStart(6)}  (%${s.percentage})`);
    }
    console.log("targetDetails gözlemi (sınıflandırmayı ETKİLEMEZ):");
    for (const obs of Object.keys(summary.targetDetails) as TargetDetailsObservation[]) {
      const s = summary.targetDetails[obs];
      console.log(`  ${obs.padEnd(28)} : ${String(s.count).padStart(6)}  (%${s.percentage})`);
    }
    console.log("\nNOT: bu bir SALT-OKUMA raporudur; hiçbir EnforcementAction/CaseDebtor satırı oluşturulmadı/değiştirilmedi.");
    console.log("Gerçek backfill APPLY = ayrı, owner-GO gerektiren sonraki task (PR-EA-3B).");

    const outDir = args.out ?? path.join("backups", `ea-backfill-profile-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify({ generatedAt: new Date().toISOString(), ...summary }, null, 2), "utf8");

    writeCsv(path.join(outDir, "records.csv"), RECORD_HEADER, records.map(toRow));
    writeCsv(
      path.join(outDir, "integrity-failures.csv"),
      RECORD_HEADER,
      records.filter((r) => r.tenantBucket === "INTEGRITY_FAILURE" || r.caseDebtorBucket === "INTEGRITY_FAILURE").map(toRow),
    );
    writeCsv(
      path.join(outDir, "inferable-review.csv"),
      RECORD_HEADER,
      records.filter((r) => r.caseDebtorBucket === "INFERABLE_SINGLE_ACTIVE" || r.caseDebtorBucket === "INFERABLE_SINGLE_PRIMARY").map(toRow),
    );
    writeCsv(
      path.join(outDir, "ambiguous.csv"),
      RECORD_HEADER,
      records.filter((r) => r.caseDebtorBucket === "AMBIGUOUS").map(toRow),
    );
    writeCsv(
      path.join(outDir, "orphans.csv"),
      RECORD_HEADER,
      records.filter((r) => r.caseDebtorBucket === "ORPHAN").map(toRow),
    );

    console.log(
      `\nRapor yazıldı: ${outDir}/ (summary.json + records.csv + integrity-failures.csv + inferable-review.csv + ambiguous.csv + orphans.csv)`,
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error("EnforcementAction backfill profiler HATA:", e);
    process.exit(1);
  });
}
