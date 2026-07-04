export const ACCOUNTING_JOURNAL_PRIMARY_READ_MODE_ENV = 'ACCOUNTING_JOURNAL_PRIMARY_READ_MODE';

export type ClientAccountingMovementsReadMode = 'disabled' | 'shadow' | 'pilot' | 'enforce';

export function resolveClientAccountingMovementsReadMode(
  env: NodeJS.ProcessEnv = process.env,
): ClientAccountingMovementsReadMode {
  const value = env[ACCOUNTING_JOURNAL_PRIMARY_READ_MODE_ENV]?.trim().toLowerCase();
  if (value === 'shadow' || value === 'pilot' || value === 'enforce') return value;
  return 'disabled';
}

export function shouldAttemptJournalClientAccountingMovements(
  mode: ClientAccountingMovementsReadMode,
): boolean {
  return mode === 'shadow' || mode === 'pilot' || mode === 'enforce';
}
