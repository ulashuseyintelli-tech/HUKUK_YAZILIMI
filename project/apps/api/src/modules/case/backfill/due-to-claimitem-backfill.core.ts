import { Prisma } from '@prisma/client';
import {
  buildCanonicalWriteEnvelopeV1,
  type CanonicalWriteEnvelopeV1,
} from '../../../common/canonical-write-envelope';
import { ClaimItemSourceIntegrityGuard } from '../../claim-item/claim-item-source-integrity.guard';
import {
  appendClaimItemContinuity,
  assertBackfillRollbackCandidate,
  ClaimItemLifecycleException,
  type BackfillRollbackCandidate,
  type ClaimItemLifecycleRecord,
} from '../../claim-item/claim-item-lifecycle-contract';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';
import { DueType, DueDto } from '../dto/case.dto';
import { mapDueTypeToClaimItemType, buildClaimItemData } from '../due-to-claim-item.mapper';

/**
 * G2 BACKFILL ÇEKİRDEĞİ — saf (DB'siz) karar mantığı.
 *
 * scripts/backfill-due-to-claimitem.ts bu çekirdeği prisma'ya bağlar; çekirdek
 * test edilebilir kalsın diye I/O içermez. G1 mapper'ı yeniden kullanır
 * (kod tekrarı yok). Hukuki/operasyonel kararlar: tbk100-legal-decisions-ledger G2.
 */

/** Backfill için gereken minimal Due alanları (Prisma Due'dan türetilir). */
export interface DueLike {
  id: string;
  type: string; // DueType (string); mapper string-key lookup yapar
  description?: string | null;
  amount: number;
  dueDate: Date | string;
  currency: string;
  sortOrder?: number;
}

/** Backfill için gereken minimal ClaimItem alanları (idempotency işareti). */
export interface ClaimItemLike {
  metadata?: unknown;
}

export interface BackfillCasePlan {
  /** İşaretsiz (insan/G1/panel) ClaimItem varsa TÜM dosya atlanır (Q1). */
  skipCase: boolean;
  reason?: 'HAS_UNMARKED_CLAIMITEM';
  /** Üretilecek ClaimItem create verisi ve doğrulanacak canonical write envelope. */
  toCreate: BackfillClaimItemCreatePlan[];
  /** NAFAKA (Due-only takvim) → atlanan Due sayısı. */
  nafakaSkipped: number;
  /** Bu Due için zaten backfill ClaimItem var → atlanan (idempotent). */
  alreadyBackfilled: number;
}

export interface BackfillClaimItemCreatePlan {
  readonly sourceDueId: string;
  readonly envelope: CanonicalWriteEnvelopeV1<'ClaimItem'>;
  readonly data: Prisma.ClaimItemUncheckedCreateInput;
}

interface BackfillMarker {
  sourceDueId?: string;
  runId?: string;
  mappedFrom?: string;
  at?: string;
}

function readBackfillMarker(metadata: unknown): BackfillMarker | undefined {
  if (metadata && typeof metadata === 'object' && 'backfill' in (metadata as any)) {
    return (metadata as any).backfill as BackfillMarker;
  }
  return undefined;
}

/**
 * Tek dosya için backfill planı (saf). DB yazmaz; yalnız ne yapılacağını döner.
 *
 * Çağrıldığı yerler:
 * - backfill-due-to-claimitem script → runBackfill() (dosya-başına plan)
 */
