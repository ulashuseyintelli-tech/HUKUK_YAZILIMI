/**
 * OFFICE-P2-CAP02-AUTHORIZATION-SHADOW — TASARIM + SAF ÇEKİRDEK.
 *
 *   STEP 11  OFFICE-P2-CAP02-AUTHORIZATION-SHADOW-DESIGN-R01
 *   STEP 11  OFFICE-P2-CAP02-AUTHORIZATION-SHADOW-I01
 *
 * SHADOW, ReportingLine authorization graph'ının canlıda NE KARAR VERECEĞİNİ, hiçbir
 * erişimi değiştirmeden ölçer. Yürürlükteki (legacy) authorization sonucu tek gerçek
 * karardır; bu katman yalnız onunla ReportingLine-türevli sonucu KARŞILAŞTIRIR.
 *
 * MİMARİ İLKE — bu dosya Prisma/NestJS import ETMEZ, DB'ye erişemez, sistem saati ve
 * `fs` kullanmaz. Erişimi değiştirebilecek hiçbir yüzeye dokunamaz: `compare()` yalnız
 * bir KARŞILAŞTIRMA KAYDI döndürür, karar döndürmez.
 *
 * TASARIM KARARLARI
 *  1. Legacy karar OTORİTEDİR. SHADOW hiçbir koşulda "doğrusu bu" demez; yalnız
 *     uyuşmazlığı sınıflandırır ve kanıt üretir.
 *  2. `MISSING_HIERARCHY` sessizce DENY sayılmaz — ayrı ve açık bir sınıftır. Population
 *     tamamlanmadan alınan ölçümlerin çoğu bu sınıfa düşer; bunu allow/deny gürültüsüne
 *     karıştırmak enforcement kararını yanıltır.
 *  3. Global-access istisnaları (ör. ADMIN) ayrı sınıflandırılır; hiyerarşi kapsamı
 *     hesaplanmadan geçilen erişimler "false allow" olarak raporlanmaz.
 *  4. Audit kanıtı PROVIDER-NEUTRAL'dır: belirli bir audit implementasyonuna bağlı
 *     değildir (bkz. DEP-03 daraltması, decision-log 2026-07-28).
 */

// ---------------------------------------------------------------------------
// Girdi
// ---------------------------------------------------------------------------

export type AuthorizationDecision = 'ALLOW' | 'DENY';

/** Global erişim gerekçesi; hiyerarşiden BAĞIMSIZ olarak erişim veren yol. */
export type GlobalAccessReason = 'ADMIN_ROLE' | 'SELF_ACCESS' | 'SYSTEM_INTERNAL';

export interface ShadowEvaluationInput {
  /** Opak korelasyon kimliği; kişisel veri taşımaz. */
  correlationId: string;
  tenantId: string;
  /** Erişimi isteyen principal (User id). */
  subjectUserId: string;
  /** Erişilmek istenen kaydın sahibi/aktörü (User id). null = hedef bir aktöre bağlı değil. */
  targetActorUserId: string | null;
  /** Yürürlükteki authorization'ın verdiği KARAR — tek gerçek karar. */
  legacyDecision: AuthorizationDecision;
  /** Legacy kararın global-access yolundan geldiği belliyse. */
  globalAccessReason?: GlobalAccessReason | null;
}

/** ReportingLine tarafındaki ilgili gerçekler (snapshot; DB'ye erişim yok). */
export interface HierarchyFacts {
  subjectIsActive: boolean;
  subjectTenantId: string;
  targetIsActive: boolean;
  targetTenantId: string;
  /**
   * subject, target'ın aktif ReportingLine zincirinde (doğrudan veya dolaylı) amir mi.
   * null = subject veya target için AKTİF ReportingLine kaydı YOK (hiyerarşi eksik).
   */
  subjectManagesTarget: boolean | null;
  /** target'ın kendi disposition'ı; aktif kaydı yoksa null. */
  targetDisposition: 'MANAGED' | 'TOP_LEVEL' | null;
}

// ---------------------------------------------------------------------------
// Çıktı
// ---------------------------------------------------------------------------

