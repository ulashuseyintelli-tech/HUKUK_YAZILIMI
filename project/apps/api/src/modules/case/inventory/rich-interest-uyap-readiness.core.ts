/**
 * PR-A4-0 — tenant-scoped, deterministic, READ-ONLY rich-interest/UYAP inventory.
 *
 * This module does not import or invoke either UYAP exporter. Their current
 * legacy projections are modelled as observed diagnostics only; no mapping in
 * this file is projection authority or owner acceptance.
 */

export const CANONICAL_RICH_INTEREST_CODES = [
  'LEGAL_3095',
  'COMMERCIAL_AVANS_3095_2_2',
  'COMMERCIAL_FIXED',
  'TTK_1530',
  'CONTRACTUAL',
  'MEVDUAT_TL_BANKALARCA',
  'MEVDUAT_USD_BANKALARCA',
  'MEVDUAT_EUR_BANKALARCA',
  'MEVDUAT_TL_KAMU',
  'MEVDUAT_USD_KAMU',
  'MEVDUAT_EUR_KAMU',
] as const;

export type CanonicalRichInterestCode = (typeof CANONICAL_RICH_INTEREST_CODES)[number];

export const INTEGRITY_CLASSES = [
  'RICH_ONLY',
  'LEGACY_ONLY',
  'RICH_AND_LEGACY_MATCH',
  'RICH_AND_LEGACY_DRIFT',
  'NO_INTEREST_VALID',
  'NO_INTEREST_CONFLICT',
  'NO_INTEREST_AUDIT_INCOMPLETE',
  'FIXED_RATE_VALID',
  'FIXED_RATE_MISSING',
  'FIXED_RATE_INVALID',
  'VARIABLE_RATE_WITH_STRAY_FIXED_RATE',
  'UNSUPPORTED_LEGACY',
  'NO_INTEREST_AUTHORITY',
  'NO_CLAIMITEM_INTEREST_AUTHORITY',
] as const;

export type RichInterestIntegrityClass = (typeof INTEGRITY_CLASSES)[number];

export const UYAP_READINESS_CLASSES = [
  'UYAP_READY_EXACT',
  'UYAP_READY_ONLY_IN_NUMERIC_EXPORTER',
  'UYAP_READY_ONLY_IN_FAIZT_EXPORTER',
  'UYAP_EXPORTER_CONFLICT',
  'UYAP_MAPPING_MISSING',
  'UYAP_MAPPING_AMBIGUOUS',
  'UYAP_DEPOSIT_TERM_AMBIGUOUS',
  'UYAP_CONTRACTUAL_MAPPING_MISSING',
  'UYAP_COMMERCIAL_FIXED_MAPPING_MISSING',
  'UYAP_UNSUPPORTED_RICH_CODE',
  'UYAP_LEGACY_ONLY_COMPATIBILITY',
  'UYAP_SILENT_FALLBACK_RISK',
  'UYAP_NO_INTEREST',
] as const;

export type UyapReadinessClass = (typeof UYAP_READINESS_CLASSES)[number];
export type DepositTermEvidence = 'SHORT' | 'LONG' | 'UNRECOGNIZED_PRESENT' | null;
export type ExporterComparison = 'BOTH_OMITTED' | 'NUMERIC_ONLY' | 'FAIZT_ONLY' | 'EQUIVALENT' | 'CONFLICT';

export interface RichInterestUyapInventoryRow {
  tenantId: string;
  caseTenantId: string | null;
  caseId: string;
  claimItemId: string;
  itemType: string;
  status: string;
  currency: string;
  richCode: string | null;
  legacyType: string | null;
  interestRate: string | number | null;
  accrualStatus: string;
  interestStartDate: string | null;
  interestEndDate: string | null;
  interestStartDateProvenance: string | null;
  noInterestReasonPresent: boolean;
  noInterestActorPresent: boolean;
  noInterestTimePresent: boolean;
  caseLegacyType: string | null;
  linkedDueId: string | null;
  dueRichCode: string | null;
  dueLegacyType: string | null;
  dueInterestStartDate: string | null;
  depositTermEvidence: DepositTermEvidence;
  maturityPresent: boolean;
  termDurationPresent: boolean;
  rateScheduleSourcePresent: boolean;
  legacyUyapCodeProvenance: string | null;
}

