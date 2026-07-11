import { CANONICAL_RICH_INTEREST_CODES, type CanonicalRichInterestCode } from '../../../rich-interest-uyap-readiness.core';

export type ExecutionTier = 'PERSISTED_DB' | 'CLASSIFIER_ONLY';
export type DepositTerm = 'SHORT' | 'LONG' | null;

export interface RichInterestFixtureManifestEntry {
  fixtureId: string;
  description: string;
  executionTier: ExecutionTier;
  caseInput: { legacyInterestType: string; interestStartDate: string | null };
  claimItemInput: {
    itemType: string; status: string; currency: string; amount: string;
    richInterestTypeCode: string | null; legacyInterestType: string | null;
    interestRate: number | null; interestStartDate: string | null;
    interestStartDateProvenance: string | null; interestAccrualStatus: string;
    noInterestAudit: { reason: string | null; confirmedById: string | null; confirmedAt: string | null } | null;
    depositTermProvenance: DepositTerm;
  };
  classifierOnlyRate?: number;
  dueProjection?: { richInterestTypeCode: string | null; legacyInterestType: string | null; interestStartDate: string | null };
  expectedIntegrityClasses: string[];
  expectedUyapReadinessClasses: string[];
  expectedDiagnosticReasons: string[];
  expectedMappingBlockers: string[];
  expectedExporterComparison: {
    numeric: string | null; faizt: string | null;
    relation: 'EQUIVALENT' | 'CONFLICT' | 'NUMERIC_ONLY' | 'FAIZT_ONLY' | 'MISSING' | 'SILENT_FALLBACK_RISK';
  };
  expectedCalculationAuthoritySource:
    | 'CLAIMITEM_RICH' | 'CLAIMITEM_LEGACY_COMPATIBILITY' | 'CASE_LEGACY_FALLBACK'
    | 'NO_INTEREST' | 'UNSUPPORTED' | 'ABSENT';
  expectedCalculationAuthority: string | 'NO_INTEREST' | 'UNSUPPORTED' | 'ABSENT';
  expectedCalculationOutcome: 'BUCKET_CREATED' | 'BLOCKED' | 'NO_BUCKET';
  expectedAssemblerDiagnostics: string[];
  forbiddenOutcomes: string[];
}

const START = '2025-01-15';
const AUDIT_TIME = '2025-01-10T12:00:00.000Z';
const FIXED = new Set(['COMMERCIAL_FIXED', 'CONTRACTUAL']);
const DEPOSIT = new Set<string>(CANONICAL_RICH_INTEREST_CODES.filter((code) => code.startsWith('MEVDUAT_')));
const MIRROR: Record<string, string> = {
  LEGAL_3095: 'YASAL', COMMERCIAL_AVANS_3095_2_2: 'TICARI', COMMERCIAL_FIXED: 'SABIT',
};
const NUMERIC: Record<string, string> = { YASAL: '1', TICARI: '2', TEMERRUT: '2', AVANS: '4' };
const FAIZT: Record<string, string> = {
  YASAL: 'FAIZT00002', TICARI: 'FAIZT00017', AVANS: 'FAIZT00007', TEMERRUT: 'FAIZT00002',
  BANKA_MEVDUAT: 'FAIZT00011', KAMU_BANKASI: 'FAIZT00026',
};

type FixtureInput = Partial<RichInterestFixtureManifestEntry['claimItemInput']> & {
  rich?: string | null; legacy?: string | null; dueLegacy?: string | null;
  dueRich?: string | null; dueStart?: string | null; tier?: ExecutionTier;
  classifierOnlyRate?: number; caseLegacy?: string;
};

function uniqueSorted(values: string[]): string[] { return [...new Set(values)].sort(); }

