import type { CaseCalculationResult } from '@/hooks/useCaseCalculation';

export type AccountSummarySourceAuthority = 'CANONICAL' | 'LEGACY' | 'DERIVED' | 'UNKNOWN';

export type AccountSummaryCutoverPolicy =
  | 'CANONICAL_REQUIRED'
  | 'LEGACY_ALLOWED_DIAGNOSTIC'
  | 'DERIVED_REQUIRES_SOURCE_MODEL'
  | 'UNKNOWN_BLOCKS_CUTOVER';

export type AccountSummarySourcePlacement =
  | 'PRIMARY_CANONICAL_ELIGIBLE'
  | 'DIAGNOSTIC_LEGACY_ALLOWED'
  | 'DIAGNOSTIC_DERIVED_ALLOWED'
  | 'BACKEND_CONTRACT_REQUIRED'
  | 'BLOCKED_UNKNOWN_SOURCE'
  | 'BLOCKED_MIXED_AUTHORITY';

export type AccountSummaryRowId =
  | 'asilAlacak'
  | 'takipTutari'
  | 'takipSonrasiFaiz'
  | 'icraMasraflari'
  | 'vekaletUcreti'
  | 'toplamBorc'
  | 'sonBorc'
  | 'toplamTahsilat'
  | 'kalanBorc'
  | 'kalanAnapara'
  | 'tazminat'
  | 'komisyon'
  | 'takipOncesiFaiz'
  | 'basvurmaHarci'
  | 'vekaletHarci'
  | 'pesinHarc'
  | 'dosyaGideri'
  | 'tebligatGideri'
  | 'vekaletPulu'
  | 'pesinHarcDahilTahsilHarci'
  | 'pesinHarcHaricTahsilHarci'
  | 'tahsilOranlari'
  | 'mahsupDetaylari'
  | 'faizSegmentleri'
  | 'takipTarihi'
  | 'hesapTarihi'
  | 'kalemTuru'
  | 'mahsupDetayPanelContext';

export interface AccountSummaryDisplayRow {
  id: AccountSummaryRowId;
  label: string;
  sourceAuthority: AccountSummarySourceAuthority;
  cutoverPolicy: AccountSummaryCutoverPolicy;
  value?: number;
  textValue?: string;
  itemCount?: number;
  derivedFrom?: AccountSummarySourceAuthority[];
}

export interface AccountSummaryDisplayModel {
  guardedPrimarySelected: boolean;
  rows: Record<AccountSummaryRowId, AccountSummaryDisplayRow>;
}

export interface AccountSummarySourcePolicyViolation {
  rowId: AccountSummaryRowId | 'displaySurface';
  sourceAuthority: AccountSummarySourceAuthority;
  policy: AccountSummaryCutoverPolicy | 'CONTROLLED_CUTOVER_CANDIDATE_REQUIRED';
  reason: string;
}

export interface AccountSummarySourcePolicyResult {
  readyForControlledCutover: boolean;
  blockers: AccountSummarySourcePolicyViolation[];
  warnings: AccountSummarySourcePolicyViolation[];
}

export interface AccountSummarySourcePlacementDecision {
  rowId: AccountSummaryRowId;
  sourceAuthority: AccountSummarySourceAuthority;
  cutoverPolicy: AccountSummaryCutoverPolicy;
  placement: AccountSummarySourcePlacement;
  reason: string;
}

export interface AccountSummarySourcePlacementPlan {
  guardedPrimarySelected: boolean;
  placements: AccountSummarySourcePlacementDecision[];
  summary: {
    primaryCanonicalEligibleRowIds: AccountSummaryRowId[];
    diagnosticLegacyRowIds: AccountSummaryRowId[];
    diagnosticDerivedRowIds: AccountSummaryRowId[];
    backendContractRequiredRowIds: AccountSummaryRowId[];
    blockedRowIds: AccountSummaryRowId[];
  };
}

interface BuildAccountSummaryDisplayModelInput {
  legacy: CaseCalculationResult;
  display: CaseCalculationResult;
  guardedPrimarySelected: boolean;
}

