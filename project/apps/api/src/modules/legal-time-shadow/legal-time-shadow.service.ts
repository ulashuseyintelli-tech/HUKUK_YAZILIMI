import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { WorkflowStage } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { LegalDeadlineService } from "../legal-deadline/legal-deadline.service";

/**
 * MPB-028(a) PR-3 — Shadow-Read + Diff Evidence.
 *
 * Bu servis:
 * - tamamen READ-ONLY'dir; hiçbir consumer/scheduler/workflow/UI/NotificationQueue
 *   yazma yolunu değiştirmez veya tetiklemez,
 * - `legalTimeShadow` feature flag'i KAPALIYKEN (varsayılan) hiçbir şey yapmaz —
 *   legacy davranış birebir korunur,
 * - `LegalDeadlineService.calculateDeadline`'ı ÇAĞIRMAZ (o bir LegalDeadlineSnapshot
 *   satırı yazar); yalnız yeni eklenen read-only `resolveLegalServiceDateForTebligat`'ı
 *   kullanır,
 * - `WorkflowEngine`, `Scheduler`, `NotificationQueue` yazma yolu, `UI`, `Automation`,
 *   `Case Status`, `LegalStatus`, `Finalization` dosyalarının HİÇBİRİNİ import etmez
 *   veya değiştirmez — legacy hesap burada bağımsız olarak yeniden okunur.
 */

const SHADOW_CALCULATION_VERSION = "legal-time-shadow-v1";
const LEGACY_SOURCE = "WORKFLOW_ENGINE_NOTIFICATION_QUEUE";
const CANONICAL_SOURCE = "LEGAL_DEADLINE_SERVICE";
const LEGACY_APPLICABLE_STAGES: WorkflowStage[] = [
  WorkflowStage.PAYMENT_ORDER,
  WorkflowStage.WAITING_RESPONSE,
];

export interface ComputeShadowDiffInput {
  tenantId: string;
  tebligatId: string;
}

interface LegacyResolution {
  legacyDate: Date | null;
  applicable: boolean;
}

@Injectable()
export class LegalTimeShadowService {
  private readonly logger = new Logger(LegalTimeShadowService.name);

  constructor(
    private prisma: PrismaService,
    private legalDeadlineService: LegalDeadlineService,
  ) {}

  /**
   * Feature flag: `legalTimeShadow`. Varsayılan KAPALI (yalnız ortam değişkeni açıkça
   * "true" ise açık) — bu, henüz production'da hiç doğrulanmamış yeni bir mekanizma
   * olduğu için bilinçli bir tercihtir (mevcut repo'daki `SIMULATION_ENABLED`
   * deseninin tersi: o zaten aktif bir özelliği geçici kapatmak için "varsayılan açık,
   * yalnız false ise kapalı").
   */
  isShadowEnabled(): boolean {
    return process.env.LEGAL_TIME_SHADOW_ENABLED === "true";
  }

  /**
   * Legacy (WorkflowEngine.calculateNextActionTime'ın PAYMENT_ORDER/WAITING_RESPONSE
   * dalının bağımsız replikası) ile canonical (LegalDeadlineService) hesabı arasındaki
   * farkı ölçüp immutable bir LegalTimeShadowDiff satırı oluşturur.
   *
   * Flag kapalıysa (varsayılan) hiçbir şey yapmaz, null döner — çağıran hiçbir
   * davranış farkı görmez, hiçbir satır yazılmaz.
   */
  async computeShadowDiff(input: ComputeShadowDiffInput) {
    if (!this.isShadowEnabled()) {
      return null;
    }

    const tebligat = await this.prisma.tebligat.findFirst({
      where: { id: input.tebligatId, tenantId: input.tenantId },
    });
    if (!tebligat) {
      throw new NotFoundException("Tebligat bulunamadı");
    }

    const legacy = await this.resolveLegacyDate(input.tenantId, tebligat.caseId);
    const canonicalResult = await this.legalDeadlineService.resolveLegalServiceDateForTebligat(
      input.tenantId,
      input.tebligatId,
    );
    const canonicalDate = canonicalResult?.legalServiceDate ?? null;

    const deltaDays = this.computeDeltaDays(legacy.legacyDate, canonicalDate);
    const reasonCode = this.resolveReasonCode(legacy, canonicalResult?.deadlineReasonCode ?? null);

    const created = await this.prisma.legalTimeShadowDiff.create({
      data: {
        tenantId: input.tenantId,
        caseId: tebligat.caseId,
        sourceTebligatId: tebligat.id,
        legacySource: LEGACY_SOURCE,
        canonicalSource: CANONICAL_SOURCE,
        legacyDate: legacy.legacyDate,
        canonicalDate,
        deltaDays,
        reasonCode,
        calculationVersion: SHADOW_CALCULATION_VERSION,
      },
    });

    this.logger.log(
      `LegalTimeShadowDiff oluşturuldu: tebligat=${tebligat.id}, delta=${deltaDays ?? "N/A"} gün, reason=${reasonCode}`,
    );

    return created;
  }