function expectedExporter(legacy: string | null, dueLegacy: string | null, dueStart: string | null) {
  const numeric = legacy ? (NUMERIC[legacy] ?? '99') : null;
  const faizt = dueLegacy && dueStart ? (FAIZT[dueLegacy] ?? 'FAIZT00003') : null;
  const silent = Boolean((legacy && !NUMERIC[legacy]) || (dueLegacy && dueStart && !FAIZT[dueLegacy]));
  let relation: RichInterestFixtureManifestEntry['expectedExporterComparison']['relation'];
  if (silent) relation = 'SILENT_FALLBACK_RISK';
  else if (numeric && faizt) relation = numeric === '1' && faizt === 'FAIZT00002' ? 'EQUIVALENT' : 'CONFLICT';
  else if (numeric) relation = 'NUMERIC_ONLY';
  else if (faizt) relation = 'FAIZT_ONLY';
  else relation = 'MISSING';
  return { numeric, faizt, relation };
}

function fixture(index: number, description: string, input: FixtureInput): RichInterestFixtureManifestEntry {
  const fixtureId = `pra42-f${String(index).padStart(3, '0')}`;
  const rich = input.rich ?? null;
  const legacy = input.legacy ?? null;
  const accrual = input.interestAccrualStatus ?? 'ACCRUES';
  const rate = input.interestRate === undefined ? (FIXED.has(rich ?? '') ? 18 : null) : input.interestRate;
  const start = input.interestStartDate === undefined ? START : input.interestStartDate;
  const dueLegacy = input.dueLegacy === undefined ? legacy : input.dueLegacy;
  const dueStart = input.dueStart === undefined ? start : input.dueStart;
  const integrity: string[] = [];
  const readiness: string[] = [];
  const reasons: string[] = [];
  const blockers: string[] = [];

  if (rich && !legacy) integrity.push('RICH_ONLY');
  if (!rich && legacy) integrity.push('LEGACY_ONLY');
  if (rich && legacy) {
    if (MIRROR[rich] === legacy) integrity.push('RICH_AND_LEGACY_MATCH');
    else integrity.push('RICH_AND_LEGACY_DRIFT'), reasons.push('RICH_LEGACY_MIRROR_DRIFT');
  }
  if (legacy && !['YASAL', 'TICARI', 'TEMERRUT', 'AVANS'].includes(legacy)) integrity.push('UNSUPPORTED_LEGACY');

  const hasConfig = Boolean(rich || legacy || rate !== null || start || input.interestStartDateProvenance);
  if (accrual === 'NO_INTEREST') {
    integrity.push('NO_INTEREST_AUTHORITY'); readiness.push('UYAP_NO_INTEREST');
    if (hasConfig) integrity.push('NO_INTEREST_CONFLICT'), reasons.push('NO_INTEREST_WITH_INTEREST_CONFIGURATION');
    else integrity.push('NO_INTEREST_VALID');
    const audit = input.noInterestAudit;
    if (!(audit?.reason && audit.confirmedById && audit.confirmedAt)) {
      integrity.push('NO_INTEREST_AUDIT_INCOMPLETE'); reasons.push('PRINCIPAL_NO_INTEREST_AUDIT_INCOMPLETE');
    }
  } else if (!rich && !legacy) {
    integrity.push('NO_CLAIMITEM_INTEREST_AUTHORITY'); reasons.push('NO_CLAIMITEM_INTEREST_AUTHORITY');
  }

  const effectiveRate = input.classifierOnlyRate ?? rate;
  if (rich && FIXED.has(rich)) {
    if (effectiveRate === null) integrity.push('FIXED_RATE_MISSING');
    else if (!Number.isFinite(effectiveRate) || effectiveRate <= 0) integrity.push('FIXED_RATE_INVALID');
    else integrity.push('FIXED_RATE_VALID');
  } else if (rich && effectiveRate !== null) integrity.push('VARIABLE_RATE_WITH_STRAY_FIXED_RATE');

  const exporter = expectedExporter(legacy, dueLegacy, dueStart);
  if (accrual !== 'NO_INTEREST') {
    if (exporter.numeric && exporter.faizt) readiness.push(exporter.relation === 'EQUIVALENT' ? 'UYAP_READY_EXACT' : 'UYAP_EXPORTER_CONFLICT');
    else if (exporter.numeric) readiness.push('UYAP_READY_ONLY_IN_NUMERIC_EXPORTER');
    else if (exporter.faizt) readiness.push('UYAP_READY_ONLY_IN_FAIZT_EXPORTER');
    else readiness.push('UYAP_MAPPING_MISSING');
    if (exporter.relation === 'SILENT_FALLBACK_RISK') readiness.push('UYAP_SILENT_FALLBACK_RISK'), blockers.push('SILENT_FALLBACK_RISK');
    if (!rich && legacy) readiness.push('UYAP_LEGACY_ONLY_COMPATIBILITY');
    if (rich && DEPOSIT.has(rich)) {
      if (!input.depositTermProvenance) {
        readiness.push('UYAP_DEPOSIT_TERM_AMBIGUOUS', 'UYAP_MAPPING_AMBIGUOUS');
        reasons.push('DEPOSIT_TERM_NOT_EXPLICIT_NO_INFERENCE'); blockers.push('DEPOSIT_TERM_AMBIGUOUS');
      } else {
        readiness.push('UYAP_MAPPING_MISSING');
        reasons.push(`DEPOSIT_TERM_EXPLICIT_${input.depositTermProvenance}_MAPPING_NOT_FROZEN`);
      }
    }
    if (rich === 'CONTRACTUAL') {
      readiness.push('UYAP_CONTRACTUAL_MAPPING_MISSING', 'UYAP_MAPPING_MISSING');
      reasons.push('CONTRACTUAL_EXACT_MAPPING_NOT_FROZEN'); blockers.push('CONTRACTUAL_MAPPING_MISSING');
    }
    if (rich === 'COMMERCIAL_FIXED') {
      readiness.push('UYAP_COMMERCIAL_FIXED_MAPPING_MISSING', 'UYAP_MAPPING_MISSING');
      reasons.push('COMMERCIAL_FIXED_EXACT_MAPPING_NOT_FROZEN'); blockers.push('COMMERCIAL_FIXED_MAPPING_MISSING');
    }
  }
  if (accrual === 'ACCRUES' && !start) reasons.push('ACCRUES_WITHOUT_INTEREST_START_DATE'), readiness.push('UYAP_MAPPING_MISSING');
  if (dueLegacy !== legacy) reasons.push('CLAIMITEM_DUE_LEGACY_TYPE_DRIFT');

  let authoritySource: RichInterestFixtureManifestEntry['expectedCalculationAuthoritySource'];
  let authority: string;
  let outcome: RichInterestFixtureManifestEntry['expectedCalculationOutcome'];
  const assemblerDiagnostics: string[] = [];
  if (accrual === 'NO_INTEREST') {
    authoritySource = 'NO_INTEREST'; authority = 'NO_INTEREST'; outcome = 'NO_BUCKET';
    if (rich || legacy) assemblerDiagnostics.push('NO_INTEREST_AUTHORITY_CONFLICT');
  } else if (rich) {
    authoritySource = 'CLAIMITEM_RICH'; authority = rich;
    if (legacy && MIRROR[rich] !== legacy) assemblerDiagnostics.push('INTEREST_TYPE_MIRROR_DRIFT');
    if (FIXED.has(rich) && (effectiveRate === null || !Number.isFinite(effectiveRate) || effectiveRate <= 0)) {
      outcome = 'BLOCKED'; assemblerDiagnostics.push('FIXED_RATE_REQUIRED');
    } else if (!start) outcome = 'BLOCKED', assemblerDiagnostics.push('MISSING_START_DATE');
    else outcome = 'BUCKET_CREATED';
  } else if (legacy && ['YASAL', 'TICARI', 'SABIT'].includes(legacy)) {
    authoritySource = 'CLAIMITEM_LEGACY_COMPATIBILITY';
    authority = legacy === 'YASAL' ? 'LEGAL_3095' : legacy === 'TICARI' ? 'COMMERCIAL_AVANS_3095_2_2' : 'COMMERCIAL_FIXED';
    if (legacy === 'SABIT' && (effectiveRate === null || !Number.isFinite(effectiveRate) || effectiveRate <= 0)) {
      outcome = 'BLOCKED'; assemblerDiagnostics.push('FIXED_RATE_REQUIRED');
    } else outcome = start ? 'BUCKET_CREATED' : 'BLOCKED', !start && assemblerDiagnostics.push('MISSING_START_DATE');
  } else if (legacy) {
    authoritySource = 'UNSUPPORTED'; authority = 'UNSUPPORTED'; outcome = 'BLOCKED'; assemblerDiagnostics.push('UNSUPPORTED_INTEREST_TYPE');
  } else if (input.caseLegacy) {
    authoritySource = 'CASE_LEGACY_FALLBACK'; authority = input.caseLegacy === 'YASAL' ? 'LEGAL_3095' : 'UNSUPPORTED';
    outcome = start ? 'BUCKET_CREATED' : 'BLOCKED'; if (!start) assemblerDiagnostics.push('MISSING_START_DATE');
  } else {
    authoritySource = 'ABSENT'; authority = 'ABSENT'; outcome = 'BLOCKED'; assemblerDiagnostics.push('MISSING_INTEREST_CONFIG');
  }

  return {
    fixtureId, description, executionTier: input.tier ?? 'PERSISTED_DB',
    caseInput: { legacyInterestType: input.caseLegacy ?? 'YASAL', interestStartDate: START },
    claimItemInput: {
      itemType: input.itemType ?? 'PRINCIPAL', status: input.status ?? 'ACTIVE', currency: input.currency ?? 'TRY', amount: input.amount ?? '1000.00',
      richInterestTypeCode: rich, legacyInterestType: legacy, interestRate: rate,
      interestStartDate: start,
      interestStartDateProvenance: input.interestStartDateProvenance === undefined
        ? 'MANUAL_LAWYER_CONFIRMED' : input.interestStartDateProvenance,
      interestAccrualStatus: accrual,
      noInterestAudit: input.noInterestAudit ?? null, depositTermProvenance: input.depositTermProvenance ?? null,
    },
    classifierOnlyRate: input.classifierOnlyRate,
    dueProjection: { richInterestTypeCode: input.dueRich ?? rich, legacyInterestType: dueLegacy, interestStartDate: dueStart },
    expectedIntegrityClasses: uniqueSorted(integrity), expectedUyapReadinessClasses: uniqueSorted(readiness),
    expectedDiagnosticReasons: uniqueSorted(reasons), expectedMappingBlockers: uniqueSorted(blockers),
    expectedExporterComparison: exporter, expectedCalculationAuthoritySource: authoritySource,
    expectedCalculationAuthority: authority, expectedCalculationOutcome: outcome,
    expectedAssemblerDiagnostics: uniqueSorted(assemblerDiagnostics),
    forbiddenOutcomes: rich === 'CONTRACTUAL' && legacy === 'YASAL'
      ? ['LEGAL_3095', 'CASE_YASAL_FALLBACK', 'LEGACY_AUTHORITY']
      : legacy === 'YOKSUN' ? ['YASAL', 'LEGAL_3095', 'CASE_FALLBACK'] : [],
  };
}

