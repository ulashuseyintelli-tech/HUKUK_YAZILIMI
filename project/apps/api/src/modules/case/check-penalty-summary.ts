import { Prisma } from '@prisma/client';
import { decimalToMinor } from '../claim-item/formation-cek/case-instrument-exact-record.resolver';
import { computeCheckPenaltyMinor } from '../claim-item/formation-cek/cek-penalty';

/**
 * K3-L (owner kararı 2026-09-28) — hesap özetinde çek tazminatı.
 *
 * KESİN tutar YALNIZ onaylı/kesin `CHECK_PENALTY` kalemlerinden gelir (tutar, tahsil edilen, kalan ve kalem bazlı
 * sorumlu borçlular kalem kaydından). Kalem yoksa otomatik "asıl alacak × %10" KESİN borca EKLENMEZ; durum
 * ("oluşturulmamış" / "onay bekliyor") gösterilir — kayıt yokluğu hakkın yokluğu veya vazgeçme DEĞİLDİR.
 *
 * Tahmin yalnız AYRI bilgi alanıdır: hiçbir borçlu/dosya bakiyesine, faize, mahsuba veya ödeme emri / UYAP talep
 * toplamına girmez. Doğrulanmış matrah (karşılıksız işaretli, karşılıksız tarihi dolu, kuruşa kesin tutarlı çek
 * kaydı) yoksa tutar ÜRETİLMEZ ("hesaplanamadı — veri eksik").
 */
export const CHECK_PENALTY_ESTIMATE_BASIS_POINTS = 1000; // RCV-LB-R2-CEK taslak oranı (%10) — avukat teyidi bekler

export type CheckPenaltySummaryStatus = 'KALEM_VAR' | 'ONAY_BEKLIYOR' | 'OLUSTURULMAMIS' | 'UYGULANMAZ';

export interface CheckPenaltyItemRow {
  readonly id: string;
  readonly demandedAmount: Prisma.Decimal | number | string;
  readonly collectedAmount: Prisma.Decimal | number | string | null;
  readonly currency: string;
  readonly isAllDebtorsLiable: boolean;
  readonly liableDebtorIds: readonly string[];
}

export interface CheckInstrumentRow {
  readonly amount: Prisma.Decimal | number | string;
  readonly currency: string;
  readonly isBounced: boolean;
  readonly bounceDate: Date | null;
}

export interface CheckPenaltySummaryInput {
  readonly isCheckCase: boolean;
  readonly penaltyItems: readonly CheckPenaltyItemRow[];
  readonly checkInstruments: readonly CheckInstrumentRow[];
  readonly debtorNames: ReadonlyMap<string, string>;
  readonly pendingApproval: boolean;
}

export interface CheckPenaltySummaryItem {
  readonly claimItemId: string;
  readonly tutar: number;
  readonly tahsilEdilen: number;
  readonly kalan: number;
  readonly paraBirimi: string;
  /** Kalem bazlı sorumlular; kayıt tüm borçlulara açık veya boşsa `sorumlulukBelirsiz` (tüm borçlulara YAYILMAZ). */
  readonly sorumluBorclular: readonly { readonly debtorId: string; readonly ad: string }[];
  readonly sorumlulukBelirsiz: boolean;
}

export interface CheckPenaltyEstimate {
  readonly durum: 'HESAPLANDI' | 'VERI_EKSIK';
  readonly tutar: number | null;
  readonly aciklama: string;
}

export interface CheckPenaltySummary {
  /** KESİN tazminat = Σ kalem tutarı (kalem yoksa 0). Takip tutarına YALNIZ bu girer. */
  readonly tutar: number;
  readonly durum: CheckPenaltySummaryStatus;
  readonly mesaj: string | null;
  readonly kalemler: readonly CheckPenaltySummaryItem[];
  /** Yalnız bilgi — hiçbir bakiyeye / toplama DAHİL DEĞİL. */
  readonly tahmin: CheckPenaltyEstimate | null;
}