export interface ExporterProjectionObservation {
  exporterId: 'NUMERIC_CLAIMITEM_LEGACY' | 'FAIZT_DUE_LEGACY';
  codeSpace: 'NUMERIC_1_99' | 'FAIZT000XX';
  sourceField: 'ClaimItem.interestType' | 'Due.interestType';
  outputCode: string | null;
  semantic: string | null;
  silentFallback: boolean;
  omittedReason?: 'NO_SOURCE_TYPE' | 'MISSING_START_DATE';
}

export const ACTIVE_UYAP_EXPORTER_MODELS = [
  {
    exporterId: 'NUMERIC_CLAIMITEM_LEGACY',
    codeSpace: 'NUMERIC_1_99',
    sourceField: 'ClaimItem.interestType',
    readsRichCode: false,
    directlySupportedCanonicalRichCodes: [],
    unsupportedCanonicalRichCodes: CANONICAL_RICH_INTEREST_CODES,
    observedLegacyTypes: ['AKIT', 'AVANS', 'MEVDUAT', 'REESKONT', 'TEMERRUT', 'TICARI', 'YASAL'],
    ambiguousLegacyMappings: ['TEMERRUT/TICARI -> GENERIC_COMMERCIAL_DEFAULT'],
    silentFallbackCode: '99',
  },
  {
    exporterId: 'FAIZT_DUE_LEGACY',
    codeSpace: 'FAIZT000XX',
    sourceField: 'Due.interestType',
    readsRichCode: false,
    directlySupportedCanonicalRichCodes: [],
    unsupportedCanonicalRichCodes: CANONICAL_RICH_INTEREST_CODES,
    observedLegacyTypes: [
      'AVANS', 'BANKA_MEVDUAT', 'KAMU_BANKASI', 'KREDI_KARTI_AKDI',
      'KREDI_KARTI_GECIKME', 'OZEL', 'REESKONT', 'TEMERRUT', 'TICARI', 'YASAL',
    ],
    ambiguousLegacyMappings: [
      'TEMERRUT -> LEGAL_3095',
      'TICARI -> TTK_1530',
      'BANKA_MEVDUAT/KAMU_BANKASI -> currency-and-term-specific rich code unknown',
    ],
    silentFallbackCode: 'FAIZT00003',
  },
] as const;

export interface RichInterestUyapFinding {
  tenantId: string;
  caseId: string;
  claimItemId: string;
  richCode: string | null;
  legacyType: string | null;
  interestRate: string | number | null;
  accrualStatus: string;
  integrityClasses: RichInterestIntegrityClass[];
  numericExporter: ExporterProjectionObservation;
  faiztExporter: ExporterProjectionObservation;
  exporterComparison: ExporterComparison;
  uyapReadinessClasses: UyapReadinessClass[];
  diagnosticReasons: string[];
  depositEvidence: {
    explicitTerm: DepositTermEvidence;
    maturityPresent: boolean;
    termDurationPresent: boolean;
    rateScheduleSourcePresent: boolean;
    legacyUyapCodeProvenance: string | null;
    interestStartPresent: boolean;
    interestEndPresent: boolean;
  };
}

export interface RichCodeCoverageSummary {
  recordCount: number;
  tenantCount: number;
  caseCount: number;
  richOnlyCount: number;
  matchingMirrorCount: number;
  mirrorDriftCount: number;
  fixedRateInvalidCount: number;
  uyapReadinessDistribution: Record<UyapReadinessClass, number>;
}

export interface RichInterestUyapInventorySummary {
  inventoryVersion: 'PR-A4-0-v1';
  mode: 'READ_ONLY';
  tenantId: string;
  pageSize: number;
  processedRecordCount: number;
  richCodeCoverage: Record<CanonicalRichInterestCode, RichCodeCoverageSummary>;
  integrityDistribution: Record<RichInterestIntegrityClass, number>;
  uyapReadinessDistribution: Record<UyapReadinessClass, number>;
  exporterComparisonDistribution: Record<ExporterComparison, number>;
  exporterConflictCount: number;
  ambiguousDepositCount: number;
  contractualBlockerCount: number;
  commercialFixedBlockerCount: number;
  exporterModels: typeof ACTIVE_UYAP_EXPORTER_MODELS;
  realTenantExecution: 'CALLER_CONTROLLED_SEPARATE_AUTHORIZATION_REQUIRED';
  exactUyapMapping: 'NOT_FROZEN';
}

