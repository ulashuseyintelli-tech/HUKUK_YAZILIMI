/**
 * G2 — Due → ClaimItem BACKFILL scripti (kontrollü veri göçü) — İNCE KABUK.
 *
 * Tüm karar/orkestrasyon mantığı test edilebilir çekirdektedir:
 *   src/modules/case/backfill/due-to-claimitem-backfill.core.ts
 * Bu dosya yalnız PrismaClient'i bağlar, raporu basar/yazar.
 *
 * VARSAYILAN = DRY-RUN (hiçbir yazma yapmaz). Yazma için açık bayrak ZORUNLU.
 *
 * Kullanım:
 *   # Dry-run (yazma yok):
 *   npm run backfill:due-claimitem -- --tenant <id>
 *   npm run backfill:due-claimitem -- --all-tenants
 *   # APPLY (tek tenant):
 *   npm run backfill:due-claimitem -- --apply --tenant <id>
 *   # APPLY (tüm tenantlar — prod kilidi):
 *   npm run backfill:due-claimitem -- --apply --all-tenants --confirm-prod-backfill
 *   # Rollback (listele / uygula):
 *   npm run backfill:due-claimitem -- --rollback <runId> [--apply]
 *   # Raporu dosyaya yaz: --out rapor.json
 *
 * Çağrıldığı yerler:
 * - ELLE çalıştırılan operasyonel script (CI/otomatik deploy DEĞİL).
 */
import 'reflect-metadata'; // case.dto class-validator dekoratörleri için (NestJS dışı çalıştırma)
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import {
  parseBackfillArgs,
  runBackfill,
  runRollback,
} from '../src/modules/case/backfill/due-to-claimitem-backfill.core';

const prisma = new PrismaClient();

function log(line: string) {
  // eslint-disable-next-line no-console
  console.log(line);
}

async function main() {
  const opts = parseBackfillArgs(process.argv.slice(2));
  const report = opts.rollbackRunId
    ? await runRollback(prisma as any, opts, { log })
    : await runBackfill(prisma as any, opts, { log });

  const json = JSON.stringify(report, null, 2);
  log(json);
  if (opts.out) {
    fs.writeFileSync(opts.out, json, 'utf-8');
    log(`# rapor yazıldı: ${opts.out}`);
  }
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('ERR', e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