const CANONICAL_REQUIRED_ROW_IDS = [
  'asilAlacak',
  'takipTutari',
  'takipSonrasiFaiz',
  'icraMasraflari',
  'vekaletUcreti',
  'toplamBorc',
  'sonBorc',
  'toplamTahsilat',
  'kalanBorc',
  'kalanAnapara',
] as const satisfies readonly AccountSummaryRowId[];

const LEGACY_MONETARY_ROW_IDS = [
  'tazminat',
  'komisyon',
  'takipOncesiFaiz',
  'basvurmaHarci',
  'vekaletHarci',
  'pesinHarc',
  'dosyaGideri',
  'tebligatGideri',
  'vekaletPulu',
  'pesinHarcDahilTahsilHarci',
  'pesinHarcHaricTahsilHarci',
] as const satisfies readonly AccountSummaryRowId[];

const BACKEND_CONTRACT_REQUIRED_ROW_IDS = [
  'tazminat',
  'komisyon',
  'takipOncesiFaiz',
] as const satisfies readonly AccountSummaryRowId[];

const DIAGNOSTIC_LEGACY_ALLOWED_ROW_IDS = [
  'basvurmaHarci',
  'vekaletHarci',
  'pesinHarc',
  'dosyaGideri',
  'tebligatGideri',
  'vekaletPulu',
  'pesinHarcDahilTahsilHarci',
  'pesinHarcHaricTahsilHarci',
  'tahsilOranlari',
  'mahsupDetaylari',
  'faizSegmentleri',
  'takipTarihi',
  'kalemTuru',
] as const satisfies readonly AccountSummaryRowId[];

const DIAGNOSTIC_DERIVED_ALLOWED_ROW_IDS = [
  'hesapTarihi',
] as const satisfies readonly AccountSummaryRowId[];

const BLOCKED_MIXED_AUTHORITY_ROW_IDS = [
  'mahsupDetayPanelContext',
] as const satisfies readonly AccountSummaryRowId[];

const ROW_LABELS: Record<AccountSummaryRowId, string> = {
  asilAlacak: 'Asil alacak',
  takipTutari: 'Takip tutari',
  takipSonrasiFaiz: 'Takip sonrasi faiz',
  icraMasraflari: 'Icra masraflari',
  vekaletUcreti: 'Vekalet ucreti',
  toplamBorc: 'Toplam borc',
  sonBorc: 'Son borc',
  toplamTahsilat: 'Toplam tahsilat',
  kalanBorc: 'Kalan borc',
  kalanAnapara: 'Kalan anapara',
  tazminat: 'Tazminat',
  komisyon: 'Komisyon',
  takipOncesiFaiz: 'Takip oncesi faiz',
  basvurmaHarci: 'Basvurma harci',
  vekaletHarci: 'Vekalet harci',
  pesinHarc: 'Pesin harc',
  dosyaGideri: 'Dosya gideri',
  tebligatGideri: 'Tebligat gideri',
  vekaletPulu: 'Vekalet pulu',
  pesinHarcDahilTahsilHarci: 'Pesin harc dahil tahsil harci',
  pesinHarcHaricTahsilHarci: 'Pesin harc haric tahsil harci',
  tahsilOranlari: 'Tahsil oranlari',
  mahsupDetaylari: 'Mahsup detaylari',
  faizSegmentleri: 'Faiz segmentleri',
  takipTarihi: 'Takip tarihi',
  hesapTarihi: 'Hesap tarihi',
  kalemTuru: 'Kalem turu',
  mahsupDetayPanelContext: 'Mahsup detay panel context',
};

function monetaryRow(
  id: AccountSummaryRowId,
  value: number,
  sourceAuthority: AccountSummarySourceAuthority,
  cutoverPolicy: AccountSummaryCutoverPolicy,
): AccountSummaryDisplayRow {
  return {
    id,
    label: ROW_LABELS[id],
    value,
    sourceAuthority,
    cutoverPolicy,
  };
}

