/**
 * VER-05 / CAN-CUT-01 PR-0 — Due / ClaimItem READ-ONLY inventory core.
 *
 * This module deliberately has no apply, backfill, mutation, or heuristic-write
 * behavior. It classifies tenant-scoped rows already read by the thin Prisma
 * adapter and emits identifiers plus reasons only; descriptions and personal
 * data are never part of the report payload.
 */

export const INVENTORY_CLASSES = [
  'MATCHED_PAIR',
  'DUPLICATE_PAIR',
  'AMOUNT_OR_TYPE_DRIFT',
  'ORPHANED_SYNC',
  'MARKER_MISSING',
  'DUE_ONLY',
  'CLAIM_ITEM_ONLY',
  'NAFAKA_EXPECTED_DUE_ONLY',
  'EXPECTED_CANCELLED_TOMBSTONE',
] as const;

export type InventoryClass = (typeof INVENTORY_CLASSES)[number];
export type FindingConfidence = 'STRONG' | 'HEURISTIC';
export type MarkerKind = 'LIVE_SYNC' | 'BACKFILL' | 'BOTH_SAME_SOURCE' | 'CONFLICTING_MARKERS' | 'UNMARKED';

export interface DueInventoryRow {
  id: string;
  tenantId: string;
  caseId: string;
  type: string;
  amount: string | number;
  currency: string;
  dueDate: string | null;
  interestType?: string | null;
  interestRate?: string | number | null;
  interestStartDate?: string | null;
  interestEndDate?: string | null;
}

export interface ClaimItemInventoryRow {
  id: string;
  tenantId: string;
  caseId: string;
  /** Case row's tenant id. A mismatch is itself an inventory finding. */
  caseTenantId?: string | null;
  itemType: string;
  amount: string | number;
  originalAmount?: string | number | null;
  demandedAmount?: string | number | null;
  currency: string;
  dueDate: string | null;
  interestType?: string | null;
  interestRate?: string | number | null;
  interestStartDate?: string | null;
  interestEndDate?: string | null;
  status: string;
  dueSyncSourceDueId?: string | null;
  backfillSourceDueId?: string | null;
}

export interface InventoryFinding {
  classification: InventoryClass;
  confidence: FindingConfidence;
  tenantId: string;
  caseId: string;
  dueId?: string;
  claimItemIds: string[];
  markerKinds: MarkerKind[];
  reasons: string[];
}

export interface DueClaimItemInventoryReport {
  inventoryVersion: 'VER-05-PR-0';
  mode: 'READ_ONLY';
  tenantId: string;
  summary: {
    dueCount: number;
    claimItemCount: number;
    classifications: Record<InventoryClass, number>;
    markers: {
      dueSyncClaimItems: number;
      backfillClaimItems: number;
      bothSameSourceClaimItems: number;
      conflictingMarkerClaimItems: number;
      unmarkedClaimItems: number;
    };
  };
  findings: InventoryFinding[];
}

const DUE_TO_CLAIM_ITEM_TYPE: Record<string, string | null> = {
  PRINCIPAL: 'PRINCIPAL',
  INTEREST: 'INTEREST',
  EXPENSE: 'EXPENSE',
  VEKALET_UCRETI: 'ATTORNEY_FEE',
  HARC: 'FEE',
  TAZMINAT: 'PENALTY',
  CEZAI_SART: 'CONTRACTUAL_PENALTY',
  NAFAKA: null,
  KIRA: 'PRINCIPAL',
  AIDAT: 'PRINCIPAL',
  KOMISYON: 'EXPENSE',
  PRIM: 'PRINCIPAL',
  OTHER: 'OTHER',
};

interface MarkerInfo {
  kind: MarkerKind;
  sourceDueId?: string;
}

