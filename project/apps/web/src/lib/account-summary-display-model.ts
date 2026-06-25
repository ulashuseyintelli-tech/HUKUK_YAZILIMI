import type { CaseCalculationResult } from '@/hooks/useCaseCalculation';

export type AccountSummarySourceAuthority = 'CANONICAL' | 'LEGACY' | 'DERIVED' | 'UNKNOWN';

export type AccountSummaryCutoverPolicy =
  | 'CANONICAL_REQUIRED'
  | 'LEGACY_ALLOWED_DIAGNOSTIC'
  | 'DERIVED_REQUIRES_SOURCE_MODEL'
  | 'UNKNOWN_BLOCKS_CUTOVER';

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