export function planBackfillForCase(params: {
  tenantId: string;
  caseId: string;
  dues: DueLike[];
  existingClaimItems: ClaimItemLike[];
  runId: string;
  now?: Date;
}): BackfillCasePlan {
  const { tenantId, caseId, dues, existingClaimItems, runId } = params;
  const now = params.now ?? new Date();

  // Q1 guard: işaretsiz (backfill dışı) ClaimItem varsa TÜM dosya atla.
  const hasUnmarked = existingClaimItems.some((ci) => !readBackfillMarker(ci.metadata));
  if (hasUnmarked) {
    return {
      skipCase: true,
      reason: 'HAS_UNMARKED_CLAIMITEM',
      toCreate: [],
      nafakaSkipped: 0,
      alreadyBackfilled: 0,
    };
  }

  // Daha önce backfill edilmiş Due id'leri (idempotency).
  const alreadyDueIds = new Set<string>();
  for (const ci of existingClaimItems) {
    const m = readBackfillMarker(ci.metadata);
    if (m?.sourceDueId) alreadyDueIds.add(m.sourceDueId);
  }

  const toCreate: BackfillClaimItemCreatePlan[] = [];
  let nafakaSkipped = 0;
  let alreadyBackfilled = 0;

  for (const due of dues) {
    const itemType = mapDueTypeToClaimItemType(due.type as DueType);
    if (itemType === null) {
      nafakaSkipped += 1; // NAFAKA → Due-only
      continue;
    }
    if (alreadyDueIds.has(due.id)) {
      alreadyBackfilled += 1; // idempotent: zaten üretilmiş
      continue;
    }

    const dueDto: DueDto = {
      type: due.type as DueType,
      description: due.description ?? undefined,
      amount: due.amount,
      dueDate: typeof due.dueDate === 'string' ? due.dueDate : due.dueDate.toISOString(),
    };

    const base = buildClaimItemData(tenantId, caseId, dueDto, itemType);
    const occurredAt = now.toISOString();
    const backfillLineage = stableJsonHash({
      version: 1,
      tenantId,
      caseId,
      runId,
    });
    const envelope = buildCanonicalWriteEnvelopeV1({
      tenantId,
      caseId,
      target: { aggregateType: 'ClaimItem' as const },
      actor: { type: 'SYSTEM', system: 'DUE_BACKFILL' },
      correlationId: `claim-item-backfill:${backfillLineage}`,
      idempotencyKey: `claim-item-backfill:${stableJsonHash({ backfillLineage, dueId: due.id })}`,
      occurredAt,
      effectiveAt: occurredAt,
      source: {
        sourceType: 'DUE_BACKFILL',
        sourceId: due.id,
        evidenceRefs: [`backfill-run:${backfillLineage}`],
      },
      authority: { policyRef: 'REC-AUTH-008' },
    });
    toCreate.push({
      sourceDueId: due.id,
      envelope,
      data: {
        ...base,
        currency: due.currency, // Q2: backfill due.currency'yi korur ('TRY' override)
        sortOrder: due.sortOrder ?? 0,
        metadata: {
          backfill: {
            sourceDueId: due.id,
            runId,
            mappedFrom: due.type,
            at: now.toISOString(),
          },
        },
      },
    });
  }

  return { skipCase: false, toCreate, nafakaSkipped, alreadyBackfilled };
}

export interface BackfillOptions {
  apply: boolean;
  tenantId?: string;
  allTenants: boolean;
  confirmProd: boolean;
  maxErrors: number;
  rollbackRunId?: string;
  out?: string;
}

/**
 * CLI argümanlarını ayrıştırır + güvenlik kilitlerini doğrular (saf).
 * Varsayılan = DRY-RUN. --apply için tenant/confirm kilidi ZORUNLU (kırmızı çizgi).
 *
 * Çağrıldığı yerler:
 * - backfill-due-to-claimitem script → main()
 */
