/**
 * PR-A4-0 — tenant-scoped, deterministic, READ-ONLY readiness inventory.
 *
 * Usage:
 *   pnpm inventory:rich-interest-uyap -- --tenant <tenantId> --mode summary
 *   pnpm inventory:rich-interest-uyap -- --tenant <tenantId> --mode detailed
 *
 * Detailed mode streams one sanitized finding per NDJSON line, followed by the
 * deterministic summary. There is deliberately no apply or file-output mode.
 */
import { PrismaClient } from '@prisma/client';
import {
  formatDetailedFinding,
  formatInventorySummary,
  parseRichInterestInventoryArgs,
} from '../src/modules/case/inventory/rich-interest-uyap-readiness.cli';
import {
  runReadOnlyRichInterestUyapInventory,
} from '../src/modules/case/inventory/rich-interest-uyap-readiness.core';

async function main() {
  const options = parseRichInterestInventoryArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const summary = await runReadOnlyRichInterestUyapInventory(prisma, {
      tenantId: options.tenantId,
      pageSize: options.pageSize,
      onFinding: options.mode === 'detailed'
        ? (finding) => process.stdout.write(`${formatDetailedFinding(finding)}\n`)
        : undefined,
    });
    process.stdout.write(`${formatInventorySummary(summary)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('ERR', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
