import { Prisma } from '@prisma/client';
import {
  fromKurus,
  isLiableParty,
  type EvaluatedItemLiability,
  type ItemLiabilityKind,
} from '../claim-liability/claim-liability.domain';

/**
 * K3-L Faz 1c (owner kararı 2026-09-29 "önce defterden, faiz ayrı") — borçlu bazlı bakiye KALICI DEFTERDEN.
 *
 * Kaynak: kalem kaydı (`demandedAmount`) ve kalıcı mahsup (`collectedAmount` = LedgerAllocation toplamı; Faz 1b'den
 * itibaren TBK100 sırasıyla ve YALNIZ ödeyenin sorumlu olduğu kalemlere). Her borçlu için yalnız sorumlu olduğu kalemler
 * (`isAllDebtorsLiable` veya `liableDebtorIds` ∋ Debtor.id). Ortak kalemin tahsil edilen kısmı o kalemi paylaşan HERKES
 * için düşer; borçlu kalanları toplanınca dosya borcunu VERMEZ.
 *
 * Seçimlik sorumluluk (karar günlüğü 2026-11-15): sorumluluk türü seçilmemiş kalem "BELİRLENMEDİ"dir — bu bir
 * müteselsillik kabulü DEĞİLDİR ve borçluya özgü kesin bakiye üretmez. Türü seçilmiş kalemde borçlunun payı / tavanı,
 * hesabına sayılan mahsup ve kalan sorumluluğu `sorumluluk` alanında ayrıca verilir (mevcut alanlar aynı değerlerle
 * korunur). Dosya kalanı `dosyaKalani` alanındadır; borçlu rakamlarından TOPLANMAZ.
 *
 * İŞLEYEN FAİZ HARİÇ: borçlu bazında faiz henüz hesaplanmaz (kanonik motor genişletmesi ayrı iş). Kayıtlı faiz kalemleri
 * (işlemiş faiz) kalem olarak dahildir. Sorumlusu kayıtta bulunamayan kısıtlı kalem hiçbir borçluya YAZILMAZ,
 * `sorumlusuBulunamayanKalemler` altında raporlanır.
 */
export const DEBTOR_LEDGER_BALANCE_ITEM_STATUSES = ['ACTIVE', 'COLLECTED'] as const;

export interface DebtorLedgerCaseDebtorRow {
  readonly id: string;
  readonly debtorId: string;
  readonly role: string;
  readonly lifecycleStatus: string;
  readonly name: string;
}

export interface DebtorLedgerItemRow {
  readonly id: string;
  readonly itemType: string;
  readonly description: string | null;
  readonly currency: string;
  readonly amount: Prisma.Decimal | number | string | null;
  readonly demandedAmount: Prisma.Decimal | number | string | null;
  readonly collectedAmount: Prisma.Decimal | number | string | null;
  readonly isAllDebtorsLiable: boolean;
  readonly liableDebtorIds: readonly string[];
}

export interface DebtorLedgerItemLine {
  readonly claimItemId: string;
  readonly kalemTuru: string;
  readonly aciklama: string | null;
  readonly paraBirimi: string;
  readonly tutar: number;
  readonly tahsilEdilen: number;
  readonly kalan: number;
  /** Kalem tüm borçlulara açık (ortak) mı, yalnız belirli borçlulara mı ait. */
  readonly ortak: boolean;
  /** Seçimlik sorumluluk görünümü (bağlam verildiyse). */
  readonly sorumluluk?: DebtorLedgerLineLiability;
}

export type DebtorLedgerLiabilityKind = 'BELIRLENMEDI' | 'KAYITTAN_KISITLI' | 'MUTESELSIL' | 'PAYLI' | 'TUTARLA_SINIRLI';

export interface DebtorLedgerLineLiability {
  readonly tur: DebtorLedgerLiabilityKind;
  readonly secimSurumu: number | null;
  /** Paylıda borçlunun payı (kalemin TAM tutarından). */
  readonly pay: number | null;
  /** Tutarla sınırlıda tavan; sınırsız borçluda null. */
  readonly tavan: number | null;
  readonly sinirsiz: boolean;
  /** Tavan YALNIZ kalemin kayıtlı tutarını kapsar (işleyen faiz ve diğer kalemler kapsam dışı). */
  readonly tavanKapsami: 'ITEM_AMOUNT' | null;
  /** Bu borçlu hesabına bu kaleme yapılmış net mahsup. */
  readonly borcluHesabinaMahsup: number;
  /** Borçlunun bu kalemdeki kalan sorumluluğu; belirlenmedi ya da uzlaşmayan kalemde null (kesin rakam üretilmez). */
  readonly kalanSorumluluk: number | null;
  /** Kalemin ortak kalanı (tek sayaçtan). */
  readonly ortakKalan: number;
  readonly uzlasiyor: boolean;
}