const RICH_CODE_SET = new Set<string>(CANONICAL_RICH_INTEREST_CODES);
const FIXED_CODES = new Set<string>(['COMMERCIAL_FIXED', 'CONTRACTUAL']);
const DEPOSIT_CODES = new Set<string>(CANONICAL_RICH_INTEREST_CODES.filter((code) => code.startsWith('MEVDUAT_')));
const SUPPORTED_CLAIMITEM_EXPORTER_LEGACY = new Set(['YASAL', 'TICARI', 'TEMERRUT', 'AVANS']);
const EXPECTED_LEGACY_MIRROR: Partial<Record<CanonicalRichInterestCode, string>> = {
  LEGAL_3095: 'YASAL',
  COMMERCIAL_AVANS_3095_2_2: 'TICARI',
  COMMERCIAL_FIXED: 'SABIT',
};

const NUMERIC_LEGACY_MAPPING: Record<string, { code: string; semantic: string }> = {
  YASAL: { code: '1', semantic: 'LEGAL_3095' },
  TICARI: { code: '2', semantic: 'GENERIC_COMMERCIAL_DEFAULT' },
  TEMERRUT: { code: '2', semantic: 'GENERIC_COMMERCIAL_DEFAULT' },
  REESKONT: { code: '3', semantic: 'REESKONT' },
  AVANS: { code: '4', semantic: 'COMMERCIAL_AVANS_3095_2_2' },
  MEVDUAT: { code: '5', semantic: 'GENERIC_DEPOSIT' },
  AKIT: { code: '6', semantic: 'CONTRACTUAL' },
};

const FAIZT_LEGACY_MAPPING: Record<string, { code: string; semantic: string }> = {
  YASAL: { code: 'FAIZT00002', semantic: 'LEGAL_3095' },
  TICARI: { code: 'FAIZT00017', semantic: 'TTK_1530' },
  AVANS: { code: 'FAIZT00007', semantic: 'COMMERCIAL_AVANS_3095_2_2' },
  TEMERRUT: { code: 'FAIZT00002', semantic: 'LEGAL_3095' },
  BANKA_MEVDUAT: { code: 'FAIZT00011', semantic: 'MEVDUAT_TL_BANKALARCA_SHORT' },
  KAMU_BANKASI: { code: 'FAIZT00026', semantic: 'MEVDUAT_TL_KAMU_SHORT' },
  KREDI_KARTI_AKDI: { code: 'FAIZT00018', semantic: 'CREDIT_CARD_CONTRACTUAL_TRY' },
  KREDI_KARTI_GECIKME: { code: 'FAIZT00021', semantic: 'CREDIT_CARD_DEFAULT_TRY' },
  REESKONT: { code: 'FAIZT00001', semantic: 'REESKONT' },
  OZEL: { code: 'FAIZT00003', semantic: 'OTHER' },
};

function emptyCounts<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

function normalizeRate(value: string | number | null): number | null {
  if (value === null || value === '') return null;
  return typeof value === 'number' ? value : Number(value);
}

function numericProjection(legacyType: string | null): ExporterProjectionObservation {
  if (!legacyType) {
    return {
      exporterId: 'NUMERIC_CLAIMITEM_LEGACY', codeSpace: 'NUMERIC_1_99',
      sourceField: 'ClaimItem.interestType', outputCode: null, semantic: null,
      silentFallback: false, omittedReason: 'NO_SOURCE_TYPE',
    };
  }
  const mapped = NUMERIC_LEGACY_MAPPING[legacyType];
  return {
    exporterId: 'NUMERIC_CLAIMITEM_LEGACY', codeSpace: 'NUMERIC_1_99',
    sourceField: 'ClaimItem.interestType', outputCode: mapped?.code ?? '99',
    semantic: mapped?.semantic ?? 'OTHER', silentFallback: !mapped,
  };
}

