/**
 * K3-L — mahsubu BEKLETİLEN tahsilat (CollectionAllocationHold HELD) için gösterim yardımcıları.
 *
 * Kural: bekletilen tahsilat kaydedilmiştir ama henüz hiçbir borçlu hesabına düşmemiştir → "tahsil edilen" toplamına
 * girmez, borçtan düşülmüş gibi gösterilmez; ayrı "mahsubu bekleyen" satırında gösterilir. Tutar HESABI sunucudadır;
 * buradaki toplama yalnız ekranda zaten listelenen satırların ayrımıdır.
 */
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
