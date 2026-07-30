/**
 * CLIENT-ARC-07-LIFECYCLE-INVARIANT-I01 — ClientAddress yaşam döngüsü invariant çözümleyicisi.
 *
 * KANONİK OTORİTE: `CLIENT-GOVERNANCE-CHARTER.md` §49 (ARC-07 D01/D02, owner-ratified).
 *
 * SAF ve DETERMİNİSTİK: veritabanına erişmez, yan etkisi yoktur, framework'e bağlı değildir.
 * Girdi olarak TEK bir müvekkilin ÖNGÖRÜLEN (prospective) adres-durum kümesini alır ve
 * kümenin §49 invariant'larını sağlayıp sağlamadığını söyler.
 *
 * KAPSAM SINIRI (I01): bu modül arşivleme/geri yükleme DAVRANIŞI UYGULAMAZ. `isCurrent=false`
 * durumlarını yalnız DOĞRULAMA amacıyla modelleyebilir; runtime'da `isCurrent` mutasyonu
 * I02'ye (`CLIENT-ARC-07-ARCHIVE-RESTORE-AUDIT-I02`) ertelenmiştir.
 */

/** §49 invariant kimlikleri (charter §49.2/§49.3 ile birebir). */
export const CLIENT_ADDRESS_INVARIANTS = {
  INV_01: 'INV-01', // isPrimary=true -> isCurrent=true zorunlu
  INV_02: 'INV-02', // isCurrent=false -> isPrimary=false zorunlu
  INV_03: 'INV-03', // en az bir current varsa TAM BİR current primary
  INV_04: 'INV-04', // sıfır primary yalnız sıfır current varken izinli
  INV_05: 'INV-05', // çok current İZİNLİ (ihlal üretmez)
  INV_06: 'INV-06', // çok primary YASAK
  INV_07: 'INV-07', // arşiv (non-current) satır primary seçimine KATILMAZ
  INV_08: 'INV-08', // tenant/client sınırlı; müvekkiller arası akıl yürütülmez
} as const;

/**
 * Kanonik ihlal kodları — DÖRT tane.
 *
 * KOD BİRLEŞTİRME (kasıtlı, mükerrer kod üretilmedi):
 *   INV-01 ve INV-02 AYNI koşulun iki ifadesidir (`isPrimary && !isCurrent`) — biri diğerinin
 *   kontrapozitifidir. Bu yüzden `ARCHIVED_PRIMARY` ayrı bir kod olarak ÜRETİLMEDİ;
 *   `PRIMARY_NOT_CURRENT` her ikisini de temsil eder.
 *   INV-03'ün "primary yok" dalı ile INV-04 de AYNI koşuldur (`currentCount > 0 &&
 *   primaryCount === 0`) — `ZERO_PRIMARY_WITH_CURRENT` ayrı kod olarak ÜRETİLMEDİ;
 *   `CURRENT_WITHOUT_PRIMARY` her ikisini de temsil eder.
 */
export type ClientAddressLifecycleViolationCode =
  | 'CLIENT_SCOPE_MISMATCH'
  | 'PRIMARY_NOT_CURRENT'
  | 'MULTIPLE_PRIMARY'
  | 'CURRENT_WITHOUT_PRIMARY';

/** Invariant değerlendirmesi için gereken MİNİMUM satır projeksiyonu — adres İÇERİĞİ İSTENMEZ. */
export interface ClientAddressLifecycleRow {
  /** Yeni (henüz yazılmamış) satırlar için verilmeyebilir. */
  id?: string | null;
  clientId: string;
  isPrimary: boolean;
  isCurrent: boolean;
}

export interface ClientAddressLifecycleResult {
  valid: boolean;
  /** Yalnız `valid === false` iken dolu. */
  code?: ClientAddressLifecycleViolationCode;
  /** İhlal edilen invariant kimliği (ör. 'INV-06'). */
  invariant?: string;
  /** İhlalin insan-okur, SINIRLI açıklaması — kişisel veri veya kayıt dökümü İÇERMEZ. */
  detail?: string;
}

const VALID: ClientAddressLifecycleResult = { valid: true };

/**
 * Öngörülen adres-durum kümesini §49'a karşı değerlendirir.
 *
 * DETERMİNİSTİK: girdi SIRASI sonucu DEĞİŞTİRMEZ. Birden çok ihlal aynı anda varsa sabit
 * öncelik uygulanır:
 *   1. CLIENT_SCOPE_MISMATCH  (INV-08 — kapsam hatası her şeyden önce gelir)
 *   2. PRIMARY_NOT_CURRENT    (INV-01/INV-02)
 *   3. MULTIPLE_PRIMARY       (INV-06)
 *   4. CURRENT_WITHOUT_PRIMARY(INV-03/INV-04)
 *
 * @param clientId Değerlendirmenin sınırı. Kümedeki her satır bu müvekkile ait OLMALIDIR.
 * @param rows     Bu müvekkilin öngörülen TAM adres kümesi (yazma SONRASI beklenen durum).
 */
export function evaluateClientAddressLifecycle(
  clientId: string,
  rows: ClientAddressLifecycleRow[],
): ClientAddressLifecycleResult {
  // INV-08 — client sınırı. Başka müvekkilin satırı invariant'ı SAĞLAYAMAZ.
  const foreign = rows.find((r) => r.clientId !== clientId);
  if (foreign) {
    return {
      valid: false,
      code: 'CLIENT_SCOPE_MISMATCH',
      invariant: CLIENT_ADDRESS_INVARIANTS.INV_08,
      detail: 'Adres kümesi tek bir müvekkile ait değil.',
    };
  }

  // INV-01 / INV-02 — primary olan satır current OLMALIDIR (arşiv satır primary OLAMAZ).
  const primaryNotCurrent = rows.some((r) => r.isPrimary && !r.isCurrent);
  if (primaryNotCurrent) {
    return {
      valid: false,
      code: 'PRIMARY_NOT_CURRENT',
      invariant: CLIENT_ADDRESS_INVARIANTS.INV_01,
      detail: 'Birincil adres güncel (current) olmak zorundadır.',
    };
  }

  // INV-07 — primary sayımı YALNIZ current satırlar üzerinden yapılır.
  const currentRows = rows.filter((r) => r.isCurrent);
  const currentPrimaryCount = currentRows.filter((r) => r.isPrimary).length;

  // INV-06 — çok primary YASAK.
  if (currentPrimaryCount > 1) {
    return {
      valid: false,
      code: 'MULTIPLE_PRIMARY',
      invariant: CLIENT_ADDRESS_INVARIANTS.INV_06,
      detail: 'Bir müvekkilin yalnız bir birincil adresi olabilir.',
    };
  }

  // INV-03 / INV-04 — current varsa TAM BİR primary; sıfır primary yalnız sıfır current'ta.
  // INV-05 gereği current sayısının BİRDEN FAZLA olması ihlal DEĞİLDİR.
  if (currentRows.length > 0 && currentPrimaryCount === 0) {
    return {
      valid: false,
      code: 'CURRENT_WITHOUT_PRIMARY',
      invariant: CLIENT_ADDRESS_INVARIANTS.INV_03,
      detail: 'Güncel adres varken bir adres birincil olmak zorundadır.',
    };
  }

  return VALID;
}

/** Kolaylık sarmalayıcı: yalnız geçerlilik bilgisi gerektiğinde. */
export function isClientAddressLifecycleValid(
  clientId: string,
  rows: ClientAddressLifecycleRow[],
): boolean {
  return evaluateClientAddressLifecycle(clientId, rows).valid;
}