function faiztProjection(legacyType: string | null, startDate: string | null): ExporterProjectionObservation {
  if (!legacyType) {
    return {
      exporterId: 'FAIZT_DUE_LEGACY', codeSpace: 'FAIZT000XX',
      sourceField: 'Due.interestType', outputCode: null, semantic: null,
      silentFallback: false, omittedReason: 'NO_SOURCE_TYPE',
    };
  }
  if (!startDate) {
    return {
      exporterId: 'FAIZT_DUE_LEGACY', codeSpace: 'FAIZT000XX',
      sourceField: 'Due.interestType', outputCode: null, semantic: null,
      silentFallback: false, omittedReason: 'MISSING_START_DATE',
    };
  }
  const mapped = FAIZT_LEGACY_MAPPING[legacyType];
  return {
    exporterId: 'FAIZT_DUE_LEGACY', codeSpace: 'FAIZT000XX',
    sourceField: 'Due.interestType', outputCode: mapped?.code ?? 'FAIZT00003',
    semantic: mapped?.semantic ?? 'OTHER', silentFallback: !mapped,
  };
}

function compareExporterObservations(
  numeric: ExporterProjectionObservation,
  faizt: ExporterProjectionObservation,
): ExporterComparison {
  if (!numeric.outputCode && !faizt.outputCode) return 'BOTH_OMITTED';
  if (numeric.outputCode && !faizt.outputCode) return 'NUMERIC_ONLY';
  if (!numeric.outputCode && faizt.outputCode) return 'FAIZT_ONLY';
  return numeric.semantic === faizt.semantic && !numeric.silentFallback && !faizt.silentFallback
    ? 'EQUIVALENT'
    : 'CONFLICT';
}

function sortedUnique<T extends string>(items: T[], order: readonly T[]): T[] {
  const positions = new Map(order.map((item, index) => [item, index]));
  return [...new Set(items)].sort((a, b) => (positions.get(a) ?? 999) - (positions.get(b) ?? 999));
}

