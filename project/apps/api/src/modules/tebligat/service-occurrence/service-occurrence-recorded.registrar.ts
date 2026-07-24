import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ActionHandlerService } from "../../icrabot/v28-engine/action-handler.service";
import { ServiceOccurrenceRecordedConsumerService } from "./service-occurrence-recorded.consumer";

/**
 * DEBTOR-OF01-HISTORY-P04-C-I01 — EVENT_PUBLISHED:SERVICE_OCCURRENCE_RECORDED handler kaydı.
 *
 * PaymentReversedRegistrar (client-settlement) emsali: bu registrar YALNIZ handler register eder,
 * domain logic ServiceOccurrenceRecordedConsumerService'tedir (action-handler core'a domain logic
 * KONMAZ). Generic outbox cron/retry/dead-letter platform'undur; bu dosya @Cron EKLEMEZ,
 * OutboxCronService/ActionHandlerService retry algoritmasını DEĞİŞTİRMEZ.
 *
 * Bu registrar merge edilince SERVICE_OCCURRENCE_RECORDED action'ları artık no-handler poison'a
 * düşmez (ActionHandlerService.dispatch: handler bulunamazsa pending kalır) — tüketilir.
 */
@Injectable()
export class ServiceOccurrenceRecordedRegistrar implements OnModuleInit {
  private readonly logger = new Logger(ServiceOccurrenceRecordedRegistrar.name);

  constructor(
    private readonly actionHandler: ActionHandlerService,
    private readonly consumerService: ServiceOccurrenceRecordedConsumerService,
  ) {}

  onModuleInit(): void {
    this.actionHandler.register(
      "EVENT_PUBLISHED:SERVICE_OCCURRENCE_RECORDED",
      async (payload, caseId, context) => this.consumerService.handle(payload, caseId, context),
    );
    this.logger.log(
      "Registered handler: EVENT_PUBLISHED:SERVICE_OCCURRENCE_RECORDED → LegalDeadlineSnapshot calculateForOccurrence",
    );
  }
}
