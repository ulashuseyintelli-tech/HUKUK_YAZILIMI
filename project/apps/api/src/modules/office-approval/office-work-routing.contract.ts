/**
 * OFFICE-WR01-B01 — WORK ROUTING CONTRACT (D-WR-3 politika sozlugu).
 *
 * KAPSAM: saf tip/sozlesme. Sifir runtime davranisi, sifir schema, sifir servis.
 * Bu dosya karar VERMEZ; yalniz D-WR-3'un ratifiye politika sozlugunu derleme
 * zamaninda temsil eder ve tuketicilerin typo ile yeni politika uretmesini engeller.
 *
 * KAPSAM DISI (bilerek tanimlanmadi — B01 bunlari cevaplamaz):
 *  - D-WR-7 `ALL override` davranisi. Karar OPEN'dir; B01 yon secmez.
 *  - Politika secim/cozum algoritmasi, quorum hesabi, sira yonetimi, eskalasyon → B06.
 *  - Bildirim fan-out'u ve digest → B07. Bkz. asagidaki "KARAR ≠ BILDIRIM" serhi.
 *  - Delegasyon tasiyicisi (D-WR-3'un delegasyon yarisi): tasiyici secimi owner
 *    sorusudur (decomposition brief §3.7 / Acik Soru 6); burada model icat edilmez.
 *  - Persistence, entity, DTO, endpoint, guard, provider, migration.
 *
 * @see project/docs/governance/office-wr01-decomposition-r01/wr01-decomposition-brief-r01.md
 * @see office-work-routing-taxonomy.ts (D-WR-4 actionCode siniflandirmasi)
 */

/**
 * D-WR-3 kanonik politika sozlugu. Sira anlam tasimaz; kume kapalidir.
 *
 * Bu bes deger disinda politika uretilemez: tuketiciler `OfficeWorkApprovalPolicy`
 * tipine baglandiginda serbest string kabul edilmez.
 */
export const OFFICE_WORK_APPROVAL_POLICIES = [
  'ANY_ONE',
  'ALL',
  'QUORUM',
  'SEQUENTIAL',
  'PARALLEL',
] as const;

/** D-WR-3 politika kimligi. Serbest string DEGILDIR. */
export type OfficeWorkApprovalPolicy = (typeof OFFICE_WORK_APPROVAL_POLICIES)[number];

/**
 * Politika + politikaya ozgu sozlesme alanlari.
 *
 * Discriminated union bilerek secildi: `requiredDecisionCount` YALNIZ `QUORUM`
 * varyantinda vardir. Diger politikalarda bu alanin verilmesi derleme hatasidir,
 * yani gecersiz kombinasyon tip duzeyinde temsil EDILEMEZ.
 *
 * KARAR ≠ BILDIRIM (D-WR-3): bu tip yalniz **kapanis karar** tarafini temsil eder.
 * Bildirim kumesi (kime haber gidecegi) bu sozlesmenin parcasi DEGILDIR ve B07'nin
 * konusudur. Ikisi ayri tiplerde tutuldugu icin yapisal olarak karistirilamaz —
 * "bildirim kumesi = karar sayisi" hatasi bu ayrimla onlenir.
 */
export type OfficeWorkApprovalPolicySpec =
  | { readonly policy: 'ANY_ONE' }
  | { readonly policy: 'ALL' }
  | {
      readonly policy: 'QUORUM';
      /**
       * Kapanis icin gereken **karar** sayisi. Bildirim kumesinin buyuklugunden
       * bagimsizdir. Deger dogrulamasi (pozitif tamsayi, uygun aday sayisini asmama)
       * B06'nin runtime isidir; B01 hesaplama yapmaz.
       */
      readonly requiredDecisionCount: number;
    }
  | { readonly policy: 'SEQUENTIAL' }
  | { readonly policy: 'PARALLEL' };

/**
 * Sozluk disi bir degerin politika olmadigini derleme zamani daraltmasiyla birlikte
 * bildiren saf predikat (IO yok, yan etki yok).
 *
 * Emsal: `client-financial-disclosure-approval-eligibility.ts` — saf, IO-suz, tek
 * kaynak predikat deseni.
 */
export function isOfficeWorkApprovalPolicy(value: unknown): value is OfficeWorkApprovalPolicy {
  return (
    typeof value === 'string' &&
    (OFFICE_WORK_APPROVAL_POLICIES as readonly string[]).includes(value)
  );
}