export function classifyRichInterestUyapReadiness(row: RichInterestUyapInventoryRow): RichInterestUyapFinding {
  if (!row.tenantId.trim()) throw new Error('tenantId zorunludur.');
  const integrity: RichInterestIntegrityClass[] = [];
  const readiness: UyapReadinessClass[] = [];
  const reasons: string[] = [];
  const rich = row.richCode;
  const legacy = row.legacyType;
  const rate = normalizeRate(row.interestRate);

  if (row.caseTenantId !== row.tenantId) reasons.push('TENANT_CASE_SCOPE_MISMATCH');

  if (rich && !legacy) integrity.push('RICH_ONLY');
  if (!rich && legacy) integrity.push('LEGACY_ONLY');
  if (rich && legacy) {
    const expected = RICH_CODE_SET.has(rich)
      ? EXPECTED_LEGACY_MIRROR[rich as CanonicalRichInterestCode]
      : undefined;
    if (expected === legacy) integrity.push('RICH_AND_LEGACY_MATCH');
    else {
      integrity.push('RICH_AND_LEGACY_DRIFT');
      reasons.push('RICH_LEGACY_MIRROR_DRIFT');
    }
  }
  if (legacy && !SUPPORTED_CLAIMITEM_EXPORTER_LEGACY.has(legacy)) integrity.push('UNSUPPORTED_LEGACY');

  const hasInterestConfig = Boolean(rich || legacy || rate !== null || row.interestStartDate || row.interestStartDateProvenance);
  if (row.accrualStatus === 'NO_INTEREST') {
    integrity.push('NO_INTEREST_AUTHORITY');
    readiness.push('UYAP_NO_INTEREST');
    if (hasInterestConfig) {
      integrity.push('NO_INTEREST_CONFLICT');
      reasons.push('NO_INTEREST_WITH_INTEREST_CONFIGURATION');
    } else {
      integrity.push('NO_INTEREST_VALID');
    }
    if (row.itemType === 'PRINCIPAL' &&
        !(row.noInterestReasonPresent && row.noInterestActorPresent && row.noInterestTimePresent)) {
      integrity.push('NO_INTEREST_AUDIT_INCOMPLETE');
      reasons.push('PRINCIPAL_NO_INTEREST_AUDIT_INCOMPLETE');
    }
  } else if (!rich && !legacy) {
    integrity.push('NO_CLAIMITEM_INTEREST_AUTHORITY');
    reasons.push('NO_CLAIMITEM_INTEREST_AUTHORITY');
  }

  if (rich && FIXED_CODES.has(rich)) {
    if (rate === null) integrity.push('FIXED_RATE_MISSING');
    else if (!Number.isFinite(rate) || rate <= 0) integrity.push('FIXED_RATE_INVALID');
    else integrity.push('FIXED_RATE_VALID');
  } else if (rich && rate !== null) {
    integrity.push('VARIABLE_RATE_WITH_STRAY_FIXED_RATE');
  }

  const numeric = numericProjection(legacy);
  const faizt = faiztProjection(row.dueLegacyType, row.dueInterestStartDate);
  const comparison = compareExporterObservations(numeric, faizt);

  if (row.accrualStatus !== 'NO_INTEREST') {
    if (comparison === 'NUMERIC_ONLY') readiness.push('UYAP_READY_ONLY_IN_NUMERIC_EXPORTER');
    else if (comparison === 'FAIZT_ONLY') readiness.push('UYAP_READY_ONLY_IN_FAIZT_EXPORTER');
    else if (comparison === 'EQUIVALENT') readiness.push('UYAP_READY_EXACT');
    else if (comparison === 'CONFLICT') readiness.push('UYAP_EXPORTER_CONFLICT');
    else readiness.push('UYAP_MAPPING_MISSING');

    if (numeric.silentFallback || faizt.silentFallback) readiness.push('UYAP_SILENT_FALLBACK_RISK');
    if (!rich && legacy) readiness.push('UYAP_LEGACY_ONLY_COMPATIBILITY');
    if (rich && !RICH_CODE_SET.has(rich)) readiness.push('UYAP_UNSUPPORTED_RICH_CODE');

    if (rich && DEPOSIT_CODES.has(rich)) {
      if (row.depositTermEvidence !== 'SHORT' && row.depositTermEvidence !== 'LONG') {
        readiness.push('UYAP_DEPOSIT_TERM_AMBIGUOUS', 'UYAP_MAPPING_AMBIGUOUS');
        reasons.push('DEPOSIT_TERM_NOT_EXPLICIT_NO_INFERENCE');
      } else {
        readiness.push('UYAP_MAPPING_MISSING');
        reasons.push(`DEPOSIT_TERM_EXPLICIT_${row.depositTermEvidence}_MAPPING_NOT_FROZEN`);
      }
    }
    if (rich === 'CONTRACTUAL') {
      readiness.push('UYAP_CONTRACTUAL_MAPPING_MISSING', 'UYAP_MAPPING_MISSING');
      reasons.push('CONTRACTUAL_EXACT_MAPPING_NOT_FROZEN');
    }
    if (rich === 'COMMERCIAL_FIXED') {
      readiness.push('UYAP_COMMERCIAL_FIXED_MAPPING_MISSING', 'UYAP_MAPPING_MISSING');
      reasons.push('COMMERCIAL_FIXED_EXACT_MAPPING_NOT_FROZEN');
    }
  }

  if (row.accrualStatus === 'ACCRUES' && !row.interestStartDate) {
    reasons.push('ACCRUES_WITHOUT_INTEREST_START_DATE');
    readiness.push('UYAP_MAPPING_MISSING');
  }
  if (rich && row.dueRichCode && rich !== row.dueRichCode) reasons.push('CLAIMITEM_DUE_RICH_CODE_DRIFT');
  if (row.linkedDueId && row.dueLegacyType !== legacy) reasons.push('CLAIMITEM_DUE_LEGACY_TYPE_DRIFT');

  return {
    tenantId: row.tenantId,
    caseId: row.caseId,
    claimItemId: row.claimItemId,
    richCode: rich,
    legacyType: legacy,
    interestRate: row.interestRate,
    accrualStatus: row.accrualStatus,
    integrityClasses: sortedUnique(integrity, INTEGRITY_CLASSES),
    numericExporter: numeric,
    faiztExporter: faizt,
    exporterComparison: comparison,
    uyapReadinessClasses: sortedUnique(readiness, UYAP_READINESS_CLASSES),
    diagnosticReasons: [...new Set(reasons)].sort(),
    depositEvidence: {
      explicitTerm: row.depositTermEvidence,
      maturityPresent: row.maturityPresent,
      termDurationPresent: row.termDurationPresent,
      rateScheduleSourcePresent: row.rateScheduleSourcePresent,
      legacyUyapCodeProvenance: row.legacyUyapCodeProvenance,
      interestStartPresent: row.interestStartDate !== null,
      interestEndPresent: row.interestEndDate !== null,
    },
  };
}

