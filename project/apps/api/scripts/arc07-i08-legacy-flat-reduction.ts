/**
 * ARC-07 I08 — LEGACY-FLAT REDUCTION (C2-I08 E4 guarded-apply script).
 *
 * DRY-RUN (varsayılan):
 *   pnpm exec ts-node scripts/arc07-i08-legacy-flat-reduction.ts
 * APPLY (üç kapı — guarded-apply-script-convention):
 *   pnpm exec ts-node scripts/arc07-i08-legacy-flat-reduction.ts \
 *     --apply --allow-db-write --confirm-i08-reviewed [--tenant <id>]
 *
 * Davranış: plan FAIL-CLOSED ise (YALNIZ_FLAT/FARKLI>0) apply HİÇ BAŞLAMAZ.
 * Apply tenant-bounded ayrı $transaction'larda; her tenant sonrası after-verify.
 * Çıktılar yalnız SAYI/ALAN ADI taşır — ham adres/PII basılmaz; hata mesajlarında
 * connection string redactSecrets ile maskelenir.
 */
import { PrismaClient } from '@prisma/client';
import {
  applyI08ReductionForTenant,
  classifyI08Bucket,
  evaluateI08ApplyGuards,
  I08ClientRow,
  planI08Reduction,
  redactSecrets,
} from '../src/modules/client/arc07-i08-legacy-flat-reduction.core';

interface Args {
  apply: boolean;
  allowDbWrite: boolean;
  confirmReviewed: boolean;
  tenant?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: argv.includes('--apply'),
    allowDbWrite: argv.includes('--allow-db-write'),
    confirmReviewed: argv.includes('--confirm-i08-reviewed'),
  };
  const ti = argv.indexOf('--tenant');
  if (ti !== -1 && argv[ti + 1]) args.tenant = argv[ti + 1];
  return args;
}

async function loadRows(prisma: PrismaClient, tenant?: string): Promise<I08ClientRow[]> {
  const clients = await prisma.client.findMany({
    where: tenant ? { tenantId: tenant } : {},
    select: {
      id: true,
      tenantId: true,
      address: true,
      city: true,
      district: true,
      region: true,
      postalCode: true,
      addresses: {
        where: { isCurrent: true },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
        take: 1,
        select: { street: true, city: true, district: true },
      },
    },
  });
  return clients.map((c) => ({
    id: c.id,
    tenantId: c.tenantId,
    address: c.address,
    city: c.city,
    district: c.district,
    region: c.region,
    postalCode: c.postalCode,
    primaryCurrent: c.addresses[0] ?? null,
  }));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runId = `i08-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const prisma = new PrismaClient();
  try {
    const rows = await loadRows(prisma, args.tenant);
    const plan = planI08Reduction(rows);

    console.log(`[I08] runId=${runId} scope=${args.tenant ?? 'ALL_TENANTS'} rows=${rows.length}`);
    console.log(`[I08] BEFORE sayaçlar: ${JSON.stringify(plan.counters)}`);
    console.log(`[I08] eligible(ESIT)=${plan.eligible.length} conflicts=${plan.conflicts.length}`);

    if (!plan.ok) {
      console.error(
        `[I08] FAIL-CLOSED: ${plan.conflicts.length} conflict satırı (YALNIZ_FLAT/FARKLI) — APPLY REDDEDİLDİ.`,
      );
      for (const c of plan.conflicts.slice(0, 20)) console.error(`  - ${c.bucket}: client=${c.id} tenant=${c.tenantId}`);
      process.exitCode = 2;
      return;
    }

    if (!args.apply) {
      console.log('[I08] DRY-RUN tamam (yazım YAPILMADI). Apply için üç kapı flag gerekir.');
      return;
    }

    const guards = evaluateI08ApplyGuards({
      apply: args.apply,
      allowDbWrite: args.allowDbWrite,
      confirmReviewed: args.confirmReviewed,
      databaseUrl: process.env.DATABASE_URL,
    });
    if (!guards.allowed) {
      console.error(`[I08] APPLY GUARDS FAIL (dbTarget=${guards.dbTarget}):`);
      for (const r of guards.reasons) console.error(`  - ${r}`);
      process.exitCode = 3;
      return;
    }

    const byTenant = new Map<string, string[]>();
    for (const e of plan.eligible) {
      byTenant.set(e.tenantId, [...(byTenant.get(e.tenantId) ?? []), e.id]);
    }

    let totalCleared = 0;
    let totalAudited = 0;
    for (const [tenantId, ids] of byTenant) {
      const result = await prisma.$transaction(async (tx) =>
        applyI08ReductionForTenant(tx as never, tenantId, ids, runId),
      );
      totalCleared += result.cleared;
      totalAudited += result.audited;
      console.log(
        `[I08] tenant=${tenantId} cleared=${result.cleared} audited=${result.audited} skipped=${result.skipped.length}`,
      );
    }

    const afterRows = await loadRows(prisma, args.tenant);
    const after = planI08Reduction(afterRows);
    console.log(`[I08] AFTER sayaçlar: ${JSON.stringify(after.counters)}`);
    console.log(`[I08] APPLY tamam: cleared=${totalCleared} audited=${totalAudited}`);
    if (after.counters.ESIT !== 0 || after.counters.YALNIZ_FLAT !== 0 || after.counters.FARKLI !== 0) {
      console.error('[I08] AFTER-VERIFY FAIL: flat taşıyan satır kaldı — incele (rollback backup mevcut).');
      process.exitCode = 4;
    } else {
      console.log('[I08] AFTER-VERIFY PASS: indirgenebilir/flat satır kalmadı.');
    }
  } catch (err) {
    console.error(`[I08] HATA: ${redactSecrets(err instanceof Error ? err.message : String(err))}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
