/**
 * G6 Backfill — DRY-RUN (PR-1). SALT-OKUMA. Hiçbir yazma yolu YOKTUR (--apply BİLE YOK).
 * Tasarım: project/docs/g6-backfill-script-design.md.
 *
 * Ne yapar: legacy (gerçek-kişi owner'sız) dosyaları per-tenant tarar, G6 kuralıyla bucket'lar
 * (R1/R2/R3/R4/AMBIGUOUS), founder resolve eder, her case için karar+sebep raporlar, özet/%dağılım
 * üretir, pre-image snapshot'ı JSON + CSV olarak yazar. DB'ye DOKUNMAZ (yalnız SELECT).
 *
 * NestJS-context: PrismaModule (@Global) üzerinden PrismaService DI ile alınır (apply fazına hazır
 * temel). Karar mantığı saf çekirdekte (g6-backfill-classifier.ts) → tek-kaynak, test edilebilir.
 *
 * Apply (R1/R2 önce, sonra R3/R4) = AYRI PR (PR-2), AYRI onay. Bu dosyada YOK.
 *
 * Kullanım (project/apps/api altından):
 *   npx --yes tsx src/scripts/g6-backfill-dry-run.ts --all-tenants
 *   npx --yes tsx src/scripts/g6-backfill-dry-run.ts --tenant <tenantId>
 *   npx --yes tsx src/scripts/g6-backfill-dry-run.ts --all-tenants --out ./backups/custom
 *
 * NOT: dev DB legacy verisi TEMSİL ETMEZ (forensic); gerçek %dağılım PROD dry-run'da çıkar.
 * Bu script READ-ONLY olduğundan her ortamda güvenle koşar; yalnızca rapor üretir.
 *
 * Çağrıldığı yerler: ELLE çalıştırılan operasyonel script (CI/otomatik deploy DEĞİL).
 */

import { NestFactory } from "@nestjs/core";
import * as fs from "fs";
import * as path from "path";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { classifyG6, G6Bucket, G6Action } from "./g6-backfill-classifier";

interface ReportRow {
  tenantId: string;
  caseId: string;
  fileNumber: string | null;
  activeLawyers: number;
  responsibleLawyers: number;
  bucket: G6Bucket;
  chosenOwnerLawyerId: string | null;
  action: G6Action;
  reason: string;
}

function parseArgs(argv: string[]) {
  const has = (f: string) => argv.includes(f);
  const val = (f: string) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return { tenant: val("--tenant"), allTenants: has("--all-tenants"), out: val("--out") };
}

/** founder zinciri: escalationFounder → manager → teamLead; ilk AKTİF lawyer (tenant-scoped). */
async function resolveFounder(prisma: PrismaService, tenantId: string): Promise<string | null> {
  const office = await prisma.office.findFirst({
    where: { tenantId },
    select: {
      escalationFounderLawyerIds: true,
      escalationManagerLawyerIds: true,
      escalationTeamLeadLawyerIds: true,
    },
  });
  if (!office) return null;
  const chain = [
    ...office.escalationFounderLawyerIds,
    ...office.escalationManagerLawyerIds,
    ...office.escalationTeamLeadLawyerIds,
  ];
  if (chain.length === 0) return null;
  const active = await prisma.lawyer.findMany({
    where: { id: { in: chain }, tenantId, isActive: true },
    select: { id: true },
  });
  const activeSet = new Set(active.map((l) => l.id));
  return chain.find((id) => activeSet.has(id)) ?? null;
}

