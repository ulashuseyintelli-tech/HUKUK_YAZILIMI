import { Prisma } from '@prisma/client';

/**
 * K3-L Faz 1c (owner kararı 2026-09-29 "önce defterden, faiz ayrı") — borçlu bazlı bakiye KALICI DEFTERDEN.
 *
 * Kaynak: kalem kaydı (`demandedAmount`) ve kalıcı mahsup (`collectedAmount` = LedgerAllocation toplamı; Faz 1b'den
 * itibaren TBK100 sırasıyla ve YALNIZ ödeyenin sorumlu olduğu kalemlere). Her borçlu için yalnız sorumlu olduğu kalemler
 * (`isAllDebtorsLiable` veya `liableDebtorIds` ∋ Debtor.id). Ortak kalemin tahsil edilen kısmı o kalemden sorumlu HERKES
 * için düşer (müteselsil); borçlu kalanları toplanınca dosya borcunu VERMEZ.
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
}): DebtorLedgerBalanceResult {
  const active = input.caseDebtors.filter((cd) => cd.lifecycleStatus === 'ACTIVE');
  const activeDebtorIds = new Set(active.map((cd) => cd.debtorId));
  const lines = input.items.map((item) => ({ item, line: line(item) }));
  const strip = ({ raw: _raw, ...rest }: ReturnType<typeof line>): DebtorLedgerItemLine => rest;

  const borclular = active.map((cd): DebtorLedgerBalance => {
    const own = lines.filter(({ item }) => item.isAllDebtorsLiable || item.liableDebtorIds.includes(cd.debtorId));
    const totals = new Map<string, { t: Prisma.Decimal; c: Prisma.Decimal; k: Prisma.Decimal }>();
    for (const { line: l } of own) {
      const acc = totals.get(l.paraBirimi) ?? { t: new Prisma.Decimal(0), c: new Prisma.Decimal(0), k: new Prisma.Decimal(0) };
      totals.set(l.paraBirimi, { t: acc.t.plus(l.raw.t), c: acc.c.plus(l.raw.c), k: acc.k.plus(l.raw.k) });
    }
    return {
      caseDebtorId: cd.id,
      debtorId: cd.debtorId,
      ad: cd.name,
      rol: cd.role,
      kalemler: own.map(({ line: l }) => strip(l)),
      toplamlar: [...totals.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([paraBirimi, v]) => ({ paraBirimi, tutar: money(v.t), tahsilEdilen: money(v.c), kalan: money(v.k) })),
    };
  });

  const sorumlusuBulunamayanKalemler = lines
    .filter(({ item }) => !item.isAllDebtorsLiable && !item.liableDebtorIds.some((id) => activeDebtorIds.has(id)))
    .map(({ line: l }) => strip(l));

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
  };
}
