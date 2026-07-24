/**
 * DEBTOR-OF01-HISTORY-P04-C-I01 — EVENT_PUBLISHED:SERVICE_OCCURRENCE_RECORDED outbox tüketicisi.
 *
 * Akış: outbox payload -> ServiceOccurrenceRecordedEventAccessor.loadCanonicalPayload() (P04-A2,
 * tenant-scoped canonical event, ZATEN VAR) -> objectionPeriodDays'i ProceedingClassificationService
 * + legal-period-rule-matrix.ts (MPB-028(a) PR-3C, ZATEN VAR) üzerinden çöz (asla tahmin/hardcode/
 * default/payload-injection değil, yalnız mevcut kanonik kaynak; çözülemezse fail-closed) ->
 * ServiceOccurrenceDeadlineCalculationService.calculateForOccurrence() (P04-B/P04-B-R2, ZATEN VAR,
 * DEĞİŞTİRİLMEDİ). Yeni event contract / yeni outbox tablo / yeni scheduler / yeni retry sistemi
 * YOK — mevcut transactional outbox + mevcut calculator yeniden kullanılır (owner brief §REQUIRED).
 * calculateForOccurrence'ın kendi idempotency sözleşmesi (aynı occurrence+version+aynı çıktı ->
 * no-op) sayesinde bu consumer'ın kendi başına ayrı bir dedup/idempotency mantığı YOKTUR — outbox'ın
 * mevcut retry/at-least-once teslimatı zaten bu şekilde güvenli hale gelir.
 *
 * LegalPeriodCalculationService.computeCanonicalLegalPeriod() bilerek KULLANILMAZ: o metod AYRICA
 * legalDeadlineService.resolveLegalServiceDateForTebligat() çağırır (Tebligat tabanlı, tamamen
 * farklı bir legalServiceDate hesaplaması) — burada yalnız objectionPeriodDays gerekir, ilgisiz bir
 * bağımlılık eklemek yanlış-UNRESOLVED riski taşır. Bunun yerine ProceedingClassificationService +
 * resolveLegalPeriodRule() doğrudan compose edilir (owner brief §PRECONDITION, §PROHIBITED —
 * duplicate lookup değil, farklı amaçlı ikinci bir okuma).
 */
import { Injectable, Logger } from "@nestjs/common";
import type { ActionHandlerContext } from "../../icrabot/v28-engine/action-handler.service";
import { ServiceOccurrenceRecordedEventAccessor } from "./service-occurrence-recorded-event.accessor";
import { ObjectionPeriodDaysUnresolvedError } from "./service-occurrence-recorded-consumer.errors";
import {
  ProceedingClassificationService,
  ProceedingClassification,
} from "../../legal-deadline/proceeding-classification.service";
import { resolveLegalPeriodRule } from "../../legal-deadline/legal-period-rule-matrix";
import {
  ServiceOccurrenceDeadlineCalculationService,
  CALCULATION_VERSION,
} from "../../legal-deadline/service-occurrence-deadline-calculation.service";

@Injectable()
export class ServiceOccurrenceRecordedConsumerService {
  private readonly logger = new Logger(ServiceOccurrenceRecordedConsumerService.name);

  constructor(
    private readonly accessor: ServiceOccurrenceRecordedEventAccessor,
    private readonly proceedingClassificationService: ProceedingClassificationService,
    private readonly calculationService: ServiceOccurrenceDeadlineCalculationService,
  ) {}

  /**
   * ActionHandler imzasıyla uyumlu (payload, caseId, context) — ServiceOccurrenceRecordedRegistrar
   * tarafından 'EVENT_PUBLISHED:SERVICE_OCCURRENCE_RECORDED' için register edilir.
   */
  async handle(
    payload: Record<string, unknown>,
    caseId: string,
    context?: ActionHandlerContext,
  ): Promise<void> {
    const tenantId = context?.tenantId;
    if (!tenantId) {
      throw new Error("ServiceOccurrenceRecordedConsumerService.handle: context.tenantId eksik");
    }

    const canonicalPayload = await this.accessor.loadCanonicalPayload(payload, tenantId);
    const objectionPeriodDays = await this.resolveObjectionPeriodDays(tenantId, caseId);

    await this.calculationService.calculateForOccurrence({
      tenantId,
      serviceOccurrenceId: canonicalPayload.serviceOccurrenceId,
      calculationVersion: CALCULATION_VERSION,
      objectionPeriodDays,
    });

    this.logger.log(
      `ServiceOccurrenceRecorded consumed: serviceOccurrenceId=${canonicalPayload.serviceOccurrenceId} tenantId=${tenantId}`,
    );
  }

  /**
   * objectionPeriodDays'i YALNIZ kanonik kaynaktan çözer (legal-period-rule-matrix.ts, PR-3C).
   * Üç fail-closed durum: (1) ProceedingClassificationService UNRESOLVED döner (proceedingType
   * boş — sınıflandırılmamış dosya), (2) resolveLegalPeriodRule bu (proceedingType, subTypeCode)
   * kombinasyonu için kural bulamaz (PLEDGE/MORTGAGE/bare-EVICTION/PUBLIC_RECEIVABLE gibi
   * bilinçli-dışlanmış türler), (3) kural bulunur ama objectionDays alanı null'dur (örn. bazı
   * JUDGMENT_ENFORCEMENT alt türleri). Her üçünde de ObjectionPeriodDaysUnresolvedError — asla
   * tahmin edilmiş bir sayı üretilmez, asla varsayılan/sabit değere düşülmez.
   */
  private async resolveObjectionPeriodDays(tenantId: string, caseId: string): Promise<number> {
    const classification: ProceedingClassification | null =
      await this.proceedingClassificationService.resolveProceedingClassification(tenantId, caseId);
    if (!classification) {
      throw new ObjectionPeriodDaysUnresolvedError(
        "Case.proceedingType boş (sınıflandırılmamış dosya)",
      );
    }

    const ruleKey = classification.subTypeCode
      ? `${classification.proceedingType}:${classification.subTypeCode}`
      : classification.proceedingType;

    const rule = resolveLegalPeriodRule(classification.proceedingType, classification.subTypeCode);
    if (!rule) {
      throw new ObjectionPeriodDaysUnresolvedError(`${ruleKey} için kanonik süre kuralı yok`);
    }
    if (rule.objectionDays === null) {
      throw new ObjectionPeriodDaysUnresolvedError(`${ruleKey} kuralında objectionDays yok`);
    }

    return rule.objectionDays;
  }
}
