/**
 * OFFICE-P2-CAP02 — AUTHORITY ⟷ HİYERARŞİ TELEMETRİSİ (SAF ÇEKİRDEK).
 *
 *   OFFICE-P2-CAP02-SHADOW-NEUTRAL-TELEMETRY-REPAIR-I01        (owner OPTION A)
 *   OFFICE-P2-CAP02-DORMANT-HIERARCHY-POLICY-CONTAINMENT-I01   (bu temizlik)
 *
 * Bu dosya `ReportingLine` hiyerarşisi ile yürürlükteki approval kararını KARŞILAŞTIRIR
 * ve yalnız bir ÖLÇÜM kaydı üretir. Hiçbir yetki sonucu HESAPLAMAZ.
 *
 * OWNER KARARI (2026-07-28): `ReportingLine` yalnız organizasyonel hiyerarşi gerçeğidir;
 * ondan `ALLOW` / `DENY` / `SELF_AUTHORITY` / `REQUIRES_APPROVAL` ÜRETİLEMEZ. Bu kararla
 * birlikte, hiyerarşiden `ALLOW`/`DENY` türeten eski ÖZNE→HEDEF karşılaştırması
 * (`compareShadowDecision` ve yalnız ona ait tipler) KALDIRILDI: kanonik dayanağı yoktu
 * ve hiçbir tüketicisi bulunmuyordu. Tarihçe git geçmişinde korunur.
 *
 * MİMARİ İLKE — bu dosya Prisma/NestJS import ETMEZ, DB'ye erişemez, sistem saati ve
 * `fs` kullanmaz. Tek public yüzeyi bir karşılaştırma kaydı ve onun düz audit olayıdır.
 */

// ---------------------------------------------------------------------------
// AUTHORITY ⟷ HİYERARŞİ TELEMETRİSİ — NÖTR ÖLÇÜM, KARAR DEĞİL
// ---------------------------------------------------------------------------
//
// OWNER KARARI (2026-07-28, OPTION A). `ReportingLine` YALNIZ organizasyonel
// hiyerarşi gerçeğidir. Aşağıdaki eşleme authorization policy olarak KULLANILAMAZ
// ve bu modülde ÜRETİLMEZ:
//
//     TOP_LEVEL → SELF_AUTHORITY
//     MANAGED   → REQUIRES_APPROVAL
//
// Bu eşleme için kanonik authority BULUNMADIĞI tespit edilmiştir. Dolayısıyla bu
// katman `allow` / `deny` / `requiresApproval` / `selfAuthority` KARARI ÜRETMEZ,
// "hiyerarşi ne karar verirdi" SORUSUNU CEVAPLAMAZ.
//
// ÜRETTİĞİ TEK ŞEY: iki BAĞIMSIZ sınıflandırmanın aynı sınıfa düşüp düşmediği.
//   incumbentVerdict        yürürlükteki (rütbe tabanlı) seam'in KENDİ kararının kaydı
//   hierarchyDisposition    aktörün ReportingLine sınıfı
//   comparison              SAME_CLASS | DIFFERENT_CLASS | UNCOMPARABLE
//
// `DIFFERENT_CLASS` "yanlış" demek DEĞİLDİR; yalnız iki sınıflandırmanın ayrıştığını
// söyler. Hangisinin doğru olduğu — ve hiyerarşinin authorization'a girip girmeyeceği —
// owner kararıdır ve bu modülün DIŞINDADIR.

/**
 * Yürürlükteki (rütbe tabanlı) approval seam'inin verdiği kararın KAYDI.
 * Bu modül bu değeri ÜRETMEZ; çağıran, canlı seam'in çıktısını olduğu gibi geçirir.
 */
export type IncumbentAuthorityVerdict = 'SELF_AUTHORITY' | 'REQUIRES_APPROVAL';

/** Aktörün ReportingLine sınıfı. Aktif kayıt yoksa `MISSING_HIERARCHY`. */
export type HierarchyDispositionClass = 'TOP_LEVEL' | 'MANAGED' | 'MISSING_HIERARCHY';

