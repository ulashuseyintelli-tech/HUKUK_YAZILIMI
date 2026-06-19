/**
 * ASSIGN-4b drift onarımı — TEST EDİLEBİLİR ÇEKİRDEK.
 *
 * ASSIGN-4b "her dosyada TAM 1 sorumlu avukat" invariant'ını İLERİ-DÖNÜK uyguladı
 * (case.service.ts create/update/add/remove) ama 4b ÖNCESİ açılmış dosyaları onarmadı.
 * Bu çekirdek mevcut drift'i (0 veya >1 sorumlu) create()'in döngü-sonrası dedupe'iyle
 * BİREBİR aynı kararla (planResponsible, preferId=null) onarır.
 *
 * Saf karar `planCaseDriftFix`'te (izole test edilir); orkestrasyon `runDriftRepair`'de
 * (yapısal Prisma interface = decoupled, backfill-due-to-claimitem deseni). Karar mantığı
 * REUSE'tur — yeniden yazılmaz: case-responsible.helpers.planResponsible.
 *
 * Çağrıldığı yerler:
 * - fix-case-lawyer-responsible-drift.ts (ELLE çalıştırılan operasyonel script; CI/deploy DEĞİL)
 */
import { planResponsible } from "./case-responsible.helpers";

// ==================== ARGÜMAN / KİLİT ====================

export interface DriftRepairOptions {
  apply: boolean;
  tenantId?: string;
  allTenants: boolean;
  confirmProd: boolean;
  out?: string;
}

/**
 * Argüman parse + scope/yazma kilidi (backfill-due-to-claimitem.ts ile aynı sözleşme).
 * - Scope ZORUNLU (dry-run dahil): tam olarak biri → `--tenant <id>` XOR `--all-tenants`.
 * - Yazma: `--apply --all-tenants` → `--confirm-prod-backfill` şart (global yazım kilidi).
 */
export function parseDriftRepairArgs(argv: string[]): DriftRepairOptions {
  const has = (flag: string) => argv.includes(flag);
  const val = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const opts: DriftRepairOptions = {
    apply: has("--apply"),
    tenantId: val("--tenant"),
    allTenants: has("--all-tenants"),
    confirmProd: has("--confirm-prod-backfill"),
    out: val("--out"),
  };

  const singleTenant = !!opts.tenantId;
  if (singleTenant && opts.allTenants) {
    throw new Error("--tenant ile --all-tenants aynı anda verilemez.");
  }
  if (!singleTenant && !opts.allTenants) {
    throw new Error('Scope zorunlu: "--tenant <id>" ya da "--all-tenants" verin.');
  }
  if (opts.apply && opts.allTenants && !opts.confirmProd) {
    throw new Error("--apply --all-tenants için kilit: --confirm-prod-backfill gerekir.");
  }
  return opts;
}

// ==================== SAF KARAR ====================

/** Bir dosyanın caseLawyer satırı (karar girdisi). */
export interface DriftCaseLawyer {
  id: string;
  lawyerRank: string | null;
  isResponsible: boolean;
}

export type DriftKind = "OK" | "EMPTY" | "ZERO_RESPONSIBLE" | "MULTI_RESPONSIBLE";

export interface CaseDriftPlan {
  kind: DriftKind;
  isDrift: boolean;
  lawyerCount: number;
  responsibleBefore: number;
  /** Sorumlu kalacak/olacak satır (drift ise dolu; OK/EMPTY'de null). */
  keepId: string | null;
  /** isResponsible=false + role=ASSIGNED yapılacak satırlar. */
  demoteIds: string[];
}

/**
 * Saf karar: bir dosyanın sorumlu-avukat drift'ini sınıflandırır + onarım planı üretir.
 * create()'in döngü-sonrası dedupe'iyle BİREBİR aynı karar (planResponsible, preferId=null):
 * - lawyerCount===0 → EMPTY (no-op; ASSIGN-4b bilinçli istisnası: avukatsız dosya).
 * - responsibleBefore===1 → OK (dokunma).
 * - responsibleBefore===0 (avukat var) → ZERO_RESPONSIBLE (1 promote, demote yok).
 * - responsibleBefore>1 → MULTI_RESPONSIBLE (1 koru, gerisi demote).
 */
export function planCaseDriftFix(lawyers: DriftCaseLawyer[]): CaseDriftPlan {
  const lawyerCount = lawyers.length;
  const responsibleBefore = lawyers.filter((l) => l.isResponsible).length;

  if (lawyerCount === 0) {
    return { kind: "EMPTY", isDrift: false, lawyerCount, responsibleBefore, keepId: null, demoteIds: [] };
  }
  if (responsibleBefore === 1) {
    return { kind: "OK", isDrift: false, lawyerCount, responsibleBefore, keepId: null, demoteIds: [] };
  }
  // Drift: 0 veya >1 sorumlu → ASSIGN-4b create dedupe ile aynı karar (REUSE).
  const { keepId, demoteIds } = planResponsible(lawyers, null);
  const kind: DriftKind = responsibleBefore === 0 ? "ZERO_RESPONSIBLE" : "MULTI_RESPONSIBLE";
  return { kind, isDrift: true, lawyerCount, responsibleBefore, keepId, demoteIds };
}

// ==================== ORKESTRASYON (yapısal Prisma) ====================

export interface DriftPrismaTx {
  caseLawyer: { update(args: unknown): Promise<unknown> };
}
export interface DriftPrisma {
  case: {
    findMany(args: unknown): Promise<
      Array<{
        id: string;
        fileNumber: string | null;
        tenantId: string;
        lawyers: Array<{ id: string; isResponsible: boolean; lawyer: { lawyerRank: string | null } }>;
      }>
    >;
  };
  $transaction<T>(fn: (tx: DriftPrismaTx) => Promise<T>): Promise<T>;
}