export function parseBackfillArgs(argv: string[]): BackfillOptions {
  const has = (flag: string) => argv.includes(flag);
  const val = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };

  const maxErrorsRaw = val('--max-errors');
  const opts: BackfillOptions = {
    apply: has('--apply'),
    tenantId: val('--tenant'),
    allTenants: has('--all-tenants'),
    confirmProd: has('--confirm-prod-backfill'),
    maxErrors: maxErrorsRaw !== undefined ? Number(maxErrorsRaw) : 0,
    rollbackRunId: val('--rollback'),
    out: val('--out'),
  };

  if (Number.isNaN(opts.maxErrors) || opts.maxErrors < 0) {
    throw new Error('--max-errors negatif olmayan bir sayı olmalı.');
  }

  // Rollback modu kendi kilidini taşır (allocation kontrolü runtime'da); burada
  // yalnız backfill apply kilidini zorla.
  if (opts.apply && !opts.rollbackRunId) {
    const singleTenant = !!opts.tenantId;
    const allTenantsConfirmed = opts.allTenants && opts.confirmProd;
    if (!singleTenant && !allTenantsConfirmed) {
      throw new Error(
        '--apply için kilit: ya "--tenant <id>" ya da "--all-tenants --confirm-prod-backfill" gerekir.',
      );
    }
  }

  return opts;
}

/** Dev/prod ayrımı olmadan benzersiz çalıştırma kimliği (rollback anahtarı). */
export function generateRunId(now: Date = new Date()): string {
  return `bf-${now.toISOString().replace(/[:.]/g, '-')}`;
}

// ==================== ORKESTRASYON (enjekte edilebilir prisma) ====================

/** Backfill'in ihtiyaç duyduğu minimal prisma yüzeyi (gerçek PrismaClient bunu karşılar). */
export interface BackfillPrisma {
  case: {
    findMany(args: any): Promise<
      Array<{
        id: string;
        tenantId: string;
        dues: Array<{
          id: string;
          type: string;
          description: string | null;
          amount: any;
          dueDate: Date;
          currency: string;
          sortOrder: number;
        }>;
        claimItems: Array<{ metadata: unknown }>;
      }>
    >;
  };
  claimItem: {
    create(args: any): Promise<any>;
    findMany(args: any): Promise<Array<BackfillRollbackCandidate>>;
    delete(args: any): Promise<any>;
  };
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
}

export interface BackfillDeps {
  log?: (line: string) => void;
  now?: () => Date;
  domainEventIngest?: DomainEventIngestService;
}

export interface BackfillReport {
  runId: string;
  mode: 'APPLY' | 'DRY-RUN';
  scope: string;
  casesScanned: number;
  casesWithDues: number;
  eligibleCases: number;
  skippedCases_haveUnmarkedClaimItem: number;
  claimItemsCreated: number;
  claimItemsPlanned: number;
  nafakaSkipped: number;
  alreadyBackfilled: number;
  errors: Array<{ caseId: string; code?: string; message: string }>;
  manualReviewCaseIds: string[];
}

/**
 * Backfill orkestrasyonu. DRY-RUN'da HİÇBİR yazma yapılmaz (sadece plan + rapor).
 *
 * Çağrıldığı yerler:
 * - scripts/backfill-due-to-claimitem.ts → main()
 */