export interface RichInterestInventoryDatabaseRow {
  tenant_id: string;
  case_tenant_id: string | null;
  case_id: string;
  claim_item_id: string;
  item_type: string;
  status: string;
  currency: string;
  rich_code: string | null;
  legacy_type: string | null;
  interest_rate: string | null;
  accrual_status: string;
  interest_start_date: string | null;
  interest_end_date: string | null;
  interest_start_date_provenance: string | null;
  no_interest_reason_present: boolean;
  no_interest_actor_present: boolean;
  no_interest_time_present: boolean;
  case_legacy_type: string | null;
  linked_due_id: string | null;
  due_rich_code: string | null;
  due_legacy_type: string | null;
  due_interest_start_date: string | null;
  deposit_term_evidence: DepositTermEvidence;
  maturity_present: boolean;
  term_duration_present: boolean;
  rate_schedule_source_present: boolean;
  legacy_uyap_code_provenance: string | null;
}

export interface RichCodeCaseCountRow {
  rich_code: string;
  case_count: string | number;
}

export function databaseRowToInventoryRow(row: RichInterestInventoryDatabaseRow): RichInterestUyapInventoryRow {
  return {
    tenantId: row.tenant_id, caseTenantId: row.case_tenant_id, caseId: row.case_id,
    claimItemId: row.claim_item_id, itemType: row.item_type, status: row.status,
    currency: row.currency, richCode: row.rich_code, legacyType: row.legacy_type,
    interestRate: row.interest_rate, accrualStatus: row.accrual_status,
    interestStartDate: row.interest_start_date, interestEndDate: row.interest_end_date,
    interestStartDateProvenance: row.interest_start_date_provenance,
    noInterestReasonPresent: row.no_interest_reason_present,
    noInterestActorPresent: row.no_interest_actor_present,
    noInterestTimePresent: row.no_interest_time_present,
    caseLegacyType: row.case_legacy_type, linkedDueId: row.linked_due_id,
    dueRichCode: row.due_rich_code, dueLegacyType: row.due_legacy_type,
    dueInterestStartDate: row.due_interest_start_date,
    depositTermEvidence: row.deposit_term_evidence, maturityPresent: row.maturity_present,
    termDurationPresent: row.term_duration_present,
    rateScheduleSourcePresent: row.rate_schedule_source_present,
    legacyUyapCodeProvenance: row.legacy_uyap_code_provenance,
  };
}

export const RICH_INTEREST_CASE_COUNTS_SQL = `
WITH scoped_claim_items AS (
  SELECT ci."interestTypeCode"::text AS rich_code, ci."caseId" AS case_id
  FROM "ClaimItem" ci
  INNER JOIN "Case" c ON c.id = ci."caseId" AND c."tenantId" = $1
  WHERE ci."tenantId" = $1
)
SELECT rich_code, COUNT(DISTINCT case_id)::text AS case_count
FROM scoped_claim_items
WHERE rich_code IS NOT NULL
GROUP BY rich_code
ORDER BY rich_code;
`;

