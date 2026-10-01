/**
 * K3-L — mahsubu BEKLETİLEN tahsilat (CollectionAllocationHold HELD) için gösterim yardımcıları.
 *
 * Kural: bekletilen tahsilat kaydedilmiştir ama henüz hiçbir borçlu hesabına düşmemiştir → "tahsil edilen" toplamına
 * girmez, borçtan düşülmüş gibi gösterilmez; ayrı "mahsubu bekleyen" satırında gösterilir. Tutar HESABI sunucudadır;
 * buradaki toplama yalnız ekranda zaten listelenen satırların ayrımıdır.
 */
import { recordCurrencyCode, sharedRecordCurrency } from "./record-currency-display";

export interface AllocationHoldAwareCollection {
  allocationHold?: { status?: string | null; holdReason?: string | null } | null;
}

export function isAllocationHeldCollection(collection: AllocationHoldAwareCollection | null | undefined): boolean {
  return collection?.allocationHold?.status === "HELD";
}

export interface CollectionFinanceItemLike {
  type: string;
  amount: number;
  allocationHeld?: boolean;
  /** Tahsilat kaydının kendi para birimi; alan boşsa şema varsayılanı (TRY) sayılır */
  currency?: string | null;
}

export interface CollectionFinanceTotals {
  /** Mahsup edilmiş (bekletilmeyen) tahsilat toplamı */
  allocated: number;
  /** Mahsubu bekleyen tahsilat toplamı — borçtan düşülmedi */
  held: number;
  heldCount: number;
}

/** Kuruş üzerinden toplar (kayan nokta birikmesi olmasın). Yalnız TAHSILAT satırları. */
export function splitCollectionFinanceTotals(items: readonly CollectionFinanceItemLike[] | null | undefined): CollectionFinanceTotals {
  let allocatedCents = 0;
  let heldCents = 0;
  let heldCount = 0;
  for (const item of items ?? []) {
    if (item.type !== "TAHSILAT") continue;
    const cents = Math.round(Number(item.amount || 0) * 100);
    if (item.allocationHeld) {
      heldCents += cents;
      heldCount += 1;
    } else {
      allocatedCents += cents;
    }
  }
  return { allocated: allocatedCents / 100, held: heldCents / 100, heldCount };
}

export interface CollectionFinanceTotalCurrencies {
  /** Mahsup edilmiş tahsilat toplamının para birimi; null = o gruptaki kayıtlar birden fazla para biriminde */
  allocated: string | null;
  /** Mahsubu bekleyen tahsilat toplamının para birimi; null = o gruptaki kayıtlar birden fazla para biriminde */
  held: string | null;
}

/**
 * `splitCollectionFinanceTotals` toplamlarının para birimi. Bir toplam yalnız o gruptaki (mahsup edilmiş / bekletilen)
 * tahsilatların TÜMÜ aynı para birimindeyse yazılabilir; değilse `null` döner ve çağıran o toplamı YAZMAZ: farklı para
 * birimleri tek sayıda toplanmaz, tutar çevrilmez (RECEIVABLE-GOVERNANCE REC-ALLOC-008, REC-FX-001/002). Grupta tahsilat
 * yoksa toplam 0'dır ve dosyanın para birimiyle (`caseCurrency`; boşsa şema varsayılanı) etiketlenir.
 * Yalnız TAHSILAT satırları.
 */
export function collectionFinanceTotalCurrencies(
  items: readonly CollectionFinanceItemLike[] | null | undefined,
  caseCurrency?: string | null,
): CollectionFinanceTotalCurrencies {
  const allocated: CollectionFinanceItemLike[] = [];
  const held: CollectionFinanceItemLike[] = [];
  for (const item of items ?? []) {
    if (item.type !== "TAHSILAT") continue;
    (item.allocationHeld ? held : allocated).push(item);
  }
  const currencyOf = (group: readonly CollectionFinanceItemLike[]) =>
    group.length === 0 ? recordCurrencyCode(caseCurrency) : sharedRecordCurrency(group);
  return { allocated: currencyOf(allocated), held: currencyOf(held) };
}