export interface DriftRepairDeps {
  log?: (line: string) => void;
}

export interface CaseDriftReportRow {
  caseId: string;
  fileNumber: string | null;
  tenantId: string;
  kind: DriftKind;
  lawyerCount: number;
  responsibleBefore: number;
  keepId: string | null;
  demotedIds: string[];
}

export interface DriftRepairReport {
  mode: "APPLY" | "DRY-RUN";
  scope: string; // tenant id veya "ALL_TENANTS"
  scannedCases: number;
  driftCases: number;
  zeroResponsibleCases: number;
  multiResponsibleCases: number;
  plannedPromotes: number; // keepId yazımı (her drift dosyası 1)
  plannedDemotes: number; // toplam demote yazımı
  appliedPromotes: number;
  appliedDemotes: number;
  perTenant: Array<{ tenantId: string; driftCases: number; zeroResponsible: number; multiResponsible: number }>;
  cases: CaseDriftReportRow[];
}

/**
 * Drift'i tarar (tenant-scope) ve --apply ise onarır. Yazma, create:1293-1304 ile BİREBİR:
 * keepId → {isResponsible:true, role:'RESPONSIBLE'}; her demoteId → {isResponsible:false,
 * role:'ASSIGNED'}; dosya başına atomik tek $transaction (asla 0/2 sorumlu ara-durum kalmaz).
 *
 * Tenant: CaseLawyer'da tenantId YOK → scope `Case.tenantId` üzerinden.
 */
export async function runDriftRepair(
  prisma: DriftPrisma,
  opts: DriftRepairOptions,
  deps: DriftRepairDeps = {},
): Promise<DriftRepairReport> {
  const log = deps.log ?? (() => {});
  const where = opts.allTenants ? {} : { tenantId: opts.tenantId };

  const cases = await prisma.case.findMany({
    where,
    select: {
      id: true,
      fileNumber: true,
      tenantId: true,
      lawyers: {
        select: { id: true, isResponsible: true, lawyer: { select: { lawyerRank: true } } },
        // Determinizm: eşit-rank tie-break için STABİL sıra. planResponsible "dizideki ilk" en
        // öncelikli rank'i seçer → createdAt ASC ile eşit-rank içinde en ESKİ kayıt keeper olur
        // (runtime create/remove fallback'iyle birebir). Örtük DB sırası bırakılmaz.
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });

  const report: DriftRepairReport = {
    mode: opts.apply ? "APPLY" : "DRY-RUN",
    scope: opts.allTenants ? "ALL_TENANTS" : opts.tenantId ?? "",
    scannedCases: cases.length,
    driftCases: 0,
    zeroResponsibleCases: 0,
    multiResponsibleCases: 0,
    plannedPromotes: 0,
    plannedDemotes: 0,
    appliedPromotes: 0,
    appliedDemotes: 0,
    perTenant: [],
    cases: [],
  };
  const perTenant = new Map<string, { driftCases: number; zeroResponsible: number; multiResponsible: number }>();

  for (const c of cases) {
    const lawyers: DriftCaseLawyer[] = c.lawyers.map((cl) => ({
      id: cl.id,
      lawyerRank: cl.lawyer.lawyerRank,
      isResponsible: cl.isResponsible,
    }));
    const plan = planCaseDriftFix(lawyers);
    if (!plan.isDrift) continue;

    report.driftCases++;
    if (plan.kind === "ZERO_RESPONSIBLE") report.zeroResponsibleCases++;
    else report.multiResponsibleCases++;
    report.plannedPromotes += plan.keepId ? 1 : 0;
    report.plannedDemotes += plan.demoteIds.length;

    const t = perTenant.get(c.tenantId) ?? { driftCases: 0, zeroResponsible: 0, multiResponsible: 0 };
    t.driftCases++;
    if (plan.kind === "ZERO_RESPONSIBLE") t.zeroResponsible++;
    else t.multiResponsible++;
    perTenant.set(c.tenantId, t);

    report.cases.push({
      caseId: c.id,
      fileNumber: c.fileNumber,
      tenantId: c.tenantId,
      kind: plan.kind,
      lawyerCount: plan.lawyerCount,
      responsibleBefore: plan.responsibleBefore,
      keepId: plan.keepId,
      demotedIds: plan.demoteIds,
    });

    if (opts.apply) {
      await prisma.$transaction(async (tx) => {
        if (plan.keepId) {
          await tx.caseLawyer.update({
            where: { id: plan.keepId },
            data: { isResponsible: true, role: "RESPONSIBLE" },
          });
        }
        for (const demoteId of plan.demoteIds) {
          await tx.caseLawyer.update({
            where: { id: demoteId },
            data: { isResponsible: false, role: "ASSIGNED" },
          });
        }
      });
      report.appliedPromotes += plan.keepId ? 1 : 0;
      report.appliedDemotes += plan.demoteIds.length;
      log(`# FIXED ${c.fileNumber ?? c.id} [${plan.kind}] keep=${plan.keepId} demote=${plan.demoteIds.length}`);
    } else {
      log(`# DRIFT ${c.fileNumber ?? c.id} [${plan.kind}] keep=${plan.keepId} demote=${plan.demoteIds.length}`);
    }
  }

  report.perTenant = Array.from(perTenant.entries()).map(([tenantId, v]) => ({ tenantId, ...v }));
  return report;
}
