import { Injectable } from '@nestjs/common';
import { AccountingJournalCutoverReadinessService } from '../accounting-journal/accounting-journal-cutover-readiness.service';
import type { AccountingJournalCutoverCandidateReadScope } from '../accounting-journal/accounting-journal-cutover-readiness.types';
import {
  ClientSettlementReadService,
  type ClientMovementsOptions,
  type ClientMovementsResult,
} from './client-settlement-read.service';
import { ClientAccountingJournalMovementsReaderService } from './client-accounting-journal-movements-reader.service';
import {
  type ClientAccountingMovementsReadMode,
  resolveClientAccountingMovementsReadMode,
  shouldAttemptJournalClientAccountingMovements,
} from './client-accounting-movements-read-mode';

const CLIENT_ACCOUNTING_MOVEMENTS_SCOPE: AccountingJournalCutoverCandidateReadScope['scope'] =
  'CLIENT_ACCOUNTING_MOVEMENTS_CLIENT_SPECIFIC';

export type ClientAccountingMovementsReadSource =
  | 'LEGACY_PROJECTION'
  | 'ACCOUNTING_JOURNAL';

export type ClientAccountingMovementsFallbackReason =
  | 'READ_MODE_DISABLED'
  | 'UNSUPPORTED_SCOPE_GROUP'
  | 'CUTOVER_READINESS_SCOPE_MISSING'
  | 'CUTOVER_READINESS_BLOCKED'
  | 'CUTOVER_READINESS_NOT_READY';

export interface ClientAccountingMovementsReadResult extends ClientMovementsResult {
  source: ClientAccountingMovementsReadSource;
  readMode: ClientAccountingMovementsReadMode;
  fallbackReason: ClientAccountingMovementsFallbackReason | null;
}

@Injectable()
export class ClientAccountingMovementsReadService {
  constructor(
    private readonly legacyRead: ClientSettlementReadService,
    private readonly journalReader: ClientAccountingJournalMovementsReaderService,
    private readonly cutoverReadiness: AccountingJournalCutoverReadinessService,
  ) {}

  async getClientAccountingMovements(
    tenantId: string,
    clientId: string,
    opts: ClientMovementsOptions = {},
  ): Promise<ClientAccountingMovementsReadResult> {
    const readMode = resolveClientAccountingMovementsReadMode();
    if (!shouldAttemptJournalClientAccountingMovements(readMode)) {
      return this.legacy(tenantId, clientId, opts, readMode, 'READ_MODE_DISABLED');
    }

    if (opts.group === 'CASE_CONTEXT') {
      return this.legacy(tenantId, clientId, opts, readMode, 'UNSUPPORTED_SCOPE_GROUP');
    }

    const readiness = await this.cutoverReadiness.getCutoverReadiness({
      tenantId,
      currency: opts.currency || 'TRY',
      ...(opts.scope === 'case' && opts.caseId ? { caseId: opts.caseId } : {}),
      ...(opts.from ? { postedFrom: opts.from } : {}),
      ...(opts.to ? { postedTo: opts.to } : {}),
    });
    const candidate = readiness.candidateScopes.find(
      (scope) => scope.scope === CLIENT_ACCOUNTING_MOVEMENTS_SCOPE,
    );

    if (!candidate) {
      return this.legacy(tenantId, clientId, opts, readMode, 'CUTOVER_READINESS_SCOPE_MISSING');
    }

    if (candidate.candidateStatus === 'BLOCKED') {
      return this.legacy(tenantId, clientId, opts, readMode, 'CUTOVER_READINESS_BLOCKED');
    }

    if (readMode === 'enforce' && candidate.candidateStatus !== 'READY') {
      return this.legacy(tenantId, clientId, opts, readMode, 'CUTOVER_READINESS_NOT_READY');
    }

    const result = await this.journalReader.getMovements(tenantId, clientId, opts);
    return {
      ...result,
      source: 'ACCOUNTING_JOURNAL',
      readMode,
      fallbackReason: null,
    };
  }

  private async legacy(
    tenantId: string,
    clientId: string,
    opts: ClientMovementsOptions,
    readMode: ClientAccountingMovementsReadMode,
    fallbackReason: ClientAccountingMovementsFallbackReason,
  ): Promise<ClientAccountingMovementsReadResult> {
    const result = await this.legacyRead.getClientAccountingMovements(tenantId, clientId, opts);
    return {
      ...result,
      source: 'LEGACY_PROJECTION',
      readMode,
      fallbackReason,
    };
  }
}