const baseCodes: CanonicalRichInterestCode[] = [...CANONICAL_RICH_INTEREST_CODES];
const entries: RichInterestFixtureManifestEntry[] = [];
let id = 1;

for (const code of baseCodes) {
  entries.push(fixture(id++, `canonical rich code ${code}`, {
    rich: code,
    legacy: code === 'LEGAL_3095' ? 'YASAL' : code === 'CONTRACTUAL' ? 'YASAL' : null,
    dueLegacy: code === 'LEGAL_3095' ? 'YASAL' : null,
    depositTermProvenance: DEPOSIT.has(code) ? 'SHORT' : null,
  }));
}
for (const code of baseCodes.filter((candidate) => candidate.startsWith('MEVDUAT_'))) {
  entries.push(fixture(id++, `${code} explicit LONG`, { rich: code, depositTermProvenance: 'LONG' }));
  entries.push(fixture(id++, `${code} ambiguous term`, { rich: code, depositTermProvenance: null }));
}
entries.push(
  fixture(id++, 'legacy-only YASAL compatibility', { legacy: 'YASAL', dueLegacy: 'YASAL' }),
  fixture(id++, 'legacy-only TICARI compatibility', { legacy: 'TICARI', dueLegacy: 'TICARI' }),
  fixture(id++, 'legacy-only SABIT compatibility', { legacy: 'SABIT', interestRate: 22, dueLegacy: null }),
  fixture(id++, 'legacy YOKSUN remains unsupported', { legacy: 'YOKSUN', dueLegacy: 'YOKSUN' }),
  fixture(id++, 'case legacy fallback is explicit', { rich: null, legacy: null, caseLegacy: 'YASAL' }),
  fixture(id++, 'valid audited NO_INTEREST', {
    rich: null, legacy: null, interestRate: null, interestStartDate: null, interestStartDateProvenance: null,
    interestAccrualStatus: 'NO_INTEREST', dueLegacy: null,
    noInterestAudit: { reason: 'Owner-confirmed no interest', confirmedById: 'pra42-actor', confirmedAt: AUDIT_TIME },
  }),
  fixture(id++, 'NO_INTEREST conflicting with rate', {
    rich: null, legacy: null, interestRate: 18, interestStartDate: null, interestStartDateProvenance: null,
    interestAccrualStatus: 'NO_INTEREST', dueLegacy: null,
    noInterestAudit: { reason: 'Conflict diagnostic', confirmedById: 'pra42-actor', confirmedAt: AUDIT_TIME },
  }),
  fixture(id++, 'NO_INTEREST audit incomplete', {
    rich: null, legacy: null, interestRate: null, interestStartDate: null, interestStartDateProvenance: null,
    interestAccrualStatus: 'NO_INTEREST', dueLegacy: null,
  }),
  fixture(id++, 'COMMERCIAL_FIXED missing rate', { rich: 'COMMERCIAL_FIXED', interestRate: null }),
  fixture(id++, 'COMMERCIAL_FIXED zero rate', { rich: 'COMMERCIAL_FIXED', interestRate: 0 }),
  fixture(id++, 'COMMERCIAL_FIXED negative rate', { rich: 'COMMERCIAL_FIXED', interestRate: -5 }),
  fixture(id++, 'variable rich code with stray fixed rate', { rich: 'LEGAL_3095', interestRate: 12 }),
  fixture(id++, 'fixed NaN classifier-only', { rich: 'COMMERCIAL_FIXED', tier: 'CLASSIFIER_ONLY', classifierOnlyRate: Number.NaN }),
  fixture(id++, 'fixed Infinity classifier-only', { rich: 'CONTRACTUAL', tier: 'CLASSIFIER_ONLY', classifierOnlyRate: Number.POSITIVE_INFINITY }),
  fixture(id++, 'FAIZT-only legacy Due projection', {
    rich: null, legacy: null, dueLegacy: 'YASAL', caseLegacy: 'YASAL',
  }),
);

export const RICH_INTEREST_FIXTURE_MANIFEST = entries satisfies readonly RichInterestFixtureManifestEntry[];
export const PERSISTED_FIXTURES = RICH_INTEREST_FIXTURE_MANIFEST.filter((entry) => entry.executionTier === 'PERSISTED_DB');
export const CLASSIFIER_ONLY_FIXTURES = RICH_INTEREST_FIXTURE_MANIFEST.filter((entry) => entry.executionTier === 'CLASSIFIER_ONLY');
export const FIXTURE_TENANT_ID = 'pra42-fixture-tenant';
export const SENTINEL_TENANT_ID = 'pra42-unrelated-tenant';
export const FIXTURE_DATE = '2025-01-15T00:00:00.000Z';
