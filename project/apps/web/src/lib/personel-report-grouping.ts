// M2-G5b-2: personel raporu sahiplik bölümleme (gerçek kişi vs legacy).
// Backend (G5b-1) her satıra ownerType ekler: 'LAWYER' | 'STAFF' | 'LEGACY_USER'.
// KURAL: ownerType YOKSA legacy kabul edilir (eski response/cache/test patlamasın) → real DEĞİL.

export type ReportOwnerType = "LAWYER" | "STAFF" | "LEGACY_USER";

// Yalnız ownerType alanına bakar → hem api.ts PersonelReport hem yerel kopyalarla çalışır.
export interface OwnershipTagged {
  ownerType?: ReportOwnerType | string | null;
}

/** Gerçek kişi satırı mı? ownerType var VE LEGACY_USER değil. (ownerType yok → false) */
export function isRealPersonOwner<T extends OwnershipTagged>(row: T): boolean {
  return !!row.ownerType && row.ownerType !== "LEGACY_USER";
}

/** Legacy/geçiş satırı mı? ownerType yoksa VEYA LEGACY_USER ise true (güvenli varsayılan: legacy). */
export function isLegacyOwner<T extends OwnershipTagged>(row: T): boolean {
  return !isRealPersonOwner(row);
}

/** Satırları "Gerçek Kişi Sahipliği" (LAWYER/STAFF) ve "Legacy / Geçiş" (LEGACY_USER + ownerType'sız) olarak ikiye böler. */
export function splitPersonelByOwnership<T extends OwnershipTagged>(
  rows: T[]
): { realPersons: T[]; legacy: T[] } {
  return {
    realPersons: rows.filter(isRealPersonOwner),
    legacy: rows.filter(isLegacyOwner),
  };
}