export interface DebtorLedgerCurrencyRemaining {
  readonly paraBirimi: string;
  readonly kalan: number;
}

export interface DebtorLedgerLiabilitySummary {
  /** "Kesin sorumluluk": yalnız sorumluluğu belli kalemler (seçilmiş tür ya da kayıttan kısıtlı). */
  readonly kesinSorumluluk: {
    readonly durum: 'HESAPLANDI' | 'BELIRLENEMEDI';
    readonly neden: 'TAVANLI_KALEM' | 'UZLASMAYAN_KALEM' | null;
    readonly toplamlar: readonly DebtorLedgerCurrencyRemaining[];
  };
  /** Sorumluluk türü belirlenmemiş kalemlerin ORTAK kalanı — borçluya özgü kesin bakiye DEĞİLDİR. */
  readonly belirlenmemisOrtakKalan: readonly DebtorLedgerCurrencyRemaining[];
}

export interface DebtorLedgerCurrencyTotal {
  readonly paraBirimi: string;
  readonly tutar: number;
  readonly tahsilEdilen: number;
  readonly kalan: number;
}

export interface DebtorLedgerBalance {
  readonly caseDebtorId: string;
  readonly debtorId: string;
  readonly ad: string;
  readonly rol: string;
  readonly kalemler: readonly DebtorLedgerItemLine[];
  readonly toplamlar: readonly DebtorLedgerCurrencyTotal[];
  /**
   * Seçimlik sorumluluk: `BELIRLENEMEDI` iken `toplamlar` BOŞTUR — tutarla sınırlı (tavanı yalnız kalem tutarını
   * kapsayan) ya da uzlaşmayan kalemi olan borçluda borçlu toplamı güvenle kurulamaz; kalem satırları yine listelenir.
   */
  readonly toplamDurumu?: 'HESAPLANDI' | 'BELIRLENEMEDI';
  readonly sorumlulukOzeti?: DebtorLedgerLiabilitySummary;
  /**
   * Bu borçlu ADINA izlenen (emanette) fazla ödeme — borçlunun sorumluluğunu aşan, mahsup edilemeyen tutar.
   * Yalnız varsa gelir. Borçtan DÜŞÜLMEZ, başka borçluya aktarılmaz; kalan / toplam alanlarına GİRMEZ.
   */
  readonly borcluAdinaFazlaOdeme?: readonly DebtorLedgerHeldOverpayment[];
}

/** Borçlu adına emanette tutulan fazla ödeme (para birimi başına). */
export interface DebtorLedgerHeldOverpayment {
  readonly paraBirimi: string;
  readonly tutar: number;
  /** Bu tutarı oluşturan tahsilat sayısı. */
  readonly tahsilatSayisi: number;
}

/** Kaydedilmiş ama otomatik mahsubu bekletilen tahsilat (kimse için kalandan DÜŞÜLMEMİŞTİR). */
export interface DebtorLedgerHeldCollection {
  readonly collectionId: string;
  readonly tutar: number;
  readonly paraBirimi: string;
  readonly sebep: string;
}

export interface DebtorLedgerBalanceResult {
  readonly kaynak: 'KALICI_DEFTER';
  readonly isleyenFaizDahil: false;
  readonly not: string;
  readonly borclular: readonly DebtorLedgerBalance[];
  readonly sorumlusuBulunamayanKalemler: readonly DebtorLedgerItemLine[];
  readonly mahsubuBekleyenTahsilatlar: readonly DebtorLedgerHeldCollection[];
  /** Dosya kalanı: kalemlerin ortak kalanından; borçlu rakamları TOPLANMAZ. Yalnız sorumluluk bağlamı verildiyse. */
  readonly dosyaKalani?: readonly DebtorLedgerCurrencyRemaining[];
  readonly sorumlulukNotu?: string;
  /** Yalnız en az bir etkin borçlu adına fazla ödeme varsa gelir. */
  readonly fazlaOdemeNotu?: string;
}

const DEBTOR_OVERPAYMENT_NOTE =
  'Borçlu adına izlenen fazla ödeme, borçlunun sorumluluğunu aşan ve mahsup edilemeyen tutardır: borçtan düşülmez, ' +
  'başka borçluya aktarılmaz ve tahsilat iptaliyle kapanır. İade ve başka borca mahsup komutları bu sürümde yoktur.';

