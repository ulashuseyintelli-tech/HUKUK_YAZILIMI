import { OfficeWorkPoolKind, StaffType } from '@prisma/client';

/**
 * OFFICE-WR01-B02 AŞAMA 3 — EFFECTIVE-DATED HAVUZ RESOLVER SÖZLEŞMESİ (§7.1-7.8).
 *
 * KAPSAM: saf tip/sözleşme. Sıfır IO, sıfır Nest wiring, sıfır runtime davranışı.
 * Bu dosya hiçbir okuyucuyu değiştirmez; AŞAMA 3 tüketici cutover'ı 0/6'dır ve
 * düz diziler (`Office.opStaffTypes`, `escalationManagerLawyerIds`,
 * `escalationFounderLawyerIds`) source-of-truth olarak KALIR (§9.1, OD-B02-03).
 *
 * KAPSAM DIŞI (ayrı owner yetkisi gerekir):
 *  - `getOrCreate` anchor yazımı + gap içi idempotent catch-up → AŞAMA 4 (zorunlu predecessor).
 *  - Admin dual-write / `applyTargetState()` mutation primitive'i → AŞAMA 4, G3-G7.
 *  - Drift gözlemi → AŞAMA 5. Okuma cutover'ı → AŞAMA 6, G8.
 *
 * @see project/docs/governance/office-wr01-decomposition-r01/b02-effective-dated-pools-design-r01.md
 * @see office-work-pool.evaluator.ts (saf predikat + küme semantiği)
 * @see office-work-pool-resolver.service.ts (orchestration + structured diagnostic log)
 */

/** Havuz üyesinin taşıyıcı türü. Kapalı küme; üçüncü taşıyıcı üretilemez. */
export const OFFICE_WORK_POOL_MEMBER_CARRIERS = ['LAWYER', 'STAFF_TYPE'] as const;

/** Taşıyıcı kimliği. Serbest string DEĞİLDİR. */
export type OfficeWorkPoolMemberCarrier = (typeof OFFICE_WORK_POOL_MEMBER_CARRIERS)[number];

/**
 * Her `OfficeWorkPoolKind` → tam bir üye taşıyıcısı (§6.1).
 *
 * EKSİKSİZLİK KİLİDİ: `satisfies Record<OfficeWorkPoolKind, ...>` olduğu için enum'a yeni
 * havuz eklenip bu tablo güncellenmezse **typecheck kırılır** (OD-B02-02 ileride
 * `ESCALATION_TEAM_LEAD` / `POA_EXPIRY_RECIPIENT` açarsa tam da bu kilit devreye girer).
 * `as const` literal tipleri korur; aşağıdaki daraltılmış union'lar bu literallerden türer.
 * Örtük fallback, `default: 'LAWYER'` ve permissive index signature BİLEREK kullanılmadı.
 * Aynı desenin repodaki emsali: `OFFICE_WORK_ACTION_CATEGORY` (B01 taxonomy).
 */
export const OFFICE_WORK_POOL_MEMBER_CARRIER = {
  OP_STAFF_TYPE: 'STAFF_TYPE',
  ESCALATION_MANAGER: 'LAWYER',
  ESCALATION_FOUNDER: 'LAWYER',
} as const satisfies Record<OfficeWorkPoolKind, OfficeWorkPoolMemberCarrier>;

/** Verilen taşıyıcıya sahip havuz türlerini derleme zamanında süzer. */
type OfficeWorkPoolKindWithCarrier<C extends OfficeWorkPoolMemberCarrier> = {
  [K in OfficeWorkPoolKind]: (typeof OFFICE_WORK_POOL_MEMBER_CARRIER)[K] extends C ? K : never;
}[OfficeWorkPoolKind];

/**
 * Lawyer-id taşıyıcılı havuzlar. `resolveLawyerPool` YALNIZ bunları kabul eder;
 * `OP_STAFF_TYPE` geçirmek derleme hatasıdır (§7.8).
 */
export type OfficeLawyerPoolKind = OfficeWorkPoolKindWithCarrier<'LAWYER'>;

/** StaffType taşıyıcılı havuzlar. `resolveStaffTypePool` YALNIZ bunları kabul eder (§7.8). */
export type OfficeStaffTypePoolKind = OfficeWorkPoolKindWithCarrier<'STAFF_TYPE'>;

/**
 * `UNKNOWN` gerekçesi. Kapalı kümedir ve `RESOLVED / EMPTY` ile ASLA birleştirilmez (§7.6):
 *  - `ANCHOR_MISSING`      : havuz için knowledge-boundary anchor'ı yok → fail-closed.
 *  - `BEFORE_KNOWN_FROM`   : sorgu anı bilgi sınırından önce → sistem hiçbir iddiada bulunmaz.
 */
export type OfficeWorkPoolUnknownReason = 'ANCHOR_MISSING' | 'BEFORE_KNOWN_FROM';

