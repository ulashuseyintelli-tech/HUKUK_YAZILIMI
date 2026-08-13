/**
 * OFFICE-P2-CAP02-REPORTINGLINE-INITIAL-POPULATION-I01 — kontrollü operasyon runner'ı.
 *
 * Owner-onaylı organizasyonel ReportingLine graph'ını kontrollü DB'ye yazar.
 * ReportingLine yetkilendirme, permission, policy veya final onay hakkı üretmez.
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
 *     --record=<actor-id>:TOP_LEVEL \
 *     --record=<actor-id>:MANAGED:<manager-id> [--record=...] \
 *     --validFrom=<iso> --authorityRef=<ref> --evidenceRef=<ref> [--apply]
 *
 * Eski iki-kisilik CLI (`--partnerUserId` + `--managedUserId`) backward-compatible
 * olarak korunur. `--record` verilirse self-contained owner graph modu kullanılır.
 *
 * `--apply` VERİLMEZSE hiçbir şey yazılmaz; yalnız dry-run raporu basılır.
 */
import { PrismaClient } from '@prisma/client';

import { AuditService } from '../modules/audit/audit.service';
import { ReportingLineService } from '../modules/reporting-line/reporting-line.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  buildPopulationDiff,
  type ActiveReportingLineSnapshot,
  type PopulationSnapshot,
} from './office-cap02-reportingline-population.core';
import {
  buildInitialPopulationPlan,
  buildPopulationGraphPlan,
  selectPopulationStepsForOperate,
  type PopulationActorDecision,
} from './office-cap02-reportingline-initial-population.plan';

const arg = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const allArgs = (name: string): string[] =>
  process.argv
    .filter((value) => value.startsWith(`--${name}=`))
    .map((value) => value.slice(name.length + 3));
const required = (name: string): string => {
  const value = arg(name);
  if (!value) throw new Error(`POPULATION_MISSING_ARG: --${name}`);
  return value;
};

const parseActorDecision = (value: string): PopulationActorDecision => {
  const [actorUserId, disposition, managerUserId, extra] = value.split(':');
  if (extra !== undefined || !actorUserId) {
    throw new Error(`POPULATION_INVALID_RECORD: ${value}`);
  }
  if (disposition === 'TOP_LEVEL' && managerUserId === undefined) {
    return { actorUserId, disposition, managerUserId: null };
  }
  if (disposition === 'MANAGED' && managerUserId) {
    return { actorUserId, disposition, managerUserId };
  }
  throw new Error(`POPULATION_INVALID_RECORD: ${value}`);
};

async function main(): Promise<void> {
  const tenantId = required('tenantId');
  const tenantSlug = required('tenantSlug');
  const actingUserId = required('actingUserId');
  const validFrom = required('validFrom');
  const authorityRef = required('authorityRef');
  const evidenceRef = required('evidenceRef');
  const apply = process.argv.includes('--apply');
  const recordArgs = allArgs('record');

  const plan =
    recordArgs.length > 0
      ? buildPopulationGraphPlan({
          tenantSlug,
          actors: recordArgs.map(parseActorDecision),
          validFrom,
          authorityRef,
          evidenceRef,
        })
      : buildInitialPopulationPlan({
          tenantSlug,
          partnerUserId: required('partnerUserId'),
          managedUserId: required('managedUserId'),
          validFrom,
          authorityRef,
          evidenceRef,
        });

  const prisma = new PrismaClient();
  try {
    // --- Snapshot: dry-run icin taze kontrollü DB durumu --------------------
    const referencedUserIds = [
      ...new Set(
        plan.records.flatMap((record) =>
          record.managerUserId
            ? [record.actorUserId, record.managerUserId]
            : [record.actorUserId],
        ),
      ),
    ];
    const [users, activeLines] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: referencedUserIds } },
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

    const dryRun = buildPopulationDiff(plan.records, snapshot);
    console.log('DRY_RUN', JSON.stringify({
      total: dryRun.total,
      create: dryRun.create,
      replace: dryRun.replace,
      noOp: dryRun.noOp,
      fail: dryRun.fail,
      eligibleForOperate: dryRun.eligibleForOperate,
    }));
    for (const r of dryRun.records) {
      const current = r.current
        ? `${r.current.disposition}:${r.current.managerUserId ?? 'NULL'}`
        : 'ABSENT';
      const desired = `${r.desired.disposition}:${r.desired.managerUserId ?? 'NULL'}`;
      console.log(
        `  ${r.operation.padEnd(7)} ${r.actorUserId}  ${current} -> ${desired}` +
          (r.blockingFailures.length ? `  ${r.blockingFailures.join(',')}` : ''),
      );
    }

    if (!dryRun.eligibleForOperate) {
      console.log('RESULT DRY_RUN_FAILED — DB yazimi YAPILMADI');
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
    const stepsToApply = selectPopulationStepsForOperate(plan, dryRun);
    for (const step of stepsToApply) {
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
      select: {
        actorUserId: true,
        managerUserId: true,
        disposition: true,
        actor: { select: { name: true } },
        manager: { select: { name: true } },
      },
      orderBy: { actor: { name: 'asc' } },
    });
    const expectedByActor = new Map(plan.records.map((record) => [record.actorUserId, record]));
    const actualByActor = new Map(after.map((record) => [record.actorUserId, record]));
    const mismatchedActors = plan.records
      .filter((expected) => {
        const actual = actualByActor.get(expected.actorUserId);
        return (
          !actual ||
          actual.disposition !== expected.disposition ||
          (actual.managerUserId ?? null) !== (expected.managerUserId ?? null)
        );
      })
      .map((record) => record.actorUserId);
    const unexpectedActors = after
      .filter((record) => !expectedByActor.has(record.actorUserId))
      .map((record) => record.actorUserId);
    const integrity = await service.reconciliation(tenantId);
    const reconciliation = {
      activeRows: after.length,
      expectedRows: plan.records.length,
      mismatchedActors,
      unexpectedActors,
      ...integrity,
    };
    console.log('RECONCILIATION', JSON.stringify(reconciliation));
    console.log(
      'ROWS',
      JSON.stringify(
        after.map((row) => ({
          actorUserId: row.actorUserId,
          actorName: row.actor.name,
          disposition: row.disposition,
          managerUserId: row.managerUserId,
          managerName: row.manager?.name ?? null,
        })),
      ),
    );

    const pass =
      reconciliation.activeRows === reconciliation.expectedRows &&
      reconciliation.mismatchedActors.length === 0 &&
      reconciliation.unexpectedActors.length === 0 &&
      reconciliation.unclassifiedActors === 0 &&
      reconciliation.cycles === 0 &&
      reconciliation.selfManagerRelationships === 0 &&
      reconciliation.duplicateActiveDispositions === 0 &&
      reconciliation.invalidManagedWithoutManager === 0 &&
      reconciliation.invalidTopLevelWithManager === 0 &&
      reconciliation.invalidDateRangeRelationships === 0 &&
      reconciliation.inactiveOrCrossTenantReferences === 0;

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