export type ShadowOutcome =
  /** Legacy ve hiyerarşi aynı kararda. */
  | 'MATCH'
  /** Hiyerarşi ALLOW derdi, legacy DENY — enforcement açılırsa YETKİ GENİŞLEMESİ olurdu. */
  | 'FALSE_ALLOW'
  /** Hiyerarşi DENY derdi, legacy ALLOW — enforcement açılırsa ERİŞİM KAYBI olurdu. */
  | 'FALSE_DENY'
  /** Aktif ReportingLine kaydı yok; karşılaştırma anlamlı değil. */
  | 'MISSING_HIERARCHY'
  /** Erişim global bir yoldan verildi; hiyerarşi kapsamı belirleyici değil. */
  | 'GLOBAL_ACCESS_EXCEPTION'
  /** Tenant sınırı ihlali; hiyerarşi her hâlükârda DENY der. */
  | 'CROSS_TENANT_DENIED';

export type ShadowSeverity = 'NONE' | 'INFO' | 'CRITICAL';

export interface ShadowComparisonRecord {
  correlationId: string;
  tenantId: string;
  legacyDecision: AuthorizationDecision;
  /** Hiyerarşi tek başına ne derdi; belirlenemiyorsa null. */
  hierarchyDecision: AuthorizationDecision | null;
  outcome: ShadowOutcome;
  severity: ShadowSeverity;
  /** İnsan-okur açıklama; kişisel veri TAŞIMAZ. */
  reason: string;
}

/**
 * SHADOW hiçbir erişimi değiştirmez: bu sabit, çağıranın kararı asla buradan
 * almayacağını kodda görünür kılar.
 */
export const SHADOW_NEVER_CHANGES_ACCESS = true as const;

/**
 * Tek bir erişim olayını karşılaştırır. KARAR DÖNDÜRMEZ — yalnız kanıt kaydı.
 */
export function compareShadowDecision(
  input: ShadowEvaluationInput,
  facts: HierarchyFacts,
): ShadowComparisonRecord {
  const base = {
    correlationId: input.correlationId,
    tenantId: input.tenantId,
    legacyDecision: input.legacyDecision,
  };

  // 1) Tenant sınırı her şeyin önünde: hiyerarşi cross-tenant erişimi asla vermez.
  const crossTenant =
    facts.subjectTenantId !== input.tenantId ||
    (input.targetActorUserId !== null && facts.targetTenantId !== input.tenantId);
  if (crossTenant) {
    return {
      ...base,
      hierarchyDecision: 'DENY',
      outcome: 'CROSS_TENANT_DENIED',
      severity: input.legacyDecision === 'ALLOW' ? 'CRITICAL' : 'NONE',
      reason:
        input.legacyDecision === 'ALLOW'
          ? 'legacy ALLOW verdi fakat subject/target tenant siniri disinda — kritik'
          : 'tenant siniri disinda; her iki taraf da DENY',
    };
  }

  // 2) Global-access yolu: hiyerarşi kapsamı belirleyici değil.
  if (input.globalAccessReason) {
    return {
      ...base,
      hierarchyDecision: null,
      outcome: 'GLOBAL_ACCESS_EXCEPTION',
      severity: 'INFO',
      reason: `erisim global yoldan verildi (${input.globalAccessReason}); hiyerarsi kapsami belirleyici degil`,
    };
  }

  // 3) Pasif principal: hiyerarşi DENY der.
  if (!facts.subjectIsActive || (input.targetActorUserId !== null && !facts.targetIsActive)) {
    const who = !facts.subjectIsActive ? 'subject' : 'target';
    return {
      ...base,
      hierarchyDecision: 'DENY',
      outcome: input.legacyDecision === 'ALLOW' ? 'FALSE_DENY' : 'MATCH',
      severity: input.legacyDecision === 'ALLOW' ? 'CRITICAL' : 'NONE',
      reason: `${who} pasif; hiyerarsi DENY der`,
    };
  }

  // 4) Hiyerarşi eksik: sessizce DENY SAYILMAZ, ayrı sınıf.
  if (facts.subjectManagesTarget === null || facts.targetDisposition === null) {
    return {
      ...base,
      hierarchyDecision: null,
      outcome: 'MISSING_HIERARCHY',
      severity: 'INFO',
      reason: 'aktif ReportingLine kaydi yok; karsilastirma anlamli degil',
    };
  }

  // 5) Asıl karşılaştırma.
  const hierarchyDecision: AuthorizationDecision = facts.subjectManagesTarget ? 'ALLOW' : 'DENY';
  if (hierarchyDecision === input.legacyDecision) {
    return {
      ...base,
      hierarchyDecision,
      outcome: 'MATCH',
      severity: 'NONE',
      reason: 'legacy ve hiyerarsi ayni kararda',
    };
  }
  if (hierarchyDecision === 'ALLOW') {
    return {
      ...base,
      hierarchyDecision,
      outcome: 'FALSE_ALLOW',
      severity: 'CRITICAL',
      reason: 'hiyerarsi ALLOW derdi fakat legacy DENY — enforcement yetki genisletirdi',
    };
  }
  return {
    ...base,
    hierarchyDecision,
    outcome: 'FALSE_DENY',
    severity: 'CRITICAL',
    reason: 'hiyerarsi DENY derdi fakat legacy ALLOW — enforcement erisim kaybettirirdi',
  };
}