function metadataRow(
  id: AccountSummaryRowId,
  textValue: string,
  sourceAuthority: AccountSummarySourceAuthority,
  cutoverPolicy: AccountSummaryCutoverPolicy,
): AccountSummaryDisplayRow {
  return {
    id,
    label: ROW_LABELS[id],
    textValue,
    sourceAuthority,
    cutoverPolicy,
  };
}

function rowIdIn<const T extends readonly AccountSummaryRowId[]>(
  rowId: AccountSummaryRowId,
  rowIds: T,
): rowId is T[number] {
  return (rowIds as readonly AccountSummaryRowId[]).includes(rowId);
}

/**
 * Hesap Ozeti icin satir bazli source authority modeli uretir.
 *
 * Kullaniciya gorunen degerleri degistirmez; sadece guarded primary secili
 * oldugunda hangi satirin canonical, legacy veya derived oldugunu testlenebilir yapar.
 */
export function buildAccountSummaryDisplayModel({
  legacy,
  display,
  guardedPrimarySelected,
}: BuildAccountSummaryDisplayModelInput): AccountSummaryDisplayModel {
  const canonicalRowSource: AccountSummarySourceAuthority = guardedPrimarySelected ? 'CANONICAL' : 'LEGACY';
  const canonicalRows = Object.fromEntries(
    CANONICAL_REQUIRED_ROW_IDS.map((id) => [
      id,
      monetaryRow(id, display[id], canonicalRowSource, 'CANONICAL_REQUIRED'),
    ]),
  ) as Pick<Record<AccountSummaryRowId, AccountSummaryDisplayRow>, typeof CANONICAL_REQUIRED_ROW_IDS[number]>;

  const legacyRows = Object.fromEntries(
    LEGACY_MONETARY_ROW_IDS.map((id) => [
      id,
      monetaryRow(id, legacy[id], 'LEGACY', 'UNKNOWN_BLOCKS_CUTOVER'),
    ]),
  ) as Pick<Record<AccountSummaryRowId, AccountSummaryDisplayRow>, typeof LEGACY_MONETARY_ROW_IDS[number]>;

  const faizSegmentCount =
    legacy.faizSegmentleri.takipOncesi.length + legacy.faizSegmentleri.takipSonrasi.length;
  const mahsupContextSource: AccountSummarySourceAuthority = guardedPrimarySelected ? 'DERIVED' : 'LEGACY';
  const mahsupContextPolicy: AccountSummaryCutoverPolicy = guardedPrimarySelected
    ? 'DERIVED_REQUIRES_SOURCE_MODEL'
    : 'LEGACY_ALLOWED_DIAGNOSTIC';

  return {
    guardedPrimarySelected,
    rows: {
      ...canonicalRows,
      ...legacyRows,
      tahsilOranlari: {
        id: 'tahsilOranlari',
        label: ROW_LABELS.tahsilOranlari,
        itemCount: legacy.tahsilOranlari.length,
        sourceAuthority: 'LEGACY',
        cutoverPolicy: 'LEGACY_ALLOWED_DIAGNOSTIC',
      },
      mahsupDetaylari: {
        id: 'mahsupDetaylari',
        label: ROW_LABELS.mahsupDetaylari,
        itemCount: legacy.mahsupDetaylari.length,
        sourceAuthority: 'LEGACY',
        cutoverPolicy: guardedPrimarySelected
          ? 'DERIVED_REQUIRES_SOURCE_MODEL'
          : 'LEGACY_ALLOWED_DIAGNOSTIC',
      },
      faizSegmentleri: {
        id: 'faizSegmentleri',
        label: ROW_LABELS.faizSegmentleri,
        itemCount: faizSegmentCount,
        sourceAuthority: 'LEGACY',
        cutoverPolicy: 'LEGACY_ALLOWED_DIAGNOSTIC',
      },
      takipTarihi: metadataRow(
        'takipTarihi',
        legacy.takipTarihi,
        'LEGACY',
        'LEGACY_ALLOWED_DIAGNOSTIC',
      ),
      hesapTarihi: metadataRow(
        'hesapTarihi',
        display.hesapTarihi,
        guardedPrimarySelected ? 'DERIVED' : 'LEGACY',
        guardedPrimarySelected ? 'DERIVED_REQUIRES_SOURCE_MODEL' : 'LEGACY_ALLOWED_DIAGNOSTIC',
      ),
      kalemTuru: metadataRow(
        'kalemTuru',
        legacy.kalemTuru,
        'LEGACY',
        'LEGACY_ALLOWED_DIAGNOSTIC',
      ),
      mahsupDetayPanelContext: {
        id: 'mahsupDetayPanelContext',
        label: ROW_LABELS.mahsupDetayPanelContext,
        sourceAuthority: mahsupContextSource,
        cutoverPolicy: mahsupContextPolicy,
        derivedFrom: guardedPrimarySelected ? ['CANONICAL', 'LEGACY'] : ['LEGACY'],
      },
    },
  };
}
function sourcePolicyViolation(
  row: AccountSummaryDisplayRow,
  reason: string,
): AccountSummarySourcePolicyViolation {
  return {
    rowId: row.id,
    sourceAuthority: row.sourceAuthority,
    policy: row.cutoverPolicy,
    reason,
  };
}