export const RICH_INTEREST_UYAP_PAGE_SQL = `
WITH claim_page AS (
  SELECT ci.*
  FROM "ClaimItem" ci
  WHERE ci."tenantId" = $1 AND ci.id > $2
  ORDER BY ci.id
  LIMIT $3
), projected AS (
  SELECT
    ci."tenantId" AS tenant_id,
    c."tenantId" AS case_tenant_id,
    ci."caseId" AS case_id,
    ci.id AS claim_item_id,
    ci."itemType"::text AS item_type,
    ci.status::text AS status,
    ci.currency,
    ci."interestTypeCode"::text AS rich_code,
    ci."interestType"::text AS legacy_type,
    ci."interestRate"::text AS interest_rate,
    ci."interestAccrualStatus"::text AS accrual_status,
    to_char(ci."interestStartDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS interest_start_date,
    to_char(ci."interestEndDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS interest_end_date,
    ci."interestStartDateProvenance"::text AS interest_start_date_provenance,
    ci."noInterestReason" IS NOT NULL AS no_interest_reason_present,
    ci."noInterestConfirmedById" IS NOT NULL AS no_interest_actor_present,
    ci."noInterestConfirmedAt" IS NOT NULL AS no_interest_time_present,
    c."interestType"::text AS case_legacy_type,
    d.id AS linked_due_id,
    d."interestTypeCode"::text AS due_rich_code,
    d."interestType"::text AS due_legacy_type,
    to_char(d."interestStartDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS due_interest_start_date,
    CASE
      WHEN upper(COALESCE(ci.metadata #>> '{uyap,depositTerm}', ci.metadata #>> '{interest,depositTerm}', ci.metadata #>> '{depositTerm}')) IN ('SHORT', 'KISA', 'UP_TO_ONE_YEAR') THEN 'SHORT'
      WHEN upper(COALESCE(ci.metadata #>> '{uyap,depositTerm}', ci.metadata #>> '{interest,depositTerm}', ci.metadata #>> '{depositTerm}')) IN ('LONG', 'UZUN', 'ONE_YEAR_OR_MORE') THEN 'LONG'
      WHEN COALESCE(ci.metadata #>> '{uyap,depositTerm}', ci.metadata #>> '{interest,depositTerm}', ci.metadata #>> '{depositTerm}') IS NOT NULL THEN 'UNRECOGNIZED_PRESENT'
      ELSE NULL
    END AS deposit_term_evidence,
    (ci."dueDate" IS NOT NULL OR inst."maturityDate" IS NOT NULL) AS maturity_present,
    (ci.metadata #>> '{uyap,termDuration}' IS NOT NULL OR ci.metadata #>> '{interest,termDuration}' IS NOT NULL) AS term_duration_present,
    (ci.metadata #>> '{uyap,rateScheduleSource}' IS NOT NULL OR ci.metadata #>> '{interest,rateScheduleSource}' IS NOT NULL) AS rate_schedule_source_present,
    CASE
      WHEN COALESCE(ci.metadata #>> '{uyap,interestCode}', ci.metadata #>> '{legacyUyapInterestCode}') ~ '^(FAIZT[0-9]{5}|[0-9]{1,2})$'
        THEN COALESCE(ci.metadata #>> '{uyap,interestCode}', ci.metadata #>> '{legacyUyapInterestCode}')
      WHEN COALESCE(ci.metadata #>> '{uyap,interestCode}', ci.metadata #>> '{legacyUyapInterestCode}') IS NOT NULL
        THEN 'UNRECOGNIZED_PRESENT'
      ELSE NULL
    END AS legacy_uyap_code_provenance
  FROM claim_page ci
  LEFT JOIN "Case" c ON c.id = ci."caseId" AND c."tenantId" = $1
  LEFT JOIN "CaseInstrument" inst
    ON inst.id = ci."instrumentId"
   AND inst."caseId" = ci."caseId"
   AND inst."tenantId" = $1
  LEFT JOIN "Due" d
    ON d.id = COALESCE(ci.metadata #>> '{dueSync,sourceDueId}', ci.metadata #>> '{backfill,sourceDueId}')
   AND d."caseId" = ci."caseId"
)
SELECT * FROM projected ORDER BY claim_item_id;
`;

export const READ_ONLY_REPEATABLE_READ_SQL = 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY';

export interface ReadOnlyRichInterestTransaction {
  $executeRawUnsafe(query: string): Promise<unknown>;
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
}

export interface ReadOnlyRichInterestPrisma {
  $transaction<T>(callback: (tx: ReadOnlyRichInterestTransaction) => Promise<T>): Promise<T>;
}

function emptyCoverage(caseCounts: Map<string, number>): Record<CanonicalRichInterestCode, RichCodeCoverageSummary> {
  return Object.fromEntries(CANONICAL_RICH_INTEREST_CODES.map((code) => [code, {
    recordCount: 0, tenantCount: 0, caseCount: caseCounts.get(code) ?? 0,
    richOnlyCount: 0, matchingMirrorCount: 0, mirrorDriftCount: 0,
    fixedRateInvalidCount: 0, uyapReadinessDistribution: emptyCounts(UYAP_READINESS_CLASSES),
  }])) as Record<CanonicalRichInterestCode, RichCodeCoverageSummary>;
}