export async function runBackfill(
  prisma: BackfillPrisma,
  opts: BackfillOptions,
  deps: BackfillDeps = {},
): Promise<BackfillReport> {
  const log = deps.log ?? (() => undefined);
  const now = deps.now ?? (() => new Date());
  const sourceIntegrity = new ClaimItemSourceIntegrityGuard();
  const domainEventIngest = deps.domainEventIngest ?? new DomainEventIngestService();
  const runId = generateRunId(now());
  const mode: BackfillReport['mode'] = opts.apply ? 'APPLY' : 'DRY-RUN';
  const scope = opts.tenantId ? `tenant=${opts.tenantId}` : 'all-tenants';
  log(`# G2 backfill — mode=${mode} ${scope} runId=${runId}`);

  const cases = await prisma.case.findMany({
    where: opts.tenantId ? { tenantId: opts.tenantId } : {},
    select: {
      id: true,
      tenantId: true,
      dues: {
        select: { id: true, type: true, description: true, amount: true, dueDate: true, currency: true, sortOrder: true },
      },
      claimItems: { select: { metadata: true } },
    },
  });

  const report: BackfillReport = {
    runId,
    mode,
    scope,
    casesScanned: cases.length,
    casesWithDues: 0,
    eligibleCases: 0,
    skippedCases_haveUnmarkedClaimItem: 0,
    claimItemsCreated: 0,
    claimItemsPlanned: 0,
    nafakaSkipped: 0,
    alreadyBackfilled: 0,
    errors: [],
    manualReviewCaseIds: [],
  };

  for (const c of cases) {
    if (!c.dues || c.dues.length === 0) continue;
    report.casesWithDues += 1;

    const dues: DueLike[] = c.dues.map((d) => ({
      id: d.id,
      type: d.type,
      description: d.description,
      amount: Number(d.amount),
      dueDate: d.dueDate,
      currency: d.currency,
      sortOrder: d.sortOrder,
    }));

    const plan = planBackfillForCase({
      tenantId: c.tenantId,
      caseId: c.id,
      dues,
      existingClaimItems: c.claimItems,
      runId,
      now: now(),
    });

    report.nafakaSkipped += plan.nafakaSkipped;
    report.alreadyBackfilled += plan.alreadyBackfilled;

    if (plan.skipCase) {
      report.skippedCases_haveUnmarkedClaimItem += 1;
      report.manualReviewCaseIds.push(c.id);
      continue;
    }
    if (plan.toCreate.length === 0) continue;

    report.eligibleCases += 1;
    report.claimItemsPlanned += plan.toCreate.length;

    if (!opts.apply) continue; // DRY-RUN: yazma yok

    try {
      await prisma.$transaction(async (tx) => {
        for (const write of plan.toCreate) {
          const data = await sourceIntegrity.prepareBackfillCreate(
            {
              tenantId: c.tenantId,
              caseId: c.id,
              sourceId: write.sourceDueId,
              envelope: write.envelope,
              data: write.data as unknown as Record<string, unknown>,
            },
            tx,
          );
          const created = await tx.claimItem.create({ data });
          await appendClaimItemContinuity({
            tx,
            domainEventIngest,
            envelope: write.envelope,
            operation: 'CREATE',
            before: null,
            after: created as ClaimItemLifecycleRecord,
            auditAction: 'CLAIM_ITEM_BACKFILL_CREATED',
            auditSource: 'DUE_BACKFILL',
            approvalRequired: false,
          });
        }
      });
      report.claimItemsCreated += plan.toCreate.length;
    } catch (e: any) {
      report.errors.push({
        caseId: c.id,
        ...(typeof e?.conflictCode === 'string' ? { code: e.conflictCode } : {}),
        message: e?.message ?? String(e),
      });
      if (report.errors.length > opts.maxErrors) {
        log(`! max-errors (${opts.maxErrors}) aşıldı → DURDURULDU`);
        break;
      }
    }
  }

  return report;
}

export interface RollbackReport {
  runId: string;
  mode: 'ROLLBACK-APPLY' | 'ROLLBACK-DRY-RUN';
  matched: number;
  deleted: number;
  refused_hasAllocations: number;
  refused_invalidProvenance: number;
  refusedIds: string[];
}

/**
 * Rollback orkestrasyonu. Allocation'lı ClaimItem REDDEDİLİR (Q3, zorla silme yok).
 * DRY-RUN'da silme yok (sadece ne silineceğini raporlar).
 *
 * Çağrıldığı yerler:
 * - scripts/backfill-due-to-claimitem.ts → main()
 */
