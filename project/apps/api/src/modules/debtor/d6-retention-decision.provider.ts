import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * DBND-D6-RETENTION-POLICY (owner-locked, bkz `docs/design/d6-legal-semantics-triage.md` Q2
 * + owner GO-ANALYZE kararları 2026-07-05): D6A-2 (`DebtorCrossCaseNotification`) kayıtlarının
 * ne zaman silinebileceğine dair kararı verir. Bu sınıf KENDİSİ HİÇBİR SABİT SÜRE İÇERMEZ —
 * tüm eşikler (`resolvedRetentionDays`/`caseClosureBufferDays`/`hardCeilingDays`) tenant-scoped
 * `SystemConfig` kaydından (key=`D6_RETENTION_POLICY_KEY`) okunur. Resmi bir politika
 * (`enabled: true`) girilmeden HİÇBİR kayıt "silinebilir" sayılmaz (fail-closed) — bu, büroda
 * henüz resmi bir KVKK Saklama ve İmha Politikası yokken hiçbir şeyin silinmemesini garanti eder.
 *
 * KAPSAM (D6-RETENTION-POLICY-INFRA GO-IMPLEMENT, owner-locked 2026-07-05):
 * - YAPILAN: policy okuma + saf eligibility kararı.
 * - YAPILMAYAN: deleteMany/delete, cron, scheduler wiring, migration, schema değişikliği,
 *   AuditLog değişikliği, UI. Bunların hiçbiri bu dosyada YOK.
 */

export const D6_RETENTION_POLICY_KEY = "d6_retention_policy";

export interface D6RetentionPolicy {
  enabled: boolean;
  /** acknowledgedAt/expiredAt'ten itibaren gün sayısı. null = bu boyut yapılandırılmadı. */
  resolvedRetentionDays: number | null;
  /** İlgili (affectedCase) kapandıktan sonra ek tampon gün sayısı. null = bu boyut yapılandırılmadı. */
  caseClosureBufferDays: number | null;
  /** createdAt'ten itibaren azami tavan gün sayısı — case durumundan bağımsız kesin üst sınır. */
  hardCeilingDays: number | null;
}

export interface D6RetentionEligibilityInput {
  status: "ACKNOWLEDGED" | "EXPIRED";
  acknowledgedAt: Date | null;
  expiredAt: Date | null;
  createdAt: Date;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

@Injectable()
export class D6RetentionDecisionProvider {
  constructor(private readonly prisma: PrismaService) {}

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - (ileride) NotificationRetentionService.deleteEligibleNotifications() (henüz yazılmadı —
  ///   bu GO-IMPLEMENT'in kapsamı dışında, ayrı bir faz)
  /// </remarks>
  async getPolicy(tenantId: string): Promise<D6RetentionPolicy | null> {
    const config = await this.prisma.systemConfig.findFirst({
      where: { tenantId, key: D6_RETENTION_POLICY_KEY },
    });
    if (!config) {
      return null;
    }

    const value = config.value as Record<string, unknown> | null;
    if (!value || value.enabled !== true) {
      return null;
    }

    return {
      enabled: true,
      resolvedRetentionDays: typeof value.resolvedRetentionDays === "number" ? value.resolvedRetentionDays : null,
      caseClosureBufferDays: typeof value.caseClosureBufferDays === "number" ? value.caseClosureBufferDays : null,
      hardCeilingDays: typeof value.hardCeilingDays === "number" ? value.hardCeilingDays : null,
    };
  }

  /**
   * Saf karar fonksiyonu — hiçbir DB erişimi yapmaz, hiçbir silme yapmaz. Yalnız
   * `true`/`false` döner: "şu an eligible mi".
   *
   * Kurallar (owner-locked 2026-07-05, S2-S4):
   * - `policy.enabled=false` → HER ZAMAN false.
   * - `hardCeilingDays` yapılandırılmışsa VE geçilmişse → diğer her şeyden BAĞIMSIZ true
   *   (KVKK'nin azami sınırı — case açık kalsa bile sonsuz saklamayı önler).
   * - `caseClosureBufferDays` yapılandırılmış AMA case henüz kapanmamışsa → bu boyut BLOKE
   *   EDER (henüz geçilmiş bir tarih yok) — resolvedRetentionDays tek başına yeterli SAYILMAZ.
   *   (Not: case'in kendi kapanış zaman damgası şemada yok; bu ilk fazda `resolvedAt`
   *   tampon hesabının başlangıcı olarak kullanılıyor — case gerçek kapanış tarihi ileride
   *   eklenirse bu yaklaşım iyileştirilebilir.)
   * - Hem `resolvedRetentionDays` hem `caseClosureBufferDays` (case kapalıyken) yapılandırılmışsa
   *   → "hangisi UZUNSA" (owner FAZ2 çerçevesi): İKİSİNİN DE eşiği geçilmiş olmalı.
   * - Yalnız biri yapılandırılmışsa → yalnız o boyut yeterlidir.
   * - Hiçbir boyut yapılandırılmamışsa (ve hard ceiling da geçilmediyse) → false (fail-closed).
   */
  isEligibleForDeletion(
    policy: D6RetentionPolicy,
    notification: D6RetentionEligibilityInput,
    affectedCaseClosed: boolean,
    now: Date
  ): boolean {
    if (!policy.enabled) {
      return false;
    }

    if (policy.hardCeilingDays !== null) {
      if (now >= addDays(notification.createdAt, policy.hardCeilingDays)) {
        return true;
      }
    }

    const resolvedAt = notification.status === "ACKNOWLEDGED" ? notification.acknowledgedAt : notification.expiredAt;
    if (resolvedAt === null) {
      return false;
    }

    const resolvedConfigured = policy.resolvedRetentionDays !== null;
    const caseClosureConfigured = policy.caseClosureBufferDays !== null;

    if (caseClosureConfigured && !affectedCaseClosed) {
      // Case-kapanış boyutu yapılandırılmış ama case hâlâ açık — bu boyut henüz "geçilmiş"
      // bir tarih üretemez, dolayısıyla BLOKE eder (resolvedRetentionDays tek başına yeterli
      // sayılmaz — owner'ın "hangisi uzunsa" ilkesi, kapanmamış bir case için sonsuza kadar
      // bekler; yalnız hard ceiling bunu geçersiz kılabilir).
      return false;
    }

    if (!resolvedConfigured && !caseClosureConfigured) {
      return false;
    }

    const candidateDates: Date[] = [];
    if (resolvedConfigured) {
      candidateDates.push(addDays(resolvedAt, policy.resolvedRetentionDays as number));
    }
    if (caseClosureConfigured) {
      candidateDates.push(addDays(resolvedAt, policy.caseClosureBufferDays as number));
    }

    const latestRequiredDate = candidateDates.reduce((latest, d) => (d > latest ? d : latest));
    return now >= latestRequiredDate;
  }
}
