/**
 * v28 Action Feedback Service
 * 
 * Action sonuçlarını FactStore'a yazan feedback sistemi.
 * Python v28_policy_feedback/engine_v28/actions_feedback/writer.py'den port edildi.
 * 
 * Feedback Facts:
 * - actions.<action_type>.last_status = done/failed/dead
 * - actions.<action_type>.last_action_id
 * - actions.<action_type>.last_result (optional JSON)
 * - actions.last.success_at / last.fail_at timestamps
 * 
 * Callback Endpoint:
 * - POST /api/icrabot/v28/actions/callback
 *   External systems (payment gateway, email provider webhooks, etc.)
 *   can write "outcome facts" back into FactStore + timeline.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { FactStoreService } from './factstore.service';
import { TimelineService } from './timeline.service';
import { resolveTenantIdOrThrow } from './tenant-resolver';

export interface CallbackPayload {
  case_id: string;
  kind: string;
  data?: Record<string, any>;
}

@Injectable()
export class ActionFeedbackService {
  private readonly logger = new Logger(ActionFeedbackService.name);

  constructor(
    private readonly factStore: FactStoreService,
    private readonly timeline: TimelineService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * External callback'i işler (Python ActionCallbackView)
   */
  async processCallback(payload: CallbackPayload): Promise<{ ok: boolean; caseId: string; facts: Record<string, any> }> {
    const { case_id, kind, data = {} } = payload;

    // External callback path'i: tenantId hiç context'te yok (case_id dış HTTP body'den) →
    // boundary'de TEK SEFER caseId→tenant resolution (fail-closed: case yoksa throw, null yazma).
    const tenantId = await resolveTenantIdOrThrow(this.prisma, case_id);

    // Add timeline entry for callback
    await this.timeline.addEntry({
      caseId: case_id,
      tenantId,
      type: 'OUTCOME',
      title: `Callback: ${kind}`,
      severity: 'info',
      body: payload,
      source: 'system',
    });

    // Write callback data to FactStore
    const facts: Record<string, any> = {
      [`actions.callback.${kind}`]: data,
      [`actions.callback.${kind}.received_at`]: new Date().toISOString(),
    };

    await this.factStore.write(
      case_id,
      facts,
      {},
      { source: 'callback', kind },
    );

    this.logger.log(`Callback processed: ${kind} for case ${case_id}`);

    return { ok: true, caseId: case_id, facts };
  }

  /**
   * Belirli bir action type için son feedback'i getirir
   */
  async getLastFeedback(caseId: string, actionType: string): Promise<{
    status: string | null;
    actionId: string | null;
    result: any;
    successAt: string | null;
    failAt: string | null;
  }> {
    const snapshot = await this.factStore.getSnapshot(caseId);
    const { facts } = snapshot;

    return {
      status: facts[`actions.${actionType}.last_status`] || null,
      actionId: facts[`actions.${actionType}.last_action_id`] || null,
      result: facts[`actions.${actionType}.last_result`] || null,
      successAt: facts[`actions.${actionType}.last_success_at`] || null,
      failAt: facts[`actions.${actionType}.last_fail_at`] || null,
    };
  }

  /**
   * Tüm action feedback'lerini getirir
   */
  async getAllFeedbacks(caseId: string): Promise<Record<string, {
    status: string | null;
    actionId: string | null;
    result: any;
    successAt: string | null;
    failAt: string | null;
  }>> {
    const snapshot = await this.factStore.getSnapshot(caseId);
    const { facts } = snapshot;

    const feedbacks: Record<string, any> = {};
    const actionTypes = new Set<string>();

    // Extract action types from facts
    for (const key of Object.keys(facts)) {
      const match = key.match(/^actions\.([^.]+)\.last_status$/);
      if (match) {
        actionTypes.add(match[1]);
      }
    }

    // Build feedback objects
    for (const actionType of actionTypes) {
      if (actionType === 'last' || actionType === 'callback') continue;
      
      feedbacks[actionType] = {
        status: facts[`actions.${actionType}.last_status`] || null,
        actionId: facts[`actions.${actionType}.last_action_id`] || null,
        result: facts[`actions.${actionType}.last_result`] || null,
        successAt: facts[`actions.${actionType}.last_success_at`] || null,
        failAt: facts[`actions.${actionType}.last_fail_at`] || null,
      };
    }

    return feedbacks;
  }

  /**
   * Callback geçmişini getirir
   */
  async getCallbackHistory(caseId: string): Promise<Record<string, any>> {
    const snapshot = await this.factStore.getSnapshot(caseId);
    const { facts } = snapshot;

    const callbacks: Record<string, any> = {};

    for (const [key, value] of Object.entries(facts)) {
      if (key.startsWith('actions.callback.') && !key.endsWith('.received_at')) {
        const kind = key.replace('actions.callback.', '');
        callbacks[kind] = {
          data: value,
          receivedAt: facts[`actions.callback.${kind}.received_at`] || null,
        };
      }
    }

    return callbacks;
  }

  /**
   * Son global action durumunu getirir
   */
  async getLastGlobalStatus(caseId: string): Promise<{
    status: string | null;
    successAt: string | null;
    failAt: string | null;
  }> {
    const snapshot = await this.factStore.getSnapshot(caseId);
    const { facts } = snapshot;

    return {
      status: facts['actions.last.status'] || null,
      successAt: facts['actions.last.success_at'] || null,
      failAt: facts['actions.last.fail_at'] || null,
    };
  }
}
