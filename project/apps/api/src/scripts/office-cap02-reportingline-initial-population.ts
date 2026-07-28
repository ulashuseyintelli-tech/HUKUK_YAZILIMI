/**
 * OFFICE-P2-CAP02-REPORTINGLINE-INITIAL-POPULATION-I01 — kontrollü operasyon runner'ı.
 *
 * Owner-onaylı ilk iki kişilik authorization graph'ını production'a yazar:
 *   Partner User -> TOP_LEVEL
 *   Ege User     -> MANAGED (manager = Partner)
 *
 * YAZIM YOLU: kanonik `ReportingLineService.markTopLevel()` / `assignManager()`.
 * Doğrudan SQL veya doğrudan `prisma.reportingLine.create()` KULLANILMAZ — böylece
 * servisin kendi cycle/self-manager/tenant guard'ları ve audit kaydı devrede kalır.
 * Servisler DI container yerine elle bağlanır; sınıf ve metotlar aynıdır.
 *
 * Karar/plan mantığı bu dosyada DEĞİL: `.plan.ts` planı üretir, merged
 * `office-cap02-reportingline-population.core.ts` dry-run doğrulamasını yapar.
 *
 * KULLANIM
 *   DATABASE_URL=... node office-cap02-reportingline-initial-population.js \
 *     --tenantId=<id> --tenantSlug=<slug> --actingUserId=<admin-user-id> \
 *     --partnerUserId=<id> --managedUserId=<id> \
 *     --validFrom=<iso> --authorityRef=<ref> --evidenceRef=<ref> [--apply]
 *
 * `--apply` VERİLMEZSE hiçbir şey yazılmaz; yalnız dry-run raporu basılır.
 */
import { PrismaClient } from '@prisma/client';

import { AuditService } from '../modules/audit/audit.service';
import { ReportingLineService } from '../modules/reporting-line/reporting-line.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  dryRunPopulation,
  type ActiveReportingLineSnapshot,
  type PopulationSnapshot,
} from './office-cap02-reportingline-population.core';
import { buildInitialPopulationPlan } from './office-cap02-reportingline-initial-population.plan';

const arg = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const required = (name: string): string => {
  const value = arg(name);
  if (!value) throw new Error(`POPULATION_MISSING_ARG: --${name}`);
  return value;
};