/**
 * Resolver'ın toplam dönüş tipi (§7.6'nın ÜÇ durumu).
 *
 * Discriminated union BİLEREK seçildi ve ham dizi (`string[]` / `StaffType[]`) YETERSİZDİR:
 * `UNKNOWN` ("bilmiyorum") ile `RESOLVED / EMPTY` ("biliyorum, gerçekten boştu") ham dizide
 * ayırt EDİLEMEZ — `CF-B02-01`'in düzelttiği hata tam olarak bu indirgemedir.
 *
 * `UNKNOWN` varyantının `members` alanı **boş tuple** (`readonly []`) tipindedir: bilgi
 * yokken üye taşımak tip düzeyinde İMKÂNSIZDIR. §7.8'deki `string[]` / `StaffType[]`
 * ifadeleri toplam dönüş tipi değil, YALNIZ `members` taşıyıcısının tipidir.
 */
export type OfficeWorkPoolResolution<TMember> =
  | {
      readonly status: 'UNKNOWN';
      readonly reason: OfficeWorkPoolUnknownReason;
      readonly members: readonly [];
    }
  | {
      readonly status: 'RESOLVED';
      readonly members: readonly TMember[];
    };

/** Lawyer havuzu sonucu (üye = `Lawyer.id`). */
export type OfficeLawyerPoolResolution = OfficeWorkPoolResolution<string>;

/** Staff-type havuzu sonucu (üye = `StaffType` enum değeri, kimlik DEĞİL). */
export type OfficeStaffTypePoolResolution = OfficeWorkPoolResolution<StaffType>;

/**
 * Saf evaluator'ın ürettiği yapısal anomali bildirimi.
 *
 * Evaluator LOG YAZMAZ (IO yok); yalnız veri üretir. Loglama resolver katmanının işidir
 * (§7 "saf predikat + tek repository sorgusu" ayrımı).
 */
export type OfficeWorkPoolDiagnostic =
  /**
   * Aynı `(tenantId, poolKind, üye)` için AYNI `asOf` anında birden fazla aktif satır (§7.4).
   * Farklı ÜYELERİN aynı anda aktif olması normaldir ve bu tanı üretilmez.
   */
  | {
      readonly code: 'DUPLICATE_ACTIVE_MEMBER';
      readonly poolKind: OfficeWorkPoolKind;
      readonly memberKey: string;
      readonly activeRowCount: number;
      readonly rowIds: readonly string[];
    }
  /**
   * Satırın üye taşıyıcısı havuzun taşıyıcısıyla uyuşmuyor (ör. `ESCALATION_MANAGER`
   * satırında `memberLawyerId IS NULL`). Migration'daki CHECK 1-2 bunu DB düzeyinde
   * imkânsız kılar; buradaki eleme ikinci savunma hattıdır ve satır SONUCA GİRMEZ.
   */
  | {
      readonly code: 'MEMBER_CARRIER_MISMATCH';
      readonly poolKind: OfficeWorkPoolKind;
      readonly rowId: string;
      readonly expectedCarrier: OfficeWorkPoolMemberCarrier;
    }
  /**
   * Satır çağıranın tenant'ına ait değil. Repository sorgusu zaten tenant-scoped'dur;
   * bu eleme predikatın ZORUNLU tenant maddesinin (§7.5) saf katmanda da yaşadığını
   * kanıtlar ve satırı SONUÇTAN düşürür.
   */
  | {
      readonly code: 'CROSS_TENANT_ROW';
      readonly poolKind: OfficeWorkPoolKind;
      readonly rowId: string;
    }
  /**
   * Satır bu havuza ait değil (snapshot birden fazla havuz taşıyorsa). Satır SONUCA GİRMEZ.
   */
  | {
      readonly code: 'POOL_KIND_MISMATCH';
      readonly poolKind: OfficeWorkPoolKind;
      readonly rowId: string;
      readonly rowPoolKind: OfficeWorkPoolKind;
    };

/**
 * Saf evaluator çıktısı: karar + yapısal tanılar. Tanı üretilmesi kararı DEĞİŞTİRMEZ
 * (§7.4: "degrade + gözlemle"; hata fırlatmak eskalasyon/bildirim motorlarını durdururdu).
 */
export interface OfficeWorkPoolEvaluation<TMember> {
  readonly resolution: OfficeWorkPoolResolution<TMember>;
  readonly diagnostics: readonly OfficeWorkPoolDiagnostic[];
}

/**
 * Sözleşme ihlali. YALNIZ tip sisteminin atlandığı durumda (JS çağrısı, `as any`) oluşur:
 * lawyer havuzu bekleyen imzaya staff-type havuzu geçilmesi gibi.
 *
 * Neden `UNKNOWN` değil de throw: `OfficeWorkPoolUnknownReason` kapalı bir kümedir ve
 * "yanlış taşıyıcı" bir BİLGİ YOKLUĞU değil bir PROGRAMLAMA HATASIDIR. Onu `UNKNOWN`'a
 * çevirmek hatayı sessizleştirir; §7.4'ün "throw etme" gerekçesi ise veri anomalisine
 * özgüdür ve buraya taşınmaz.
 */
export class OfficeWorkPoolContractViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfficeWorkPoolContractViolationError';
  }
}
