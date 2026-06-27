import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ActionHandlerService } from '../icrabot/v28-engine/action-handler.service';
import { CollectionReversalService } from './collection-reversal.service';

/**
 * TM3 M1R — PAYMENT_REVERSED handler kaydı.
 *
 * M1 (PaymentReceivedRegistrar) ile SİMETRİK ama AYRI exact key kullanır:
 * 'EVENT_PUBLISHED:PAYMENT_REVERSED'. Registry tam-string ile dispatch eder → PAYMENT_RECEIVED
 * handler'ı ile ÇAKIŞMAZ ve onu DEĞİŞTİRMEZ. D2 kararı korunur: generic outbox cron/retry/
 * dead-letter platform'undur; bu modül YALNIZ handler register eder, domain logic
 * client-settlement servisindedir (action-handler core'a domain logic KONMAZ; @Cron EKLENMEZ).
 *
 * Bu registrar merge edilince PAYMENT_REVERSED için handler hazır+register'lıdır → CODEX S2
 * (cancel() içinde PAYMENT_REVERSED append) güvenle merge edilebilir: action artık no-handler
 * poison'a düşmez, tüketilir.
 */
@Injectable()
export class PaymentReversedRegistrar implements OnModuleInit {
  private readonly logger = new Logger(PaymentReversedRegistrar.name);

  constructor(
    private readonly actionHandler: ActionHandlerService,
    private readonly reversalService: CollectionReversalService,
  ) {}

  onModuleInit(): void {
    this.actionHandler.register(
      'EVENT_PUBLISHED:PAYMENT_REVERSED',
      async (payload, caseId, context) =>
        this.reversalService.reverseFromPaymentReversed(payload, caseId, context),
    );
    this.logger.log(
      'Registered handler: EVENT_PUBLISHED:PAYMENT_REVERSED → CollectionDisposition reverse/no-op',
    );
  }
}