export async function runReadOnlyRichInterestUyapInventory(
  prisma: ReadOnlyRichInterestPrisma,
  options: {
    tenantId: string;
    pageSize?: number;
    onFinding?: (finding: RichInterestUyapFinding) => void | Promise<void>;
  },
): Promise<RichInterestUyapInventorySummary> {
  const tenantId = options.tenantId.trim();
  const pageSize = options.pageSize ?? 250;
  if (!tenantId) throw new Error('--tenant zorunludur.');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error('pageSize 1..1000 aralığında tam sayı olmalıdır.');
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(READ_ONLY_REPEATABLE_READ_SQL);
    const caseCountRows = await tx.$queryRawUnsafe<RichCodeCaseCountRow[]>(RICH_INTEREST_CASE_COUNTS_SQL, tenantId);
    const caseCounts = new Map(caseCountRows.map((row) => [row.rich_code, Number(row.case_count)]));
    const richCodeCoverage = emptyCoverage(caseCounts);
    const integrityDistribution = emptyCounts(INTEGRITY_CLASSES);
    const uyapReadinessDistribution = emptyCounts(UYAP_READINESS_CLASSES);
    const exporterComparisonDistribution = emptyCounts([
      'BOTH_OMITTED', 'NUMERIC_ONLY', 'FAIZT_ONLY', 'EQUIVALENT', 'CONFLICT',
    ] as const);
    let processedRecordCount = 0;
    let afterId = '';

    while (true) {
      const rows = await tx.$queryRawUnsafe<RichInterestInventoryDatabaseRow[]>(
        RICH_INTEREST_UYAP_PAGE_SQL, tenantId, afterId, pageSize,
      );
      if (rows.length === 0) break;
      for (const databaseRow of rows) {
        if (databaseRow.tenant_id !== tenantId || databaseRow.case_tenant_id !== tenantId) {
          throw new Error('Inventory tenant/case-scope ihlali.');
        }
        const finding = classifyRichInterestUyapReadiness(databaseRowToInventoryRow(databaseRow));
        processedRecordCount += 1;
        for (const classification of finding.integrityClasses) integrityDistribution[classification] += 1;
        for (const classification of finding.uyapReadinessClasses) uyapReadinessDistribution[classification] += 1;
        exporterComparisonDistribution[finding.exporterComparison] += 1;

        if (finding.richCode && RICH_CODE_SET.has(finding.richCode)) {
          const coverage = richCodeCoverage[finding.richCode as CanonicalRichInterestCode];
          coverage.recordCount += 1;
          coverage.tenantCount = 1;
          if (finding.integrityClasses.includes('RICH_ONLY')) coverage.richOnlyCount += 1;
          if (finding.integrityClasses.includes('RICH_AND_LEGACY_MATCH')) coverage.matchingMirrorCount += 1;
          if (finding.integrityClasses.includes('RICH_AND_LEGACY_DRIFT')) coverage.mirrorDriftCount += 1;
          if (finding.integrityClasses.includes('FIXED_RATE_MISSING') ||
              finding.integrityClasses.includes('FIXED_RATE_INVALID')) coverage.fixedRateInvalidCount += 1;
          for (const classification of finding.uyapReadinessClasses) {
            coverage.uyapReadinessDistribution[classification] += 1;
          }
        }
        if (options.onFinding) await options.onFinding(finding);
      }
      afterId = rows[rows.length - 1].claim_item_id;
      if (rows.length < pageSize) break;
    }

    return {
      inventoryVersion: 'PR-A4-0-v1', mode: 'READ_ONLY', tenantId, pageSize,
      processedRecordCount, richCodeCoverage, integrityDistribution,
      uyapReadinessDistribution, exporterComparisonDistribution,
      exporterConflictCount: exporterComparisonDistribution.CONFLICT,
      ambiguousDepositCount: uyapReadinessDistribution.UYAP_DEPOSIT_TERM_AMBIGUOUS,
      contractualBlockerCount: uyapReadinessDistribution.UYAP_CONTRACTUAL_MAPPING_MISSING,
      commercialFixedBlockerCount: uyapReadinessDistribution.UYAP_COMMERCIAL_FIXED_MAPPING_MISSING,
      exporterModels: ACTIVE_UYAP_EXPORTER_MODELS,
      realTenantExecution: 'CALLER_CONTROLLED_SEPARATE_AUTHORIZATION_REQUIRED',
      exactUyapMapping: 'NOT_FROZEN',
    };
  });
}
