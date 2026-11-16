import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ClientAccountingSummary, ClientCaseBreakdownItem } from './client-settlement-read.service';

export const NATIVE_SUMMARY_UNAVAILABLE = 'CLIENT_ACCOUNTING_NATIVE_SUMMARY_UNAVAILABLE';

export type ClientAccountingNativeGroup = Omit<ClientAccountingSummary, 'paraBirimiDurumu' | 'caseBreakdown'> & {
  caseBreakdown: Array<Omit<ClientCaseBreakdownItem, 'paraBirimiKapsami'> & { currency: string }>;
};

export interface ClientAccountingNativeSummary {
  clientId: string;
  asOf: string;
  source: 'LEGACY_PROJECTION';
  primarySwitchUnchanged: true;
  groups: ClientAccountingNativeGroup[];
}

/** This read never repairs, retags or converts an unproven monetary source. */
export function nativeSummaryUnavailable(): never {
  throw new ConflictException({ code: NATIVE_SUMMARY_UNAVAILABLE, message: 'Genel cari özeti hesaplanamadı; kaynak para birimi veya bağı doğrulanamadı.' });
}

/** Preserve the existing uppercase three-letter stored currency contract, without query-time retagging. */
export function nativeSummaryCurrency(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) nativeSummaryUnavailable();
  return value;
}

export function assertNativeSummaryMoney(group: ClientAccountingNativeGroup): void {
  const amounts: unknown[] = [...Object.values(group.clientScoped), ...Object.values(group.caseScopedContext)];
  for (const row of group.caseBreakdown) {
    for (const key of ['payableNet', 'paidToClient', 'expenseRequested', 'expensePaid', 'expenseUnpaid',
      'offsetPayableApplied', 'offsetExpenseApplied', 'debtorCollection', 'pendingDistribution',
      'allocationHeld', 'pendingDistributionExcludingHeld', 'advanceBalance'] as const) amounts.push(row[key]);
  }
  for (const amount of amounts) {
    if (typeof amount !== 'string') nativeSummaryUnavailable();
    try { if (!new Prisma.Decimal(amount).isFinite()) nativeSummaryUnavailable(); }
    catch { nativeSummaryUnavailable(); }
  }
}