/** Nötr karşılaştırma sonucu. Karar DEĞİL, sınıf denkliği. */
export type TelemetryComparison = 'SAME_CLASS' | 'DIFFERENT_CLASS' | 'UNCOMPARABLE';

/** Karşılaştırmanın neden yapılamadığı. Yokluk sessizce bir sınıfa SAYILMAZ. */
export type UncomparableReason = 'MISSING_HIERARCHY' | 'ACTOR_INACTIVE' | 'CROSS_TENANT';

export interface AuthorityHierarchyTelemetryInput {
  /** Opak korelasyon kimliği; kişisel veri taşımaz. */
  correlationId: string;
  tenantId: string;
  actorUserId: string;
  /** Yürürlükteki kararın KAYDI — bu modül onu ne üretir ne değiştirir. */
  incumbentVerdict: IncumbentAuthorityVerdict;
  /** Yürürlükteki kararın gerekçe kodu (ör. PARTNER_SELF_AUTHORITY); serbest metin DEĞİL. */
  incumbentReasonCode: string;
  /** Yürürlükteki kararın sıfat alanı (ör. PARTNER / SEKRETER / UNKNOWN). */
  incumbentCapacity: string;
  /**
   * Yalnız GÖZLEM BAĞLAMI (hangi işlem sırasında ölçüldü). Karşılaştırmaya GİRMEZ;
   * bu modülde hiçbir dalın koşulu değildir.
   */
  observedActionCode?: string;
}

/** Aktörün ReportingLine tarafındaki gerçekleri (snapshot; bu modül DB'ye erişmez). */
export interface ActorHierarchyFacts {
  actorIsActive: boolean;
  actorTenantId: string;
  /** Aktif disposition; aktif kayıt yoksa null. */
  disposition: 'MANAGED' | 'TOP_LEVEL' | null;
  /** MANAGED ise amir; TOP_LEVEL veya kayıtsız ise null. */
  managerUserId: string | null;
}

export interface AuthorityHierarchyTelemetryRecord {
  correlationId: string;
  tenantId: string;
  actorUserId: string;
  incumbentVerdict: IncumbentAuthorityVerdict;
  incumbentReasonCode: string;
  incumbentCapacity: string;
  hierarchyDisposition: HierarchyDispositionClass;
  comparison: TelemetryComparison;
  /** Yalnız `UNCOMPARABLE` iken dolu. */
  uncomparableReason?: UncomparableReason;
  /** Yalnız gözlem bağlamı; karşılaştırmaya girmedi. */
  observedActionCode?: string;
  /** Bu katmanın erişimi değiştirmediğini kaydın kendisinde görünür kılar. */
  accessAffected: false;
  /** Bu katmanın hiçbir kararı etkilemediğini kaydın kendisinde görünür kılar. */
  decisionAffected: false;
}

/**
 * TELEMETRİ EŞLEŞME KONVANSİYONU — POLİTİKA DEĞİL.
 *
 * Bu fonksiyon "hiyerarşi ne karar verirdi" DEMEZ. Yalnız, iki bağımsız
 * sınıflandırmanın hangi çiftinin "aynı sınıf" sayılacağını sabitler; çıktısı bir
 * `boolean`'dır ve hiçbir authorization tipi taşımaz. Owner kararı gereği bu
 * konvansiyondan bir yetki sonucu TÜRETİLEMEZ.
 */
function isSameClass(
  disposition: 'TOP_LEVEL' | 'MANAGED',
  incumbentVerdict: IncumbentAuthorityVerdict,
): boolean {
  return (
    (disposition === 'TOP_LEVEL' && incumbentVerdict === 'SELF_AUTHORITY') ||
    (disposition === 'MANAGED' && incumbentVerdict === 'REQUIRES_APPROVAL')
  );
}

/**
 * Yürürlükteki karar sınıfı ile hiyerarşi sınıfını KARŞILAŞTIRIR.
 *
 * KARAR DÖNDÜRMEZ. Çağıran bu sonucu authorization girdisi olarak KULLANAMAZ;
 * kayıt bunu `accessAffected: false` + `decisionAffected: false` ile taşır.
 */