const LIABILITY_KIND_LABEL: Record<ItemLiabilityKind, DebtorLedgerLiabilityKind> = {
  UNDETERMINED: 'BELIRLENMEDI',
  LEGACY_RESTRICTED: 'KAYITTAN_KISITLI',
  JOINT_AND_SEVERAL: 'MUTESELSIL',
  PROPORTIONAL: 'PAYLI',
  CAPPED: 'TUTARLA_SINIRLI',
};

const LIABILITY_NOTE =
  'Sorumluluk türü seçilmemiş kalem "belirlenmedi"dir: ödeme bugünkü kurallarla kalemi azaltır, borçluya özgü kesin ' +
  'bakiye üretilmez. Paylı kalemde pay kalemin tam tutarından hesaplanır. Tutarla sınırlı kalemde tavan yalnız kalemin ' +
  'kayıtlı tutarını kapsar (işleyen faiz ve diğer kalemler kapsam dışıdır); bu yüzden tavanlı kalemi olan borçluda ' +
  'borçlu toplamı belirlenemedi gösterilir. Dosya kalanı tek rakamdır ve borçlu rakamlarından toplanmaz.';

function lineLiability(evaluation: EvaluatedItemLiability, debtorId: string): DebtorLedgerLineLiability {
  const party = evaluation.parties.find((candidate) => candidate.debtorId === debtorId);
  const fixed = evaluation.kind === 'UNDETERMINED' ? null : evaluation.kind === 'LEGACY_RESTRICTED' ? evaluation.remainingKurus : party?.remainingLiabilityKurus ?? null;
  return {
    tur: LIABILITY_KIND_LABEL[evaluation.kind],
    secimSurumu: evaluation.setVersion,
    pay: party?.shareKurus == null ? null : fromKurus(party.shareKurus),
    tavan: party?.limitKurus == null ? null : fromKurus(party.limitKurus),
    sinirsiz: party?.unlimited ?? false,
    tavanKapsami: evaluation.kind === 'CAPPED' ? 'ITEM_AMOUNT' : null,
    borcluHesabinaMahsup: fromKurus(evaluation.attribution.byDebtor.get(debtorId) ?? 0n),
    kalanSorumluluk: fixed === null ? null : fromKurus(fixed),
    ortakKalan: fromKurus(evaluation.remainingKurus),
    uzlasiyor: evaluation.reconciled,
  };
}

const dec = (value: Prisma.Decimal | number | string | null): Prisma.Decimal =>
  value === null ? new Prisma.Decimal(0) : new Prisma.Decimal(value as Prisma.Decimal.Value);
const money = (value: Prisma.Decimal): number => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();

function line(item: DebtorLedgerItemRow): DebtorLedgerItemLine & { readonly raw: { t: Prisma.Decimal; c: Prisma.Decimal; k: Prisma.Decimal } } {
  const t = dec(item.demandedAmount ?? item.amount);
  const c = dec(item.collectedAmount);
  const k = Prisma.Decimal.max(t.minus(c), 0);
  return {
    claimItemId: item.id,
    kalemTuru: item.itemType,
    aciklama: item.description,
    paraBirimi: item.currency,
    tutar: money(t),
    tahsilEdilen: money(c),
    kalan: money(k),
    ortak: item.isAllDebtorsLiable,
    raw: { t, c, k },
  };
}

/**
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CaseService.getDebtorLedgerBalances() → GET /cases/:id/debtor-balances
 * /// </remarks>
 */
