import { Prisma } from '@prisma/client';
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
  /** Üretilecek ClaimItem create verileri (idempotency işareti dahil). */
  toCreate: Prisma.ClaimItemUncheckedCreateInput[];
  /** NAFAKA (Due-only takvim) → atlanan Due sayısı. */
  nafakaSkipped: number;
  /** Bu Due için zaten backfill ClaimItem var → atlanan (idempotent). */
  alreadyBackfilled: number;
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

  const toCreate: Prisma.ClaimItemUncheckedCreateInput[] = [];
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
    toCreate.push({
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
    findMany(args: any): Promise<Array<{ id: string; _count: { ledgerAllocations: number } }>>;
    delete(args: any): Promise<any>;
  };
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
}

export interface BackfillDeps {
  log?: (line: string) => void;
  now?: () => Date;
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
  errors: Array<{ caseId: string; message: string }>;
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
        for (const data of plan.toCreate) {
          await tx.claimItem.create({ data });
        }
      });
      report.claimItemsCreated += plan.toCreate.length;
    } catch (e: any) {
      report.errors.push({ caseId: c.id, message: e?.message ?? String(e) });
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
    select: { id: true, _count: { select: { ledgerAllocations: true } } },
  });

  const report: RollbackReport = {
    runId,
    mode,
    matched: items.length,
    deleted: 0,
    refused_hasAllocations: 0,
    refusedIds: [],
  };

  for (const it of items) {
    if (it._count.ledgerAllocations > 0) {
      report.refused_hasAllocations += 1;
      report.refusedIds.push(it.id); // Q3: allocation varsa REDDET
      continue;
    }
    if (!opts.apply) continue; // dry-run: silme yok
    await prisma.claimItem.delete({ where: { id: it.id } });
    report.deleted += 1;
  }

  return report;
}