export function compareAuthorityWithHierarchyTelemetry(
  input: AuthorityHierarchyTelemetryInput,
  facts: ActorHierarchyFacts,
): AuthorityHierarchyTelemetryRecord {
  const base = {
    correlationId: input.correlationId,
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    incumbentVerdict: input.incumbentVerdict,
    incumbentReasonCode: input.incumbentReasonCode,
    incumbentCapacity: input.incumbentCapacity,
    ...(input.observedActionCode !== undefined
      ? { observedActionCode: input.observedActionCode }
      : {}),
    accessAffected: false as const,
    decisionAffected: false as const,
  };
  const dispositionClass: HierarchyDispositionClass = facts.disposition ?? 'MISSING_HIERARCHY';

  // 1) Tenant sınırı her şeyin önünde: başka tenant'taki bir aktörün hiyerarşi
  //    sınıfı bu tenant'ın ölçümüyle karşılaştırılamaz.
  if (facts.actorTenantId !== input.tenantId) {
    return {
      ...base,
      hierarchyDisposition: dispositionClass,
      comparison: 'UNCOMPARABLE',
      uncomparableReason: 'CROSS_TENANT',
    };
  }

  // 2) Pasif aktör: sınıflandırma güncel değil, karşılaştırma anlamsız.
  if (!facts.actorIsActive) {
    return {
      ...base,
      hierarchyDisposition: dispositionClass,
      comparison: 'UNCOMPARABLE',
      uncomparableReason: 'ACTOR_INACTIVE',
    };
  }

  // 3) Aktif kayıt yok: SESSİZCE bir sınıfa SAYILMAZ, ayrı ve açık bir sonuç.
  if (facts.disposition === null) {
    return {
      ...base,
      hierarchyDisposition: 'MISSING_HIERARCHY',
      comparison: 'UNCOMPARABLE',
      uncomparableReason: 'MISSING_HIERARCHY',
    };
  }

  // 4) Sınıf denkliği. Burada üretilen tek şey SAME/DIFFERENT — yetki sonucu DEĞİL.
  return {
    ...base,
    hierarchyDisposition: facts.disposition,
    comparison: isSameClass(facts.disposition, input.incumbentVerdict)
      ? 'SAME_CLASS'
      : 'DIFFERENT_CLASS',
  };
}

export interface AuthorityHierarchyTelemetryEvent {
  eventType: 'OFFICE_CAP02_AUTHORITY_HIERARCHY_TELEMETRY';
  correlationId: string;
  tenantId: string;
  actorUserId: string;
  incumbentVerdict: IncumbentAuthorityVerdict;
  incumbentReasonCode: string;
  incumbentCapacity: string;
  hierarchyDisposition: HierarchyDispositionClass;
  comparison: TelemetryComparison;
  uncomparableReason?: UncomparableReason;
  observedActionCode?: string;
  /** Çağıran verir; sistem saati bu modülde okunmaz. */
  observedAt: string;
  accessAffected: false;
  decisionAffected: false;
}

/**
 * Kaydı, belirli bir audit implementasyonuna bağlı OLMAYAN düz bir olaya çevirir.
 * İsim/e-posta/serbest metin TAŞIMAZ — yalnız kimlikler ve kapalı-küme kodlar.
 */
export function toAuthorityHierarchyTelemetryEvent(
  record: AuthorityHierarchyTelemetryRecord,
  observedAt: string,
): AuthorityHierarchyTelemetryEvent {
  return {
    eventType: 'OFFICE_CAP02_AUTHORITY_HIERARCHY_TELEMETRY',
    correlationId: record.correlationId,
    tenantId: record.tenantId,
    actorUserId: record.actorUserId,
    incumbentVerdict: record.incumbentVerdict,
    incumbentReasonCode: record.incumbentReasonCode,
    incumbentCapacity: record.incumbentCapacity,
    hierarchyDisposition: record.hierarchyDisposition,
    comparison: record.comparison,
    ...(record.uncomparableReason !== undefined
      ? { uncomparableReason: record.uncomparableReason }
      : {}),
    ...(record.observedActionCode !== undefined
      ? { observedActionCode: record.observedActionCode }
      : {}),
    observedAt,
    accessAffected: false,
    decisionAffected: false,
  };
}