/**
 * Source-aware Hesap Ozeti modelini controlled cutover acisindan degerlendirir.
 *
 * Runtime UI davranisini degistirmez; sadece TM10 modelinden policy raporu uretir.
 */
export function evaluateAccountSummarySourceAuthorityPolicy(
  model: AccountSummaryDisplayModel,
): AccountSummarySourcePolicyResult {
  const blockers: AccountSummarySourcePolicyViolation[] = [];
  const warnings: AccountSummarySourcePolicyViolation[] = [];

  if (!model.guardedPrimarySelected) {
    blockers.push({
      rowId: 'displaySurface',
      sourceAuthority: 'LEGACY',
      policy: 'CONTROLLED_CUTOVER_CANDIDATE_REQUIRED',
      reason: 'Legacy fallback display is safe behavior, not a controlled cutover candidate.',
    });
  }

  for (const row of Object.values(model.rows)) {
    if (row.cutoverPolicy === 'CANONICAL_REQUIRED' && row.sourceAuthority !== 'CANONICAL') {
      blockers.push(sourcePolicyViolation(
        row,
        'Canonical-required row must use CANONICAL source authority.',
      ));
      continue;
    }

    if (row.cutoverPolicy === 'UNKNOWN_BLOCKS_CUTOVER') {
      blockers.push(sourcePolicyViolation(
        row,
        'Row source is not approved for controlled cutover.',
      ));
      continue;
    }

    if (row.cutoverPolicy === 'DERIVED_REQUIRES_SOURCE_MODEL') {
      blockers.push(sourcePolicyViolation(
        row,
        'Derived or mixed row requires explicit source modeling before controlled cutover.',
      ));
      continue;
    }

    if (row.cutoverPolicy === 'LEGACY_ALLOWED_DIAGNOSTIC' && row.sourceAuthority === 'LEGACY') {
      if (model.guardedPrimarySelected) {
        blockers.push(sourcePolicyViolation(
          row,
          'Legacy row is still inside the same primary Hesap Ozeti surface.',
        ));
      } else {
        warnings.push(sourcePolicyViolation(
          row,
          'Legacy diagnostic row remains visible only in fallback display.',
        ));
      }
    }
  }

  return {
    readyForControlledCutover: blockers.length === 0,
    blockers,
    warnings,
  };
}
function classifyAccountSummarySourcePlacement(
  row: AccountSummaryDisplayRow,
): AccountSummarySourcePlacementDecision {
  if (row.sourceAuthority === 'UNKNOWN') {
    return {
      rowId: row.id,
      sourceAuthority: row.sourceAuthority,
      cutoverPolicy: row.cutoverPolicy,
      placement: 'BLOCKED_UNKNOWN_SOURCE',
      reason: 'Unknown source authority cannot be placed in primary or diagnostic surfaces.',
    };
  }

  if (rowIdIn(row.id, CANONICAL_REQUIRED_ROW_IDS)) {
    if (row.sourceAuthority === 'CANONICAL') {
      return {
        rowId: row.id,
        sourceAuthority: row.sourceAuthority,
        cutoverPolicy: row.cutoverPolicy,
        placement: 'PRIMARY_CANONICAL_ELIGIBLE',
        reason: 'Row is explicitly eligible for the primary canonical surface.',
      };
    }

    return {
      rowId: row.id,
      sourceAuthority: row.sourceAuthority,
      cutoverPolicy: row.cutoverPolicy,
      placement: 'BLOCKED_MIXED_AUTHORITY',
      reason: 'Primary candidate row requires CANONICAL source authority.',
    };
  }

  if (rowIdIn(row.id, BACKEND_CONTRACT_REQUIRED_ROW_IDS)) {
    return {
      rowId: row.id,
      sourceAuthority: row.sourceAuthority,
      cutoverPolicy: row.cutoverPolicy,
      placement: 'BACKEND_CONTRACT_REQUIRED',
      reason: 'Row needs an explicit backend canonical contract before primary placement.',
    };
  }

  if (rowIdIn(row.id, DIAGNOSTIC_LEGACY_ALLOWED_ROW_IDS)) {
    return {
      rowId: row.id,
      sourceAuthority: row.sourceAuthority,
      cutoverPolicy: row.cutoverPolicy,
      placement: 'DIAGNOSTIC_LEGACY_ALLOWED',
      reason: 'Row may remain visible only in a separated legacy diagnostic surface.',
    };
  }

  if (rowIdIn(row.id, DIAGNOSTIC_DERIVED_ALLOWED_ROW_IDS)) {
    return {
      rowId: row.id,
      sourceAuthority: row.sourceAuthority,
      cutoverPolicy: row.cutoverPolicy,
      placement: 'DIAGNOSTIC_DERIVED_ALLOWED',
      reason: 'Derived metadata row may remain visible only in a separated diagnostic surface.',
    };
  }

  if (rowIdIn(row.id, BLOCKED_MIXED_AUTHORITY_ROW_IDS)) {
    return {
      rowId: row.id,
      sourceAuthority: row.sourceAuthority,
      cutoverPolicy: row.cutoverPolicy,
      placement: 'BLOCKED_MIXED_AUTHORITY',
      reason: 'Mixed authority context requires an explicit source model before placement.',
    };
  }

  return {
    rowId: row.id,
    sourceAuthority: row.sourceAuthority,
    cutoverPolicy: row.cutoverPolicy,
    placement: 'BLOCKED_MIXED_AUTHORITY',
    reason: 'Row has no approved source placement mapping.',
  };
}

