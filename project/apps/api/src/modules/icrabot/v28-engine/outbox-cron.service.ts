import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ActionHandlerService } from './action-handler.service';
import {
  getIcrabotOutboxBatchSize,
  isIcrabotOutboxCronEnabled,
} from './outbox.constants';

/**
 * Icrabot v28 outbox platform cron'u.
 *
 * Domain handler'ları client-settlement gibi modüllerde register edilir; bu servis yalnızca
 * generic IcrabotOutboxAction tüketimini tetikler.
 */
@Injectable()
export class OutboxCronService {
  private readonly logger = new Logger(OutboxCronService.name);
  private running = false;

  constructor(private readonly actionHandlerService: ActionHandlerService) {}

  /**
   * Pending ve retryable outbox action'ları işler.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * /// - Nest ScheduleModule → @Cron(EVERY_MINUTE) platform outbox tüketimi
   * /// </remarks>
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processOutboxActions(): Promise<void> {
    if (!isIcrabotOutboxCronEnabled()) return;

    if (this.running) {
      this.logger.warn('[outbox-cron] previous run still active, skipping');
      return;
    }

    this.running = true;
    try {
      const limit = getIcrabotOutboxBatchSize();
      const pending = await this.actionHandlerService.processPendingActions(limit);
      const retryable = await this.actionHandlerService.processRetryableActions(limit);

      if (pending.length > 0 || retryable.length > 0) {
        this.logger.log(
          `[outbox-cron] processed pending=${pending.length}, retryable=${retryable.length}`,
        );
      }
    } finally {
      this.running = false;
    }
  }
}