function writeSnapshot(rows: ReportRow[], summary: unknown, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "report.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), summary, rows }, null, 2),
    "utf8",
  );
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["tenantId", "caseId", "fileNumber", "activeLawyers", "responsibleLawyers", "bucket", "chosenOwnerLawyerId", "action", "reason"];
  const csv = [
    header.join(","),
    ...rows.map((r) => [r.tenantId, r.caseId, r.fileNumber, r.activeLawyers, r.responsibleLawyers, r.bucket, r.chosenOwnerLawyerId, r.action, r.reason].map(esc).join(",")),
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "report.csv"), csv, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tenant && !args.allTenants) {
    console.error("Kullanım: g6-backfill-dry-run.ts (--tenant <id> | --all-tenants) [--out <dir>]");
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(PrismaModule, { logger: ["error", "warn"] });
  const prisma = app.get(PrismaService);
  try {
    // Hedef tenant'lar (legacy = both real-FK null)
    const tenantIds = args.tenant
      ? [args.tenant]
      : (
          await prisma.case.findMany({
            where: { responsibleLawyerId: null, responsibleStaffId: null },
            distinct: ["tenantId"],
            select: { tenantId: true },
          })
        ).map((t) => t.tenantId);

    const rows: ReportRow[] = [];
    for (const tenantId of tenantIds) {
      const founderLawyerId = await resolveFounder(prisma, tenantId);
      const legacy = await prisma.case.findMany({
        where: { tenantId, responsibleLawyerId: null, responsibleStaffId: null },
        select: {
          id: true,
          fileNumber: true,
          lawyers: { select: { lawyerId: true, isResponsible: true, lawyer: { select: { isActive: true } } } },
        },
      });
      for (const c of legacy) {
        const active = c.lawyers.filter((l) => l.lawyer?.isActive);
        const activeLawyerIds = active.map((l) => l.lawyerId);
        const responsibleLawyerIds = active.filter((l) => l.isResponsible).map((l) => l.lawyerId);
        const d = classifyG6({ activeLawyerIds, responsibleLawyerIds, founderLawyerId });
        rows.push({
          tenantId,
          caseId: c.id,
          fileNumber: c.fileNumber,
          activeLawyers: activeLawyerIds.length,
          responsibleLawyers: responsibleLawyerIds.length,
          bucket: d.bucket,
          chosenOwnerLawyerId: d.chosenOwnerLawyerId,
          action: d.action,
          reason: d.reason,
        });
      }
    }

    // Özet
    const total = rows.length;
    const byBucket: Record<string, number> = { R1: 0, R2: 0, R3: 0, R4: 0, AMBIGUOUS: 0 };
    let wouldAssign = 0;
    let manualQueue = 0;
    for (const r of rows) {
      byBucket[r.bucket]++;
      if (r.action === "WOULD_ASSIGN") wouldAssign++;
      else manualQueue++;
    }
    const pct = (n: number) => (total ? ((n / total) * 100).toFixed(1) : "0.0");
    const summary = {
      tenants: tenantIds.length,
      totalLegacyCases: total,
      buckets: byBucket,
      actions: { WOULD_ASSIGN: wouldAssign, MANUAL_QUEUE: manualQueue },
    };

    console.log("=== G6 BACKFILL — DRY-RUN (READ-ONLY) ===");
    console.log(`Tenant: ${tenantIds.length} · Legacy dosya: ${total}`);
    console.log("Bucket dağılımı:");
    for (const b of ["R1", "R2", "R3", "R4", "AMBIGUOUS"] as const) {
      console.log(`  ${b.padEnd(10)} : ${String(byBucket[b]).padStart(6)}  (%${pct(byBucket[b])})`);
    }
    console.log(`Aksiyon: WOULD_ASSIGN=${wouldAssign} (%${pct(wouldAssign)}) · MANUAL_QUEUE=${manualQueue} (%${pct(manualQueue)})`);
    console.log("NOT: bu bir DRY-RUN'dır; hiçbir dosya güncellenmedi (script salt-okuma).");

    const outDir = args.out ?? path.join("backups", `g6-backfill-dry-run-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    writeSnapshot(rows, summary, outDir);
    console.log(`Snapshot yazıldı: ${outDir}/ (report.json + report.csv)`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error("G6 dry-run HATA:", e);
  process.exit(1);
});