const toNumber = (value: Prisma.Decimal | number | string | null): number =>
  value === null ? 0 : new Prisma.Decimal(value as Prisma.Decimal.Value).toNumber();
const round2 = (value: number): number => Math.round(value * 100) / 100;

function estimate(instruments: readonly CheckInstrumentRow[]): CheckPenaltyEstimate {
  const missing = (aciklama: string): CheckPenaltyEstimate => ({ durum: 'VERI_EKSIK', tutar: null, aciklama });
  const bounced = instruments.filter((instrument) => instrument.isBounced);
  if (bounced.length === 0) return missing('Hesaplanamadı — veri eksik: karşılıksız işaretli çek kaydı yok.');
  const currencies = new Set(bounced.map((instrument) => instrument.currency));
  if (currencies.size !== 1) return missing('Hesaplanamadı — veri eksik: çek kayıtları farklı para birimlerinde.');
  let totalMinor = 0n;
  for (const instrument of bounced) {
    const amountMinor = decimalToMinor(new Prisma.Decimal(instrument.amount as Prisma.Decimal.Value));
    if (instrument.bounceDate === null || amountMinor === null) {
      return missing('Hesaplanamadı — veri eksik: karşılıksız tarihi veya kuruşa kesin çek tutarı eksik.');
    }
    totalMinor += computeCheckPenaltyMinor(amountMinor, CHECK_PENALTY_ESTIMATE_BASIS_POINTS);
  }
  return {
    durum: 'HESAPLANDI',
    tutar: Number(totalMinor) / 100,
    aciklama:
      'Bilgi amaçlı tahmin (karşılıksız çek kaydı tutarı × %10, taslak oran) — kesin borca, bakiyeye, faize, mahsuba ' +
      've ödeme emri / UYAP toplamına DAHİL DEĞİL.',
  };
}

/**
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CaseService.getCalculationSummary() → GET /cases/:id/calculation-summary (hesap özeti)
 * /// </remarks>
 */
export function buildCheckPenaltySummary(input: CheckPenaltySummaryInput): CheckPenaltySummary {
  const kalemler = input.penaltyItems.map((item): CheckPenaltySummaryItem => {
    const tutar = round2(toNumber(item.demandedAmount));
    const tahsilEdilen = round2(toNumber(item.collectedAmount));
    const belirsiz = item.isAllDebtorsLiable || item.liableDebtorIds.length === 0;
    return {
      claimItemId: item.id,
      tutar,
      tahsilEdilen,
      kalan: round2(Math.max(tutar - tahsilEdilen, 0)),
      paraBirimi: item.currency,
      sorumluBorclular: belirsiz
        ? []
        : [...item.liableDebtorIds].sort().map((debtorId) => ({ debtorId, ad: input.debtorNames.get(debtorId) ?? debtorId })),
      sorumlulukBelirsiz: belirsiz,
    };
  });
  if (kalemler.length > 0) {
    return {
      tutar: round2(kalemler.reduce((sum, item) => sum + item.tutar, 0)),
      durum: 'KALEM_VAR',
      mesaj: kalemler.some((item) => item.sorumlulukBelirsiz)
        ? 'Çek tazminatı kaleminde sorumlu borçlular belirlenmemiş; tazminat borçlulara dağıtılmadı.'
        : null,
      kalemler,
      tahmin: null,
    };
  }
  if (!input.isCheckCase) {
    return { tutar: 0, durum: 'UYGULANMAZ', mesaj: null, kalemler: [], tahmin: null };
  }
  return {
    tutar: 0,
    durum: input.pendingApproval ? 'ONAY_BEKLIYOR' : 'OLUSTURULMAMIS',
    mesaj: input.pendingApproval
      ? 'Çek tazminatı kalemi onay bekliyor; onaylanana kadar borca eklenmez.'
      : 'Çek tazminatı kalemi oluşturulmamış; kayıt yokluğu tazminat hakkının bulunmadığı veya bundan vazgeçildiği anlamına gelmez.',
    kalemler: [],
    tahmin: estimate(input.checkInstruments),
  };
}
