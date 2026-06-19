/**
 * ASSIGN-4b drift onarımı — mevcut "tam 1 sorumlu avukat" ihlallerini düzeltir — İNCE KABUK.
 *
 * ASSIGN-4b invariant'ı yalnız İLERİ-DÖNÜK uygular (case.service.ts create/update/add/remove);
 * 4b ÖNCESİ açılmış dosyalarda 0 veya >1 sorumlu (drift) kalmış olabilir. client-info-request
 * `where:{isResponsible:true} take:1` bunlarda KEYFİ seçim yapar. Bu script drift'i create()'in
 * döngü-sonrası dedupe'iyle BİREBİR aynı kararla onarır (REUSE: case-responsible.helpers).
 *
 * Karar/orkestrasyon TEST EDİLEBİLİR çekirdektedir (bu dosya yalnız PrismaClient'i bağlar):
 *   src/modules/case/case-responsible-drift.core.ts  (saf karar: planCaseDriftFix)
 *     └─ src/modules/case/case-responsible.helpers.ts (ASSIGN-4b helper'ları, REUSE)
 *
 * VARSAYILAN = DRY-RUN (hiçbir yazma yapmaz). Yazma için --apply + scope kilidi ZORUNLU.
 *
 * ⚠️ Bu script, CaseLawyer partial-unique-index migration'ının ÖN KOŞULUDUR: drift varken
 *    `CREATE UNIQUE INDEX ... (caseId) WHERE "isResponsible"` FAIL eder. Index'ten ÖNCE koşulmalı.
 *
 * Kullanım (project/apps/api altından; backfill:due-claimitem ile aynı sözleşme):
 *   # Dry-run (tek tenant):
 *   npm run repair:responsible-drift -- --tenant <id>
 *   # Dry-run (tüm tenantlar — yazma yok, güvenli, migration öncesi tam resim):
 *   npm run repair:responsible-drift -- --all-tenants
 *   # APPLY (tek tenant):
 *   npm run repair:responsible-drift -- --apply --tenant <id>
 *   # APPLY (tüm tenantlar — global yazım kilidi):
 *   npm run repair:responsible-drift -- --apply --all-tenants --confirm-prod-backfill
 *   # Raporu dosyaya da yaz: --out rapor.json
 *
 * Çağrıldığı yerler:
 * - ELLE çalıştırılan operasyonel script (CI/otomatik deploy DEĞİL).
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import { parseDriftRepairArgs, runDriftRepair } from "../src/modules/case/case-responsible-drift.core";

const prisma = new PrismaClient();

function log(line: string) {
  // eslint-disable-next-line no-console
  console.log(line);
}

async function main() {
  const opts = parseDriftRepairArgs(process.argv.slice(2));
  const report = await runDriftRepair(prisma as never, opts, { log });

  const json = JSON.stringify(report, null, 2);
  log(json);
  if (opts.out) {
    fs.writeFileSync(opts.out, json, "utf-8");
    log(`# rapor yazıldı: ${opts.out}`);
  }

  log(
    `# ${report.mode} scope=${report.scope} scanned=${report.scannedCases} ` +
      `drift=${report.driftCases} (zero=${report.zeroResponsibleCases} multi=${report.multiResponsibleCases}) ` +
      `promotes=${report.appliedPromotes}/${report.plannedPromotes} ` +
      `demotes=${report.appliedDemotes}/${report.plannedDemotes}`,
  );
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error("ERR", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
