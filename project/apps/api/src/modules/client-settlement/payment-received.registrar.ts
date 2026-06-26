import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ActionHandlerService } from '../icrabot/v28-engine/action-handler.service';
import { CollectionDispositionService } from './collection-disposition.service';

/**
 * TM3 M1 — PAYMENT_RECEIVED handler kaydı.
 *
 * D2 kararı: generic outbox cron/retry/dead-letter platform'undur; bu modül YALNIZ
 * 'EVENT_PUBLISHED:PAYMENT_RECEIVED' handler'ını register eder. Domain logic
 * client-settlement'tadır (action-handler core'a domain logic KONMAZ). Buraya @Cron EKLENMEZ —
 * processPendingActions tetiklemesi platform/icrabot tarafının işi (outbox ADR). Bu modül
 * merge edilince handler hazır+register'lıdır; CANLI tüketim platform cron'u inince aktive olur.
 */
@Injectable()
export class PaymentReceivedRegistrar implements OnModuleInit {
  private readonly logger = new Logger(PaymentReceivedRegistrar.name);

  constructor(
    private readonly actionHandler: ActionHandlerService,
    private readonly dispositionService: CollectionDispositionService,
  ) {}

  onModuleInit(): void {
    this.actionHandler.register(
      'EVENT_PUBLISHED:PAYMENT_RECEIVED',
      async (payload, caseId) =>
        this.dispositionService.createDraftFromPaymentReceived(payload, caseId),
    );
    this.logger.log(
      'Registered handler: EVENT_PUBLISHED:PAYMENT_RECEIVED → CollectionDisposition draft',
    );
  }
}