export function buildDebtorLedgerBalances(input: {
  readonly caseDebtors: readonly DebtorLedgerCaseDebtorRow[];
  readonly items: readonly DebtorLedgerItemRow[];
  readonly heldCollections?: readonly {
    readonly collectionId: string;
    readonly amount: Prisma.Decimal | number | string;
    readonly currency: string;
    readonly holdReason: string;
  }[];
  /**
   * Seçimlik sorumluluk bağlamı (kalem → değerlendirme). Verilmezse çıktı değişiklik öncesiyle BİREBİR aynıdır.
   * Verilirse mevcut alanlar seçimsiz dosyada aynı değerleri taşır; yalnız ek alanlar gelir.
   */
  readonly liability?: { readonly evaluations: ReadonlyMap<string, EvaluatedItemLiability> };
  /**
   * Borçlu atıflı, emanetteki fazla ödemeler (kalan tutarı sıfırdan büyük). Verilmezse ya da borçluya düşen kayıt
   * yoksa çıktıya hiçbir alan EKLENMEZ. Yalnız gösterimdir: kalan / toplam hesabına girmez.
   */
  readonly debtorOverpayments?: readonly {
    readonly caseDebtorId: string;
    readonly remainingAmount: Prisma.Decimal | number | string;
    readonly currency: string;
  }[];
}): DebtorLedgerBalanceResult {
  // Borçlu → para birimi → (tutar, tahsilat sayısı). Sıfır ya da negatif kalan yok sayılır.
  const overpaymentsByCaseDebtor = new Map<string, Map<string, { amount: Prisma.Decimal; count: number }>>();
  for (const row of input.debtorOverpayments ?? []) {
    const remaining = new Prisma.Decimal(row.remainingAmount as Prisma.Decimal.Value);
    if (!remaining.greaterThan(0)) continue;
    const byCurrency = overpaymentsByCaseDebtor.get(row.caseDebtorId) ?? new Map<string, { amount: Prisma.Decimal; count: number }>();
    const acc = byCurrency.get(row.currency) ?? { amount: new Prisma.Decimal(0), count: 0 };
    byCurrency.set(row.currency, { amount: acc.amount.plus(remaining), count: acc.count + 1 });
    overpaymentsByCaseDebtor.set(row.caseDebtorId, byCurrency);
  }
  const heldOverpaymentOf = (caseDebtorId: string): { borcluAdinaFazlaOdeme?: readonly DebtorLedgerHeldOverpayment[] } => {
    const byCurrency = overpaymentsByCaseDebtor.get(caseDebtorId);
    if (!byCurrency || byCurrency.size === 0) return {};
    return {
      borcluAdinaFazlaOdeme: [...byCurrency.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([paraBirimi, v]) => ({ paraBirimi, tutar: money(v.amount), tahsilatSayisi: v.count })),
    };
  };
  const active = input.caseDebtors.filter((cd) => cd.lifecycleStatus === 'ACTIVE');
  const activeDebtorIds = new Set(active.map((cd) => cd.debtorId));
  const lines = input.items.map((item) => ({ item, line: line(item), evaluation: input.liability?.evaluations.get(item.id) }));
  const strip = ({ raw: _raw, ...rest }: ReturnType<typeof line>): DebtorLedgerItemLine => rest;
  const zero = () => new Prisma.Decimal(0);
  const kurusDec = (kurus: bigint) => new Prisma.Decimal(kurus.toString()).div(100);
  const sortedRemaining = (totals: Map<string, Prisma.Decimal>): DebtorLedgerCurrencyRemaining[] =>
    [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([paraBirimi, kalan]) => ({ paraBirimi, kalan: money(kalan) }));

  const borclular = active.map((cd): DebtorLedgerBalance => {
    // Sorumluluk bağlamı varsa kalem aidiyeti seçim kaydından okunur (seçimsiz kalemde mevcut kuralla aynı sonuç).
    const own = lines.filter(({ item, evaluation }) =>
      evaluation ? isLiableParty(evaluation, cd.debtorId) : item.isAllDebtorsLiable || item.liableDebtorIds.includes(cd.debtorId),
    );
    const totals = new Map<string, { t: Prisma.Decimal; c: Prisma.Decimal; k: Prisma.Decimal }>();
    const fixedTotals = new Map<string, Prisma.Decimal>();
    const undeterminedTotals = new Map<string, Prisma.Decimal>();
    let hasCapped = false;
    let hasUnreconciled = false;
    for (const { line: l, evaluation } of own) {
      const acc = totals.get(l.paraBirimi) ?? { t: zero(), c: zero(), k: zero() };
      const party = evaluation?.parties.find((candidate) => candidate.debtorId === cd.debtorId);
      if (evaluation && (evaluation.kind === 'PROPORTIONAL' || evaluation.kind === 'CAPPED')) {
        // Paylı / tutarla sınırlı kalemde borçlu toplamına kalemin tamamı DEĞİL, borçlunun payı / tavanı ve kendi
        // hesabına sayılan mahsup girer. Uzlaşmayan kalem toplamı belirlenemez kılar.
        if (evaluation.kind === 'CAPPED') hasCapped = true;
        if (!evaluation.reconciled || !party || party.remainingLiabilityKurus === null) {
          hasUnreconciled = true;
        } else {
          const attributed = kurusDec(party.attributedKurus);
          const remaining = kurusDec(party.remainingLiabilityKurus);
          const bound = party.shareKurus !== null ? kurusDec(party.shareKurus) : party.limitKurus !== null ? kurusDec(party.limitKurus) : l.raw.t;
          totals.set(l.paraBirimi, { t: acc.t.plus(bound), c: acc.c.plus(attributed), k: acc.k.plus(remaining) });
          fixedTotals.set(l.paraBirimi, (fixedTotals.get(l.paraBirimi) ?? zero()).plus(remaining));
        }
        continue;
      }
      totals.set(l.paraBirimi, { t: acc.t.plus(l.raw.t), c: acc.c.plus(l.raw.c), k: acc.k.plus(l.raw.k) });
      if (!evaluation) continue;
      if (evaluation.kind === 'UNDETERMINED') {
        undeterminedTotals.set(l.paraBirimi, (undeterminedTotals.get(l.paraBirimi) ?? zero()).plus(l.raw.k));
      } else {
        fixedTotals.set(l.paraBirimi, (fixedTotals.get(l.paraBirimi) ?? zero()).plus(l.raw.k));
      }
    }
    const indeterminate = hasCapped || hasUnreconciled;
    const kalemler = own.map(({ line: l, evaluation }) =>
      evaluation ? { ...strip(l), sorumluluk: lineLiability(evaluation, cd.debtorId) } : strip(l),
    );
    const toplamlar = [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([paraBirimi, v]) => ({ paraBirimi, tutar: money(v.t), tahsilEdilen: money(v.c), kalan: money(v.k) }));
    if (!input.liability) {
      return { caseDebtorId: cd.id, debtorId: cd.debtorId, ad: cd.name, rol: cd.role, kalemler, toplamlar, ...heldOverpaymentOf(cd.id) };
    }
    return {
      caseDebtorId: cd.id,
      debtorId: cd.debtorId,
      ad: cd.name,
      rol: cd.role,
      kalemler,
      toplamlar: indeterminate ? [] : toplamlar,
      toplamDurumu: indeterminate ? 'BELIRLENEMEDI' : 'HESAPLANDI',
      sorumlulukOzeti: {
        kesinSorumluluk: {
          durum: indeterminate ? 'BELIRLENEMEDI' : 'HESAPLANDI',
          neden: hasCapped ? 'TAVANLI_KALEM' : hasUnreconciled ? 'UZLASMAYAN_KALEM' : null,
          toplamlar: indeterminate ? [] : sortedRemaining(fixedTotals),
        },
        belirlenmemisOrtakKalan: sortedRemaining(undeterminedTotals),
      },
      ...heldOverpaymentOf(cd.id),
    };
  });
  const anyDebtorOverpayment = borclular.some((b) => b.borcluAdinaFazlaOdeme !== undefined);

  const sorumlusuBulunamayanKalemler = lines
    .filter(({ item, evaluation }) =>
      evaluation
        ? evaluation.kind !== 'UNDETERMINED' && ![...activeDebtorIds].some((debtorId) => isLiableParty(evaluation, debtorId))
        : !item.isAllDebtorsLiable && !item.liableDebtorIds.some((id) => activeDebtorIds.has(id)),
    )
    .map(({ line: l }) => strip(l));

  // Dosya kalanı: kalemlerin ortak kalanından (tek sayaç). Borçlu rakamlarından TOPLANMAZ.
  const fileRemaining = new Map<string, Prisma.Decimal>();
  for (const { line: l } of lines) fileRemaining.set(l.paraBirimi, (fileRemaining.get(l.paraBirimi) ?? zero()).plus(l.raw.k));

  return {
    kaynak: 'KALICI_DEFTER',
    isleyenFaizDahil: false,
    not:
      'Borçlu bazlı kalan, kalem tutarı ile kalıcı mahsup kaydından hesaplanır; işleyen faiz HARİÇTİR. Ortak kalemin ' +
      'tahsil edilen kısmı o kalemden sorumlu tüm borçlular için düşer; borçlu kalanlarının toplamı dosya borcu değildir. ' +
      'Mahsubu bekletilen tahsilatlar hiçbir borçlunun kalanından düşülmemiştir.',
    borclular,
    sorumlusuBulunamayanKalemler,
    mahsubuBekleyenTahsilatlar: (input.heldCollections ?? []).map((held) => ({
      collectionId: held.collectionId,
      tutar: money(dec(held.amount)),
      paraBirimi: held.currency,
      sebep: held.holdReason,
    })),
    ...(input.liability ? { dosyaKalani: sortedRemaining(fileRemaining), sorumlulukNotu: LIABILITY_NOTE } : {}),
    ...(anyDebtorOverpayment ? { fazlaOdemeNotu: DEBTOR_OVERPAYMENT_NOTE } : {}),
  };
}