/**
 * Source-aware Hesap Ozeti row'lari icin future placement planini uretir.
 *
 * Runtime UI davranisini degistirmez; primary, diagnostic ve blocked placement
 * kararlarini sadece test edilebilir metadata olarak dondurur.
 */
export function buildAccountSummarySourcePlacementPlan(
  model: AccountSummaryDisplayModel,
): AccountSummarySourcePlacementPlan {
  const placements = Object.values(model.rows).map(classifyAccountSummarySourcePlacement);

  return {
    guardedPrimarySelected: model.guardedPrimarySelected,
    placements,
    summary: {
      primaryCanonicalEligibleRowIds: placements
        .filter((placement) => placement.placement === 'PRIMARY_CANONICAL_ELIGIBLE')
        .map((placement) => placement.rowId),
      diagnosticLegacyRowIds: placements
        .filter((placement) => placement.placement === 'DIAGNOSTIC_LEGACY_ALLOWED')
        .map((placement) => placement.rowId),
      diagnosticDerivedRowIds: placements
        .filter((placement) => placement.placement === 'DIAGNOSTIC_DERIVED_ALLOWED')
        .map((placement) => placement.rowId),
      backendContractRequiredRowIds: placements
        .filter((placement) => placement.placement === 'BACKEND_CONTRACT_REQUIRED')
        .map((placement) => placement.rowId),
      blockedRowIds: placements
        .filter((placement) => placement.placement.startsWith('BLOCKED_'))
        .map((placement) => placement.rowId),
    },
  };
}