// ---------------------------------------------------------------------------
// Kanıt toplama
// ---------------------------------------------------------------------------

export interface ShadowEvidenceSummary {
  total: number;
  byOutcome: Record<ShadowOutcome, number>;
  criticalCount: number;
  /** MISSING_HIERARCHY ve GLOBAL_ACCESS_EXCEPTION dışındaki, gerçekten karşılaştırılabilen olaylar. */
  comparableTotal: number;
  falseAllowRate: number;
  falseDenyRate: number;
  /** Owner acceptance gate: cross-tenant false allow = 0 ve kritik uyuşmazlık = 0. */
  acceptanceGatePass: boolean;
}

const ZERO: Record<ShadowOutcome, number> = {
  MATCH: 0,
  FALSE_ALLOW: 0,
  FALSE_DENY: 0,
  MISSING_HIERARCHY: 0,
  GLOBAL_ACCESS_EXCEPTION: 0,
  CROSS_TENANT_DENIED: 0,
};

export function summarizeShadowEvidence(
  records: ReadonlyArray<ShadowComparisonRecord>,
): ShadowEvidenceSummary {
  const byOutcome: Record<ShadowOutcome, number> = { ...ZERO };
  for (const r of records) byOutcome[r.outcome] += 1;

  const comparableTotal = byOutcome.MATCH + byOutcome.FALSE_ALLOW + byOutcome.FALSE_DENY;
  const criticalCount = records.filter((r) => r.severity === 'CRITICAL').length;
  const rate = (n: number) => (comparableTotal === 0 ? 0 : n / comparableTotal);

  return {
    total: records.length,
    byOutcome,
    criticalCount,
    comparableTotal,
    falseAllowRate: rate(byOutcome.FALSE_ALLOW),
    falseDenyRate: rate(byOutcome.FALSE_DENY),
    acceptanceGatePass: criticalCount === 0,
  };
}

// ---------------------------------------------------------------------------
// Provider-neutral audit olayı
// ---------------------------------------------------------------------------

export interface ShadowAuditEvent {
  eventType: 'OFFICE_CAP02_AUTHORIZATION_SHADOW_COMPARISON';
  correlationId: string;
  tenantId: string;
  legacyDecision: AuthorizationDecision;
  hierarchyDecision: AuthorizationDecision | null;
  outcome: ShadowOutcome;
  severity: ShadowSeverity;
  /** Çağıran verir; sistem saati bu modülde okunmaz. */
  observedAt: string;
  /** SHADOW'un erişimi değiştirmediğini olayın kendisinde görünür kılar. */
  accessAffected: false;
}

/**
 * Karşılaştırma kaydını, belirli bir audit implementasyonuna bağlı OLMAYAN düz bir
 * olaya çevirir. Kişisel veri veya kimlik alanı TAŞIMAZ (yalnız opak correlationId).
 */
export function toShadowAuditEvent(
  record: ShadowComparisonRecord,
  observedAt: string,
): ShadowAuditEvent {
  return {
    eventType: 'OFFICE_CAP02_AUTHORIZATION_SHADOW_COMPARISON',
    correlationId: record.correlationId,
    tenantId: record.tenantId,
    legacyDecision: record.legacyDecision,
    hierarchyDecision: record.hierarchyDecision,
    outcome: record.outcome,
    severity: record.severity,
    observedAt,
    accessAffected: false,
  };
}
