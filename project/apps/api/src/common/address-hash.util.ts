import { createHash } from "crypto";

/**
 * RFA-006 — DebtorAddress dedup altyapısı.
 *
 * Şemada `@@unique([debtorId, addressHash])` (debtor_address_hash_unique) ZATEN vardı ama
 * addressHash hiçbir yerde hesaplanmıyordu (DEAD-1) → null hep null, Postgres'te null≠null →
 * mükerrer adres yığılıyordu. Bu util adresi normalize edip SHA-256 hash üretir; tüm write
 * yolları (addAddress, AddressService, debtor.create inline, cross-file/institution/uyap discovery)
 * bunu kullanır → guard tek-kaynak (mantık 6 kez replike edilmez).
 *
 * NOT (kapsam): Bu PR yalnız BUNDAN SONRAKİ write'larda hash üretir. Mevcut null-hash satırlar
 * için backfill AYRI op'tur (PR sonrası, doğrulamalı).
 */

/** Türkçe/diakritik fold + noktalama temizliği + tek boşluk + uppercase. null/undefined güvenli. */
function foldField(v: string | null | undefined): string {
  return String(v ?? "")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export interface NormalizableAddress {
  street?: string | null;
  district?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

/** Adresi tek normalize anahtara indirger (street|district|city|postalCode|country). */
export function normalizeAddress(a: NormalizableAddress): string {
  return [a.street, a.district, a.city, a.postalCode, a.country]
    .map((x) => foldField(x))
    .filter(Boolean)
    .join("|");
}

/**
 * Normalize adresten SHA-256 hash. False-positive guard: street VE city anlamlı değilse null döner
 * (eksik/kalitesiz adres yanlışlıkla başka eksik adrese eşleşmesin → null'lar Postgres'te çakışmaz).
 */
export function computeAddressHash(a: NormalizableAddress): string | null {
  if (!foldField(a?.street) || !foldField(a?.city)) return null;
  return createHash("sha256").update(normalizeAddress(a)).digest("hex");
}

/**
 * Adres find-or-create (idempotent dedup). data.debtorId + adres alanlarından hash hesaplar:
 *  - hash hesaplanabiliyorsa (debtorId, addressHash) ile mevcut ara → varsa MEVCUDU döndür (yeni yok)
 *  - yoksa addressHash set ederek create
 *  - hash null (kalitesiz adres) → düz create (dedup yok; false-positive engellenir)
 * Race-safe: create P2002 alırsa tekrar findFirst → mevcut. 409 YOK (adres ekleme idempotent).
 *
 * `db` = PrismaService veya $transaction client (tx). `created` = yeni satır açıldı mı.
 */
export async function findOrCreateDebtorAddress(
  db: any,
  data: { debtorId: string } & NormalizableAddress & Record<string, any>,
): Promise<{ address: any; created: boolean }> {
  const hash = computeAddressHash(data);
  if (!hash) {
    const address = await db.debtorAddress.create({ data });
    return { address, created: true };
  }
  const existing = await db.debtorAddress.findFirst({
    where: { debtorId: data.debtorId, addressHash: hash },
  });
  if (existing) return { address: existing, created: false };
  try {
    const address = await db.debtorAddress.create({ data: { ...data, addressHash: hash } });
    return { address, created: true };
  } catch (e: any) {
    if (e?.code === "P2002") {
      const again = await db.debtorAddress.findFirst({
        where: { debtorId: data.debtorId, addressHash: hash },
      });
      if (again) return { address: again, created: false };
    }
    throw e;
  }
}