async function main(): Promise<void> {
  const tenantId = required('tenantId');
  const tenantSlug = required('tenantSlug');
  const actingUserId = required('actingUserId');
  const partnerUserId = required('partnerUserId');
  const managedUserId = required('managedUserId');
  const validFrom = required('validFrom');
  const authorityRef = required('authorityRef');
  const evidenceRef = required('evidenceRef');
  const apply = process.argv.includes('--apply');

  const plan = buildInitialPopulationPlan({
    tenantSlug,
    partnerUserId,
    managedUserId,
    validFrom,
    authorityRef,
    evidenceRef,
  });

  const prisma = new PrismaClient();
  try {
    // --- Snapshot: dry-run icin taze production durumu -----------------------
    const [users, activeLines] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: [partnerUserId, managedUserId] } },
        select: { id: true, tenantId: true, isActive: true },
      }),
      prisma.reportingLine.findMany({
        where: { tenantId, validUntil: null },
        select: { tenantId: true, actorUserId: true, managerUserId: true, disposition: true },
      }),
    ]);

    const snapshot: PopulationSnapshot = {
      tenantIdBySlug: { [tenantSlug]: tenantId },
      users: users.map((u) => ({ userId: u.id, tenantId: u.tenantId, isActive: u.isActive })),
      activeLines: activeLines as ActiveReportingLineSnapshot[],
    };

    const dryRun = dryRunPopulation(plan.records, snapshot);
    console.log('DRY_RUN', JSON.stringify({
      total: dryRun.total,
      pass: dryRun.pass,
      noOp: dryRun.noOp,
      fail: dryRun.fail,
      eligibleForOperate: dryRun.eligibleForOperate,
    }));
    for (const r of dryRun.records) {
      console.log(`  ${r.verdict.padEnd(6)} ${r.disposition.padEnd(9)} ${r.actorUserId}` +
        (r.failures.length ? `  ${r.failures.join(',')}` : ''));
    }

    if (!dryRun.eligibleForOperate) {
      console.log('RESULT DRY_RUN_FAILED — production yazimi YAPILMADI');
      process.exitCode = 2;
      return;
    }
    if (!apply) {
      console.log('RESULT DRY_RUN_ONLY — --apply verilmedi, hicbir sey yazilmadi');
      return;
    }
    // IDEMPOTENCY: her kayit zaten birebir istenen halde ise servis CAGRILMAZ.
    // ReportingLineService yeniden cagrildiginda mevcut satiri validUntil ile kapatip
    // ayni icerikte yenisini acar; bu, hicbir sey degismedigi halde gecmise anlamsiz
    // kapanmis satirlar ekler. Tekrar calistirma no-op olmalidir.
    if (dryRun.noOp === dryRun.total && dryRun.total > 0) {
      console.log('RESULT ALREADY_APPLIED — tum kayitlar mevcut haliyle ayni, yazim yapilmadi');
      return;
    }

    // --- Apply: kanonik servis yolu -----------------------------------------
    const prismaService = prisma as unknown as PrismaService;
    const audit = new AuditService(prismaService);
    const service = new ReportingLineService(prismaService, audit);

    const applied: string[] = [];
    for (const step of plan.steps) {
      if (step.kind === 'MARK_TOP_LEVEL') {
        const out = await service.markTopLevel(tenantId, actingUserId, 'ADMIN', {
          actorUserId: step.actorUserId,
        });
        applied.push(`MARK_TOP_LEVEL ${out.actorUserId} -> ${out.disposition}`);
      } else {
        const out = await service.assignManager(tenantId, actingUserId, 'ADMIN', {
          actorUserId: step.actorUserId,
          managerUserId: step.managerUserId as string,
        });
        applied.push(`ASSIGN_MANAGER ${out.actorUserId} -> ${out.disposition} (${out.managerUserId})`);
      }
    }
    for (const line of applied) console.log('APPLIED', line);

    // --- Post-commit reconciliation (runner ciktisindan bagimsiz sorgular) ---
    const after = await prisma.reportingLine.findMany({
      where: { tenantId, validUntil: null },
      select: { actorUserId: true, managerUserId: true, disposition: true },
    });
    const topLevel = after.filter((r) => r.disposition === 'TOP_LEVEL').length;
    const managed = after.filter((r) => r.disposition === 'MANAGED').length;
    const selfManager = after.filter((r) => r.managerUserId === r.actorUserId).length;
    const duplicateActor = after.length - new Set(after.map((r) => r.actorUserId)).size;
    const managerNullOnTopLevel = after.filter(
      (r) => r.disposition === 'TOP_LEVEL' && r.managerUserId !== null,
    ).length;
    const managedWithoutManager = after.filter(
      (r) => r.disposition === 'MANAGED' && r.managerUserId === null,
    ).length;

    const crossTenant = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*)::bigint AS n FROM "ReportingLine" r
       JOIN "User" a ON a.id = r."actorUserId"
       LEFT JOIN "User" m ON m.id = r."managerUserId"
       WHERE r."validUntil" IS NULL
         AND (a."tenantId" <> r."tenantId" OR (m.id IS NOT NULL AND m."tenantId" <> r."tenantId"))`,
    );

    const reconciliation = {
      activeRows: after.length,
      topLevel,
      managed,
      selfManager,
      duplicateActor,
      managerNullOnTopLevel,
      managedWithoutManager,
      crossTenant: Number(crossTenant[0]?.n ?? 0n),
    };
    console.log('RECONCILIATION', JSON.stringify(reconciliation));

    const pass =
      reconciliation.activeRows === 2 &&
      reconciliation.topLevel === 1 &&
      reconciliation.managed === 1 &&
      reconciliation.selfManager === 0 &&
      reconciliation.duplicateActor === 0 &&
      reconciliation.managerNullOnTopLevel === 0 &&
      reconciliation.managedWithoutManager === 0 &&
      reconciliation.crossTenant === 0;

    console.log('RESULT', pass ? 'PASS' : 'FAIL');
    if (!pass) process.exitCode = 3;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error('POPULATION_RUNNER_ERROR', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