export async function runRollback(
  prisma: BackfillPrisma,
  opts: BackfillOptions,
  deps: BackfillDeps = {},
): Promise<RollbackReport> {
  const log = deps.log ?? (() => undefined);
  const runId = opts.rollbackRunId!;
  const mode: RollbackReport['mode'] = opts.apply ? 'ROLLBACK-APPLY' : 'ROLLBACK-DRY-RUN';
  log(`# G2 rollback — mode=${mode} runId=${runId}`);

  const items = await prisma.claimItem.findMany({
    where: { metadata: { path: ['backfill', 'runId'], equals: runId } },
    select: {
      id: true,
      tenantId: true,
      caseId: true,
      status: true,
      metadata: true,
      _count: { select: { ledgerAllocations: true } },
    },
  });

  const report: RollbackReport = {
    runId,
    mode,
    matched: items.length,
    deleted: 0,
    refused_hasAllocations: 0,
    refused_invalidProvenance: 0,
    refusedIds: [],
  };

  for (const it of items) {
    if (it._count.ledgerAllocations > 0) {
      report.refused_hasAllocations += 1;
      report.refusedIds.push(it.id); // Q3: allocation varsa REDDET
      continue;
    }
    if (!opts.apply) continue; // dry-run: silme yok
    try {
      const deleted = await prisma.$transaction(async (tx) => {
        // Allocation eklenmesi ile hard-delete arasında yarış oluşmaması için row lock;
        // source/provenance ve allocation sayısı kilit altında yeniden doğrulanır.
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ClaimItem" WHERE "id" = ${it.id} FOR UPDATE`);
        const current = await tx.claimItem.findFirst({
          where: { id: it.id },
          select: {
            id: true,
            tenantId: true,
            caseId: true,
            status: true,
            metadata: true,
            _count: { select: { ledgerAllocations: true } },
          },
        }) as BackfillRollbackCandidate | null;
        if (!current) {
          throw new ClaimItemLifecycleException(
            'CLAIM_ITEM_ROLLBACK_PROVENANCE_MISMATCH',
            'Rollback ClaimItem kaydı kilit altında bulunamadı.',
          );
        }
        if (current._count.ledgerAllocations > 0) return false;
        assertBackfillRollbackCandidate(current, runId);

        const metadata = current.metadata as Record<string, any>;
        const sourceDueId = String(metadata.backfill.sourceDueId);
        const occurredAt = (deps.now ?? (() => new Date()))().toISOString();
        const lineage = stableJsonHash({
          version: 1,
          tenantId: current.tenantId,
          caseId: current.caseId,
          runId,
          claimItemId: current.id,
        });
        const envelope = buildCanonicalWriteEnvelopeV1({
          tenantId: current.tenantId,
          caseId: current.caseId,
          target: { aggregateType: 'ClaimItem' as const, aggregateId: current.id },
          actor: { type: 'SYSTEM', system: 'DUE_BACKFILL' },
          correlationId: `claim-item-rollback:${lineage}`,
          idempotencyKey: `claim-item-rollback:${lineage}:${current.id}`,
          occurredAt,
          effectiveAt: occurredAt,
          source: {
            sourceType: 'DUE_BACKFILL',
            sourceId: sourceDueId,
            evidenceRefs: [`backfill-run:${lineage}`],
          },
          authority: { policyRef: 'REC-AUTH-008' },
        });

        await appendClaimItemContinuity({
          tx,
          domainEventIngest: deps.domainEventIngest ?? new DomainEventIngestService(),
          envelope,
          operation: 'OPERATIONAL_ROLLBACK_DELETE',
          before: current,
          after: null,
          auditAction: 'CLAIM_ITEM_BACKFILL_ROLLED_BACK',
          auditSource: 'DUE_BACKFILL_ROLLBACK',
          approvalRequired: false,
          retentionDisposition: 'AUTHORIZED_OPERATIONAL_ROLLBACK',
        });
        await tx.claimItem.delete({ where: { id: current.id } });
        return true;
      });
      if (!deleted) {
        report.refused_hasAllocations += 1;
        report.refusedIds.push(it.id);
        continue;
      }
      report.deleted += 1;
    } catch (error) {
      if (
        error instanceof ClaimItemLifecycleException &&
        error.conflictCode === 'CLAIM_ITEM_ROLLBACK_PROVENANCE_MISMATCH'
      ) {
        report.refused_invalidProvenance += 1;
        report.refusedIds.push(it.id);
        continue;
      }
      throw error;
    }
  }

  return report;
}