function markerInfo(item: ClaimItemInventoryRow): MarkerInfo {
  const dueSync = item.dueSyncSourceDueId || undefined;
  const backfill = item.backfillSourceDueId || undefined;
  if (dueSync && backfill) {
    return dueSync === backfill
      ? { kind: 'BOTH_SAME_SOURCE', sourceDueId: dueSync }
      : { kind: 'CONFLICTING_MARKERS' };
  }
  if (dueSync) return { kind: 'LIVE_SYNC', sourceDueId: dueSync };
  if (backfill) return { kind: 'BACKFILL', sourceDueId: backfill };
  return { kind: 'UNMARKED' };
}

function normalizeDecimal(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return text;
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [wholeRaw, fractionRaw = ''] = unsigned.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const fraction = fractionRaw.replace(/0+$/, '');
  return `${negative && whole !== '0' ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

function same(valueA: string | number | null | undefined, valueB: string | number | null | undefined): boolean {
  return normalizeDecimal(valueA) === normalizeDecimal(valueB);
}

function sameDate(valueA: string | null | undefined, valueB: string | null | undefined): boolean {
  return normalizeDate(valueA) === normalizeDate(valueB);
}

function assertTenantScope(tenantId: string, dues: DueInventoryRow[], claimItems: ClaimItemInventoryRow[]) {
  if (!tenantId.trim()) throw new Error('--tenant zorunludur.');
  for (const row of [...dues, ...claimItems]) {
    if (row.tenantId !== tenantId) throw new Error('Inventory girdisi tenant-scope dışı satır içeriyor.');
  }
}

function expectedItemType(due: DueInventoryRow): string | null {
  const mapped = DUE_TO_CLAIM_ITEM_TYPE[due.type];
  if (mapped === undefined) throw new Error(`Eşlenmemiş DueType: ${due.type}`);
  return mapped;
}

function isExactUnmarkedCandidate(due: DueInventoryRow, claimItem: ClaimItemInventoryRow, expectedType: string): boolean {
  return (
    claimItem.caseId === due.caseId &&
    claimItem.itemType === expectedType &&
    claimItem.status === 'ACTIVE' &&
    same(claimItem.amount, due.amount) &&
    claimItem.currency === due.currency &&
    sameDate(claimItem.dueDate, due.dueDate) &&
    (claimItem.interestType ?? null) === (due.interestType ?? null) &&
    same(claimItem.interestRate, due.interestRate) &&
    sameDate(claimItem.interestStartDate, due.interestStartDate) &&
    sameDate(claimItem.interestEndDate, due.interestEndDate)
  );
}

function strongPairDriftReasons(due: DueInventoryRow, claimItem: ClaimItemInventoryRow, expectedType: string): string[] {
  const reasons: string[] = [];
  if (claimItem.caseId !== due.caseId) reasons.push('CASE_MISMATCH');
  if (claimItem.caseTenantId && claimItem.caseTenantId !== claimItem.tenantId) reasons.push('TENANT_CASE_SCOPE_MISMATCH');
  if (claimItem.itemType !== expectedType) reasons.push('ITEM_TYPE_MISMATCH');
  if (claimItem.status !== 'ACTIVE') reasons.push('CLAIM_ITEM_NOT_ACTIVE');
  if (!same(claimItem.amount, due.amount)) reasons.push('AMOUNT_MISMATCH');
  if (!same(claimItem.originalAmount, due.amount)) reasons.push('ORIGINAL_AMOUNT_MISMATCH');
  if (!same(claimItem.demandedAmount, due.amount)) reasons.push('DEMANDED_AMOUNT_MISMATCH');
  if (claimItem.currency !== due.currency) reasons.push('CURRENCY_MISMATCH');
  if (!sameDate(claimItem.dueDate, due.dueDate)) reasons.push('DUE_DATE_MISMATCH');
  if ((claimItem.interestType ?? null) !== (due.interestType ?? null)) reasons.push('INTEREST_TYPE_MISMATCH');
  if (!same(claimItem.interestRate, due.interestRate)) reasons.push('INTEREST_RATE_MISMATCH');
  if (!sameDate(claimItem.interestStartDate, due.interestStartDate)) reasons.push('INTEREST_START_DATE_MISMATCH');
  if (!sameDate(claimItem.interestEndDate, due.interestEndDate)) reasons.push('INTEREST_END_DATE_MISMATCH');
  return reasons;
}

function finding(input: Omit<InventoryFinding, 'claimItemIds' | 'markerKinds' | 'reasons'> & {
  claimItemIds?: string[];
  markerKinds?: MarkerKind[];
  reasons?: string[];
}): InventoryFinding {
  return {
    ...input,
    claimItemIds: [...(input.claimItemIds ?? [])].sort(),
    markerKinds: [...(input.markerKinds ?? [])].sort(),
    reasons: [...(input.reasons ?? [])].sort(),
  };
}

function emptyClassCounts(): Record<InventoryClass, number> {
  return Object.fromEntries(INVENTORY_CLASSES.map((classification) => [classification, 0])) as Record<InventoryClass, number>;
}

/** Pure classifier: heuristic output is manual-review evidence only. */
export function buildDueClaimItemInventory(params: {
  tenantId: string;
  dues: DueInventoryRow[];
  claimItems: ClaimItemInventoryRow[];
}): DueClaimItemInventoryReport {
  const { tenantId } = params;
  const dues = [...params.dues].sort((a, b) => a.caseId.localeCompare(b.caseId) || a.id.localeCompare(b.id));
  const claimItems = [...params.claimItems].sort((a, b) => a.caseId.localeCompare(b.caseId) || a.id.localeCompare(b.id));
  assertTenantScope(tenantId, dues, claimItems);

  const dueById = new Map(dues.map((due) => [due.id, due]));
  const markers = new Map(claimItems.map((item) => [item.id, markerInfo(item)]));
  const strongByDue = new Map<string, ClaimItemInventoryRow[]>();
  for (const item of claimItems) {
    const marker = markers.get(item.id)!;
    if (marker.sourceDueId) {
      const list = strongByDue.get(marker.sourceDueId) ?? [];
      list.push(item);
      strongByDue.set(marker.sourceDueId, list);
    }
  }

  const findings: InventoryFinding[] = [];
  const consumedClaimIds = new Set<string>();

  for (const item of claimItems) {
    const marker = markers.get(item.id)!;
    if (marker.kind === 'CONFLICTING_MARKERS') {
      consumedClaimIds.add(item.id);
      findings.push(finding({
        classification: 'ORPHANED_SYNC', confidence: 'STRONG', tenantId, caseId: item.caseId,
        claimItemIds: [item.id], markerKinds: [marker.kind], reasons: ['CONFLICTING_MARKER_SOURCES'],
      }));
    } else if (item.caseTenantId && item.caseTenantId !== item.tenantId) {
      consumedClaimIds.add(item.id);
      findings.push(finding({
        classification: 'ORPHANED_SYNC', confidence: 'STRONG', tenantId, caseId: item.caseId,
        claimItemIds: [item.id], markerKinds: [marker.kind], reasons: ['TENANT_CASE_SCOPE_MISMATCH'],
      }));
    }
  }

  for (const due of dues) {
    const expectedType = expectedItemType(due);
    const linked = (strongByDue.get(due.id) ?? []).filter((item) => !consumedClaimIds.has(item.id));

    if (expectedType === null) {
      if (linked.length === 0) {
        findings.push(finding({
          classification: 'NAFAKA_EXPECTED_DUE_ONLY', confidence: 'STRONG', tenantId, caseId: due.caseId,
          dueId: due.id, reasons: ['NAFAKA_DUE_ONLY_EXCEPTION'],
        }));
      } else {
        linked.forEach((item) => consumedClaimIds.add(item.id));
        findings.push(finding({
          classification: 'AMOUNT_OR_TYPE_DRIFT', confidence: 'STRONG', tenantId, caseId: due.caseId,
          dueId: due.id, claimItemIds: linked.map((item) => item.id),
          markerKinds: linked.map((item) => markers.get(item.id)!.kind), reasons: ['NAFAKA_HAS_CLAIM_ITEM_MARKER'],
        }));
      }
      continue;
    }

    if (linked.length > 1) {
      linked.forEach((item) => consumedClaimIds.add(item.id));
      findings.push(finding({
        classification: 'DUPLICATE_PAIR', confidence: 'STRONG', tenantId, caseId: due.caseId,
        dueId: due.id, claimItemIds: linked.map((item) => item.id),
        markerKinds: linked.map((item) => markers.get(item.id)!.kind), reasons: ['MULTIPLE_STRONG_MARKERS_FOR_DUE'],
      }));
      continue;
    }

    if (linked.length === 1) {
      const item = linked[0];
      consumedClaimIds.add(item.id);
      const reasons = strongPairDriftReasons(due, item, expectedType);
      findings.push(finding({
        classification: reasons.length === 0 ? 'MATCHED_PAIR' : 'AMOUNT_OR_TYPE_DRIFT',
        confidence: 'STRONG', tenantId, caseId: due.caseId, dueId: due.id,
        claimItemIds: [item.id], markerKinds: [markers.get(item.id)!.kind], reasons,
      }));
      continue;
    }

    const candidates = claimItems.filter((item) => {
      if (consumedClaimIds.has(item.id) || markers.get(item.id)!.kind !== 'UNMARKED') return false;
      return isExactUnmarkedCandidate(due, item, expectedType);
    });

    if (candidates.length === 0) {
      findings.push(finding({
        classification: 'DUE_ONLY', confidence: 'STRONG', tenantId, caseId: due.caseId,
        dueId: due.id, reasons: ['NO_MARKER_OR_EXACT_CLAIM_ITEM_CANDIDATE'],
      }));
    } else if (candidates.length === 1) {
      consumedClaimIds.add(candidates[0].id);
      findings.push(finding({
        classification: 'MARKER_MISSING', confidence: 'HEURISTIC', tenantId, caseId: due.caseId,
        dueId: due.id, claimItemIds: [candidates[0].id], markerKinds: ['UNMARKED'],
        reasons: ['ONE_EXACT_UNMARKED_CANDIDATE_NO_MUTATION_AUTHORITY'],
      }));
    } else {
      candidates.forEach((item) => consumedClaimIds.add(item.id));
      findings.push(finding({
        classification: 'DUPLICATE_PAIR', confidence: 'HEURISTIC', tenantId, caseId: due.caseId,
        dueId: due.id, claimItemIds: candidates.map((item) => item.id), markerKinds: ['UNMARKED'],
        reasons: ['MULTIPLE_EXACT_UNMARKED_CANDIDATES_NO_MUTATION_AUTHORITY'],
      }));
    }
  }

  for (const item of claimItems) {
    if (consumedClaimIds.has(item.id)) continue;
    const marker = markers.get(item.id)!;
    if (marker.sourceDueId && !dueById.has(marker.sourceDueId)) {
      findings.push(finding({
        classification: item.status === 'CANCELLED' ? 'EXPECTED_CANCELLED_TOMBSTONE' : 'ORPHANED_SYNC',
        confidence: 'STRONG', tenantId, caseId: item.caseId, claimItemIds: [item.id],
        markerKinds: [marker.kind],
        reasons: [item.status === 'CANCELLED' ? 'CANCELLED_MARKER_WITHOUT_DUE' : 'ACTIVE_MARKER_WITHOUT_DUE'],
      }));
      continue;
    }
    findings.push(finding({
      classification: 'CLAIM_ITEM_ONLY', confidence: 'STRONG', tenantId, caseId: item.caseId,
      claimItemIds: [item.id], markerKinds: [marker.kind], reasons: ['NO_DUE_PAIR_IN_TENANT_SCOPE'],
    }));
  }

  const classifications = emptyClassCounts();
  for (const item of findings) classifications[item.classification] += 1;
  const classOrder = new Map(INVENTORY_CLASSES.map((classification, index) => [classification, index]));
  findings.sort((a, b) =>
    (classOrder.get(a.classification)! - classOrder.get(b.classification)!) ||
    a.caseId.localeCompare(b.caseId) ||
    (a.dueId ?? '').localeCompare(b.dueId ?? '') ||
    a.claimItemIds.join(',').localeCompare(b.claimItemIds.join(',')),
  );

  const markerKinds = claimItems.map((item) => markers.get(item.id)!.kind);
  return {
    inventoryVersion: 'VER-05-PR-0',
    mode: 'READ_ONLY',
    tenantId,
    summary: {
      dueCount: dues.length,
      claimItemCount: claimItems.length,
      classifications,
      markers: {
        dueSyncClaimItems: markerKinds.filter((kind) => kind === 'LIVE_SYNC' || kind === 'BOTH_SAME_SOURCE').length,
        backfillClaimItems: markerKinds.filter((kind) => kind === 'BACKFILL' || kind === 'BOTH_SAME_SOURCE').length,
        bothSameSourceClaimItems: markerKinds.filter((kind) => kind === 'BOTH_SAME_SOURCE').length,
        conflictingMarkerClaimItems: markerKinds.filter((kind) => kind === 'CONFLICTING_MARKERS').length,
        unmarkedClaimItems: markerKinds.filter((kind) => kind === 'UNMARKED').length,
      },
    },
    findings,
  };
}

export interface InventoryDatabaseRow {
  row_kind: 'DUE' | 'CLAIM_ITEM';
  id: string;
  case_id: string;
  tenant_id: string;
  case_tenant_id: string | null;
  due_type: string | null;
  claim_item_type: string | null;
  amount: string;
  original_amount: string | null;
  demanded_amount: string | null;
  currency: string;
  due_date: string | null;
  interest_type: string | null;
  interest_rate: string | null;
  interest_start_date: string | null;
  interest_end_date: string | null;
  status: string | null;
  due_sync_source_due_id: string | null;
  backfill_source_due_id: string | null;
}

/** Converts the CTE result only; no metadata/descriptions are retained or emitted. */
export function rowsToInventoryInput(rows: InventoryDatabaseRow[], tenantId: string): {
  dues: DueInventoryRow[];
  claimItems: ClaimItemInventoryRow[];
} {
  const dues: DueInventoryRow[] = [];
  const claimItems: ClaimItemInventoryRow[] = [];
  for (const row of rows) {
    if (row.tenant_id !== tenantId) throw new Error('CTE tenant-scope ihlali tespit edildi.');
    if (row.row_kind === 'DUE') {
      if (!row.due_type) throw new Error('Due CTE satırında due_type eksik.');
      dues.push({
        id: row.id, tenantId: row.tenant_id, caseId: row.case_id, type: row.due_type,
        amount: row.amount, currency: row.currency, dueDate: row.due_date,
        interestType: row.interest_type, interestRate: row.interest_rate,
        interestStartDate: row.interest_start_date, interestEndDate: row.interest_end_date,
      });
    } else if (row.row_kind === 'CLAIM_ITEM') {
      if (!row.claim_item_type || !row.status) throw new Error('ClaimItem CTE satırında zorunlu alan eksik.');
      claimItems.push({
        id: row.id, tenantId: row.tenant_id, caseId: row.case_id, caseTenantId: row.case_tenant_id,
        itemType: row.claim_item_type, amount: row.amount, originalAmount: row.original_amount,
        demandedAmount: row.demanded_amount, currency: row.currency, dueDate: row.due_date,
        interestType: row.interest_type, interestRate: row.interest_rate,
        interestStartDate: row.interest_start_date, interestEndDate: row.interest_end_date,
        status: row.status, dueSyncSourceDueId: row.due_sync_source_due_id,
        backfillSourceDueId: row.backfill_source_due_id,
      });
    } else {
      throw new Error(`Bilinmeyen inventory row_kind: ${String(row.row_kind)}`);
    }
  }
  return { dues, claimItems };
}

/** Static PostgreSQL query: CTE/SELECT only; $1 is always the mandatory tenant id. */
export const DUE_CLAIM_ITEM_INVENTORY_SELECT_SQL = `
WITH tenant_cases AS (
  SELECT c.id AS case_id, c."tenantId" AS tenant_id
  FROM "Case" c
  WHERE c."tenantId" = $1
), inventory_rows AS (
  SELECT
    'DUE'::text AS row_kind,
    d.id,
    d."caseId" AS case_id,
    tc.tenant_id,
    tc.tenant_id AS case_tenant_id,
    d.type::text AS due_type,
    NULL::text AS claim_item_type,
    d.amount::text AS amount,
    NULL::text AS original_amount,
    NULL::text AS demanded_amount,
    d.currency,
    to_char(d."dueDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS due_date,
    d."interestType"::text AS interest_type,
    d."interestRate"::text AS interest_rate,
    to_char(d."interestStartDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS interest_start_date,
    to_char(d."interestEndDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS interest_end_date,
    NULL::text AS status,
    NULL::text AS due_sync_source_due_id,
    NULL::text AS backfill_source_due_id
  FROM "Due" d
  JOIN tenant_cases tc ON tc.case_id = d."caseId"

  UNION ALL

  SELECT
    'CLAIM_ITEM'::text AS row_kind,
    ci.id,
    ci."caseId" AS case_id,
    ci."tenantId" AS tenant_id,
    c."tenantId" AS case_tenant_id,
    NULL::text AS due_type,
    ci."itemType"::text AS claim_item_type,
    ci.amount::text AS amount,
    ci."originalAmount"::text AS original_amount,
    ci."demandedAmount"::text AS demanded_amount,
    ci.currency,
    to_char(ci."dueDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS due_date,
    ci."interestType"::text AS interest_type,
    ci."interestRate"::text AS interest_rate,
    to_char(ci."interestStartDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS interest_start_date,
    to_char(ci."interestEndDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS interest_end_date,
    ci.status::text AS status,
    ci.metadata #>> '{dueSync,sourceDueId}' AS due_sync_source_due_id,
    ci.metadata #>> '{backfill,sourceDueId}' AS backfill_source_due_id
  FROM "ClaimItem" ci
  LEFT JOIN "Case" c ON c.id = ci."caseId"
  WHERE ci."tenantId" = $1
)
SELECT *
FROM inventory_rows
ORDER BY row_kind, case_id, id;
`;

// PostgreSQL requires transaction modes after the isolation level to be
// comma-separated; keeping this as a constant makes the read-only guard
// visible to both the adapter and its no-write test.
export const READ_ONLY_REPEATABLE_READ_SQL = 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY';

export interface ReadOnlyInventoryTransaction {
  $executeRawUnsafe(query: string): Promise<unknown>;
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
}

export interface ReadOnlyInventoryPrisma {
  $transaction<T>(callback: (tx: ReadOnlyInventoryTransaction) => Promise<T>): Promise<T>;
}

/** The only database adapter. There is intentionally no apply pathway. */
export async function runReadOnlyDueClaimItemInventory(
  prisma: ReadOnlyInventoryPrisma,
  tenantId: string,
): Promise<DueClaimItemInventoryReport> {
  if (!tenantId.trim()) throw new Error('--tenant zorunludur.');
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(READ_ONLY_REPEATABLE_READ_SQL);
    const rows = await tx.$queryRawUnsafe<InventoryDatabaseRow[]>(DUE_CLAIM_ITEM_INVENTORY_SELECT_SQL, tenantId);
    const input = rowsToInventoryInput(rows, tenantId);
    return buildDueClaimItemInventory({ tenantId, ...input });
  });
}