  /**
   * `WorkflowEngine.calculateNextActionTime`'ın PAYMENT_ORDER/WAITING_RESPONSE dalının
   * BİREBİR bağımsız replikası — `WorkflowEngine` sınıfı hiç import edilmez/çağrılmaz.
   *
   * ENFORCEMENT/SEIZURE gibi diğer aşamalarda WorkflowEngine NotificationQueue'yu hiç
   * okumaz, tamamen farklı ("bugünden +1/+7 gün") bir operasyonel hesap yapar — bu,
   * hukuki tebliğ tarihiyle karşılaştırılabilir değildir; bu durumda `applicable=false`
   * döner (tahmin/varsayım ÜRETİLMEZ).
   *
   * Sorgu, WorkflowEngine'in bilinen tip-filtresi eksikliğini KASITLI olarak korur
   * (bkz. legal-time-authority-rebase.md §2 "Ek not": include'da `type` filtresi yoktur,
   * PAYMENT_ORDER dışı bir DELIVERED bildirim de deadline hesabını tetikleyebilir).
   * Shadow-diff'in amacı gerçek legacy davranışını ölçmektir; "düzeltilmiş" bir sorgu
   * kullanmak delta'yı yanlış temsil eder.
   */
  private async resolveLegacyDate(tenantId: string, caseId: string): Promise<LegacyResolution> {
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { workflowStage: true },
    });

    if (!caseData || !LEGACY_APPLICABLE_STAGES.includes(caseData.workflowStage)) {
      return { legacyDate: null, applicable: false };
    }

    const notifications = await this.prisma.notificationQueue.findMany({
      where: { caseId, case: { tenantId }, status: "DELIVERED" },
      orderBy: { deliveredAt: "desc" },
      take: 1,
    });

    return { legacyDate: notifications[0]?.deliveredAt ?? null, applicable: true };
  }

  private computeDeltaDays(legacyDate: Date | null, canonicalDate: Date | null): number | null {
    if (!legacyDate || !canonicalDate) {
      return null;
    }
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.round((canonicalDate.getTime() - legacyDate.getTime()) / msPerDay);
  }

  private resolveReasonCode(legacy: LegacyResolution, canonicalReasonCode: string | null): string {
    if (!legacy.applicable) {
      return "LEGACY_NOT_APPLICABLE_WORKFLOW_STAGE";
    }
    if (canonicalReasonCode) {
      return canonicalReasonCode;
    }
    return legacy.legacyDate ? "CANONICAL_UNRESOLVED" : "NO_LEGACY_DATA";
  }

  /**
   * Evidence Report: birikmiş LegalTimeShadowDiff kayıtlarını özetler.
   *
   * Owner Decision 7 (delta category): bu servis hiçbir hukuki/severity kategorisi
   * (SMALL/MEDIUM/LARGE vb.) ÜRETMEZ — "2 gün kambiyo takibinde kritik, ilamsızda
   * değil" gibi eşik kararları owner/hukuk kararıdır, teknik katmanın kararı DEĞİLDİR.
   * Yalnız ham `deltaDays` sayısı taşınır.
   *
   * Owner Decision 8 (evidence completeness): bu metod hiçbir sayfalama/ilk-N limiti
   * UYGULAMAZ — tenant'a ait TÜM kayıtları döner. Filtreleme (ilk 10/100/tarih
   * aralığı vb.) UI veya raporlama katmanının sorumluluğudur, servis katmanının değil.
   *
   * Tamamen read-only; hiçbir mutasyon yapmaz, hiçbir karar mekanizmasını etkilemez.
   */
  async buildEvidenceReport(tenantId: string) {
    const rows = await this.prisma.legalTimeShadowDiff.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });

    const zeroDelta = rows.filter((r) => r.deltaDays === 0);
    const nonZeroDelta = rows.filter((r) => r.deltaDays !== null && r.deltaDays !== 0);
    const unresolved = rows.filter((r) => r.deltaDays === null);

    return {
      totalCount: rows.length,
      zeroDeltaCount: zeroDelta.length,
      nonZeroDeltaCount: nonZeroDelta.length,
      unresolvedCount: unresolved.length,
      records: rows,
    };
  }
}
