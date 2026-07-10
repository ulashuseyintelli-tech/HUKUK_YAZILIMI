/**
 * VER-05 / CAN-CUT-01 PR-0 — tenant-scoped, deterministic, READ-ONLY inventory.
 *
 * Usage:
 *   pnpm inventory:due-claimitem -- --tenant <tenantId>
 *
 * There is deliberately no --apply, --rollback, --all-tenants, or output-file
 * flag. The only output is deterministic JSON on stdout.
 */
import { PrismaClient } from '@prisma/client';
import {
  runReadOnlyDueClaimItemInventory,
} from '../src/modules/case/inventory/due-claimitem-inventory.core';

export function parseInventoryArgs(argv: string[]): { tenantId: string } {
  if (argv.includes('--apply') || argv.includes('--rollback') || argv.includes('--all-tenants')) {
    throw new Error('Bu inventory yalnız READ-ONLY çalışır; apply/rollback/all-tenants desteklenmez.');
  }
  const tenantIndex = argv.indexOf('--tenant');
  if (tenantIndex < 0 || !argv[tenantIndex + 1]?.trim()) {
    throw new Error('--tenant <tenantId> zorunludur.');
  }
  if (argv.length !== 2 || tenantIndex !== 0) {
    throw new Error('Yalnız "--tenant <tenantId>" argümanı desteklenir.');
  }
  return { tenantId: argv[tenantIndex + 1].trim() };
}

async function main() {
  const { tenantId } = parseInventoryArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const report = await runReadOnlyDueClaimItemInventory(prisma, tenantId);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('ERR', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
