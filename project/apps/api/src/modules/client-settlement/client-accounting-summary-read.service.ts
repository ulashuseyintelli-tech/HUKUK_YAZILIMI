import { Injectable } from '@nestjs/common';
import { AccountingJournalCutoverReadinessService } from '../accounting-journal/accounting-journal-cutover-readiness.service';
import type { AccountingJournalCutoverCandidateReadScope } from '../accounting-journal/accounting-journal-cutover-readiness.types';
import {
  ClientSettlementReadService,
  type ClientAccountingSummary,
} from './client-settlement-read.service';
import {
  type ClientAccountingMovementsReadMode,
  resolveClientAccountingMovementsReadMode,
  shouldAttemptJournalClientAccountingMovements,
} from './client-accounting-movements-read-mode';

const CLIENT_ACCOUNTING_SUMMARY_SCOPE: AccountingJournalCutoverCandidateReadScope['scope'] =
  'CLIENT_ACCOUNTING_SUMMARY';

export type ClientAccountingSummaryReadSource = 'LEGACY_PROJECTION';

export type ClientAccountingSummaryFallbackReason =
  | 'READ_MODE_DISABLED'
  | 'CUTOVER_READINESS_SCOPE_MISSING'
  | 'CUTOVER_READINESS_BLOCKED'
  | 'CUTOVER_READINESS_SHADOW_ONLY'
  | 'JOURNAL_SUMMARY_READER_MISSING';

export interface ClientAccountingSummaryReadDecision {
  data: ClientAccountingSummary;
  source: ClientAccountingSummaryReadSource;
  readMode: ClientAccountingMovementsReadMode;
  fallbackReason: ClientAccountingSummaryFallbackReason;
  primarySwitchUnchanged: true;
}

@Injectable()
export class ClientAccountingSummaryReadService {
  constructor(
    private readonly legacyRead: ClientSettlementReadService,
    private readonly cutoverReadiness: AccountingJournalCutoverReadinessService,
  ) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientAccountingController.summary() -> GET /clients/:clientId/accounting/summary (fallback-safe summary read gate).
  /// - ClientAccountingSummaryReadService.getClientAccountingSummaryReadDecision() -> response shape korunarak legacy summary unwrap eder.
  /// </remarks>
  async getClientAccountingSummary(
    tenantId: string,
    clientId: string,
    currency = 'TRY',
  ): Promise<ClientAccountingSummary> {
    const decision = await this.getClientAccountingSummaryReadDecision(tenantId, clientId, currency);
    return decision.data;
  }

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ACCT-CUTOVER-3E4B2E1 tests -> summary read-mode/fallback contract kaniti.
  /// </remarks>
  async getClientAccountingSummaryReadDecision(
    tenantId: string,
    clientId: string,
    currency = 'TRY',
  ): Promise<ClientAccountingSummaryReadDecision> {
    const readMode = resolveClientAccountingMovementsReadMode();

    if (!shouldAttemptJournalClientAccountingMovements(readMode)) {
      return this.legacy(tenantId, clientId, currency, readMode, 'READ_MODE_DISABLED');
    }

    const readiness = await this.cutoverReadiness.getCutoverReadiness({ tenantId, currency });
    const candidate = readiness.candidateScopes.find(
      (scope) => scope.scope === CLIENT_ACCOUNTING_SUMMARY_SCOPE,
    );

    if (!candidate) {
      return this.legacy(tenantId, clientId, currency, readMode, 'CUTOVER_READINESS_SCOPE_MISSING');
    }

    if (candidate.candidateStatus === 'BLOCKED') {
      return this.legacy(tenantId, clientId, currency, readMode, 'CUTOVER_READINESS_BLOCKED');
    }

    if (candidate.candidateStatus === 'SHADOW_ONLY') {
      return this.legacy(tenantId, clientId, currency, readMode, 'CUTOVER_READINESS_SHADOW_ONLY');
    }

    return this.legacy(tenantId, clientId, currency, readMode, 'JOURNAL_SUMMARY_READER_MISSING');
  }

  private async legacy(
    tenantId: string,
    clientId: string,
    currency: string,
    readMode: ClientAccountingMovementsReadMode,
    fallbackReason: ClientAccountingSummaryFallbackReason,
  ): Promise<ClientAccountingSummaryReadDecision> {
    const data = await this.legacyRead.getClientAccountingSummary(tenantId, clientId, currency);
    return {
      data,
      source: 'LEGACY_PROJECTION',
      readMode,
      fallbackReason,
      primarySwitchUnchanged: true,
    };
  }
}